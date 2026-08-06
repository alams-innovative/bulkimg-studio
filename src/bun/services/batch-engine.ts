import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AppDatabase } from "../database";
import type { KeyVault } from "./key-vault";
import type { FxService } from "./fx-service";
import { OpenAIClient, OpenAIError, sanitizedError, type BatchObject } from "./openai-client";
import type { HistoryService } from "./history-service";
import type { PricingService } from "./pricing-service";
import type {
  CostEstimate, ImageTokenUsage, OutputFormatId, QualityTier, RunMode, SessionDetail, SessionStatus,
  SessionTelemetry, SubmitRunInput,
} from "../../shared/contracts";
import { APP_LIMITS } from "../../shared/contracts";
import { isOutputFormatId } from "../../shared/output-formats";
import { showNotification } from "./windows-native";
import type { DiagnosticLog } from "./diagnostics";

const DIRECT_LIMIT = APP_LIMITS.directPromptLimit;
const BATCH_LIMIT = APP_LIMITS.batchPromptLimit;
const DIRECT_CONCURRENCY = 2;
const REFERENCE_LIMIT = APP_LIMITS.maxReferences;
const REFERENCE_LIMIT_BYTES = APP_LIMITS.maxReferenceBytes;
const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TERMINAL = new Set<SessionStatus>(["partial", "completed", "failed", "cancelled"]);
const REMOTE_TERMINAL = new Set(["completed", "failed", "expired", "cancelled"]);
const DOWNLOAD_RETRY_MS = 20_000;

export function chunkPrompts<T>(items: T[], waveSize: number): T[][] {
  if (!Number.isInteger(waveSize) || waveSize <= 0 || items.length <= waveSize) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += waveSize) chunks.push(items.slice(i, i + waveSize));
  return chunks;
}

export function planBatchWaves<T>(items: T[], strategy: "all" | "guided" | "parallel", waveSize: number, firstWaveSize = 10): T[][] {
  if (strategy === "all" || items.length <= firstWaveSize) return items.length ? [items] : [];
  if (strategy === "parallel") return chunkPrompts(items, waveSize);
  const first = items.slice(0, firstWaveSize);
  return [first, ...chunkPrompts(items.slice(firstWaveSize), waveSize)];
}

export function planCustomWaves<T>(items: T[], sizes: number[]): T[][] {
  if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size < 1) || sizes.reduce((total, size) => total + size, 0) !== items.length) {
    throw new Error("Wave sizes must be positive and cover every selected prompt exactly once.");
  }
  let offset = 0;
  return sizes.map((size) => { const wave = items.slice(offset, offset + size); offset += size; return wave; });
}

function validateInput(input: SubmitRunInput): SubmitRunInput {
  if (!input || typeof input !== "object" || !Array.isArray(input.prompts)) throw new Error("The generation request is invalid.");
  if (input.model !== "gpt-image-2") throw new Error("Only GPT Image 2 is supported.");
  if (input.mode !== "direct" && input.mode !== "batch") throw new Error("Choose Direct or Batch.");
  if (!isOutputFormatId(input.format)) throw new Error("Choose one of the four supported output formats.");
  if (!["low", "medium", "high"].includes(input.quality)) throw new Error("Choose Low, Medium, or High quality.");
  const limit = input.mode === "direct" ? DIRECT_LIMIT : BATCH_LIMIT;
  if (input.prompts.length < 1 || input.prompts.length > limit) {
    throw new Error(input.mode === "direct" ? "Direct mode only allows 4 prompts. Use Batch for more." : "Batch supports 1–1,000 prompts per wave.");
  }
  for (const prompt of input.prompts) {
    if (!prompt || typeof prompt.promptText !== "string" || !prompt.promptText.trim()) {
      throw new Error("Every prompt must contain text.");
    }
    if (prompt.promptText.length > APP_LIMITS.maxPromptChars) {
      throw new Error(`This prompt is too long (${APP_LIMITS.maxPromptChars.toLocaleString()} character max).`);
    }
    for (const value of [prompt.week, prompt.scheduleDate, prompt.themeColumn]) {
      if (typeof value !== "string" || value.length > 500) throw new Error("Prompt metadata is invalid.");
    }
  }
  if (input.referenceImageFileIds !== undefined) {
    if (!Array.isArray(input.referenceImageFileIds) || input.referenceImageFileIds.length > REFERENCE_LIMIT) {
      throw new Error(`You can attach at most ${REFERENCE_LIMIT} reference images.`);
    }
    if (input.referenceImageFileIds.some((fileId) => typeof fileId !== "string" || !fileId.trim() || fileId.length > 200)) {
      throw new Error("One of the reference images is invalid.");
    }
    if (new Set(input.referenceImageFileIds).size !== input.referenceImageFileIds.length) {
      throw new Error("Remove duplicate reference images before generating.");
    }
  }
  if (input.waveSize !== undefined && (!Number.isInteger(input.waveSize) || input.waveSize < 0 || input.waveSize > BATCH_LIMIT)) {
    throw new Error(`Wave size must be 0 (no split) or 1–${BATCH_LIMIT}.`);
  }
  if (input.waveSizes !== undefined && (!Array.isArray(input.waveSizes) || input.waveSizes.some((size) => !Number.isInteger(size) || size < 1 || size > BATCH_LIMIT) || input.waveSizes.reduce((total, size) => total + size, 0) !== input.prompts.length)) {
    throw new Error("Wave sizes must be positive and cover every selected prompt exactly once.");
  }
  return input;
}

function batchStatus(status: string, completed: number, failed: number, total: number): SessionStatus {
  if (status === "cancelled" || status === "cancelling") return "cancelled";
  if (status === "completed") return failed > 0 || completed < total ? "partial" : "completed";
  if (["failed", "expired"].includes(status)) return completed > 0 ? "partial" : "failed";
  return "processing";
}

export class BatchEngine {
  private nextKeyIndex = 0;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly polling = new Set<string>();
  private readonly finalizing = new Set<string>();
  private readonly manualPollAt = new Map<string, number>();
  private progressSink: ((telemetry: SessionTelemetry) => void) | null = null;
  private readonly referenceDirectory: string;
  private readonly batchesDirectory: string;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private readonly cancelledRuns = new Set<string>();
  private readonly activeRunWave = new Map<string, number>();
  private readonly terminalWaiters = new Map<string, Array<(status: SessionStatus) => void>>();
  private readonly runningWaveChains = new Set<string>();

  constructor(
    private readonly database: AppDatabase,
    private readonly keyVault: KeyVault,
    private readonly fx: FxService,
    private readonly history: HistoryService,
    private readonly pricing: PricingService,
    dataDirectory: string,
    private readonly diagnostics?: DiagnosticLog,
  ) {
    this.referenceDirectory = join(dataDirectory, "references");
    this.batchesDirectory = join(dataDirectory, "batches");
    mkdirSync(this.referenceDirectory, { recursive: true });
    mkdirSync(this.batchesDirectory, { recursive: true });
  }

  setProgressSink(sink: (telemetry: SessionTelemetry) => void): void { this.progressSink = sink; }

  startScheduler(): void {
    if (this.scheduler) return;
    this.scheduler = setInterval(() => void this.pollDueBatches(), 15_000);
    (this.scheduler as unknown as { unref?: () => void }).unref?.();
    void this.pollDueBatches();
    void this.recoverPendingWaveChains();
  }

  private noteRateHeaders(headers: { rateHeaders?: import("../../shared/contracts").RateLimitHeaderProbe | null } | null | undefined): void {
    if (headers?.rateHeaders) this.database.setHeaderProbe(headers.rateHeaders);
  }

  private emit(sessionId: string): SessionTelemetry {
    const telemetry = this.database.getTelemetry(sessionId);
    if (TERMINAL.has(telemetry.status)) this.resolveTerminalWaiters(sessionId, telemetry.status);
    try { this.progressSink?.(telemetry); } catch { /* webview may not be ready */ }
    return telemetry;
  }

  private resolveTerminalWaiters(sessionId: string, status: SessionStatus): void {
    const waiters = this.terminalWaiters.get(sessionId);
    if (!waiters?.length) return;
    this.terminalWaiters.delete(sessionId);
    for (const resolve of waiters) resolve(status);
  }

  /** Resolves when session reaches a terminal status, or run is cancelled. Safety net polls every 1s. */
  private waitForSessionTerminal(sessionId: string, runId: string): Promise<SessionStatus> {
    const current = this.database.getTelemetry(sessionId).status;
    if (TERMINAL.has(current)) return Promise.resolve(current);
    if (this.cancelledRuns.has(runId) || this.database.isRunCancelled(runId)) return Promise.resolve("cancelled");

    return new Promise((resolve) => {
      let settled = false;
      const finish = (status: SessionStatus) => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        const list = this.terminalWaiters.get(sessionId);
        if (list) {
          const next = list.filter((fn) => fn !== onTerminal);
          if (next.length) this.terminalWaiters.set(sessionId, next);
          else this.terminalWaiters.delete(sessionId);
        }
        resolve(status);
      };
      const onTerminal = (status: SessionStatus) => finish(status);
      const bucket = this.terminalWaiters.get(sessionId) ?? [];
      bucket.push(onTerminal);
      this.terminalWaiters.set(sessionId, bucket);

      const timer = setInterval(() => {
        if (this.cancelledRuns.has(runId) || this.database.isRunCancelled(runId)) {
          finish("cancelled");
          return;
        }
        const status = this.database.getTelemetry(sessionId).status;
        if (TERMINAL.has(status)) finish(status);
      }, 1_000);
      (timer as unknown as { unref?: () => void }).unref?.();
    });
  }

  private sessionInputFromDb(sessionId: string): SubmitRunInput {
    const ctx = this.database.getSessionRunContext(sessionId);
    const prompts = this.database.getSessionPrompts(sessionId).map((prompt) => ({
      promptText: prompt.prompt_text,
      week: prompt.week,
      scheduleDate: prompt.schedule_date,
      themeColumn: prompt.theme_column,
    }));
    const tele = this.database.getTelemetry(sessionId);
    return {
      prompts,
      model: ctx.model,
      mode: ctx.runMode,
      format: ctx.format,
      quality: ctx.quality,
      ...(ctx.referenceFileIds.length ? { referenceImageFileIds: ctx.referenceFileIds } : {}),
      parentRunId: tele.parentRunId ?? undefined,
      waveIndex: tele.waveIndex ?? undefined,
      waveCount: tele.waveCount ?? undefined,
    };
  }

  private async withRotatingKey<T>(operation: (client: OpenAIClient, keyId: string) => Promise<T>): Promise<{ result: T; keyId: string }> {
    const keys = await this.keyVault.activeKeys();
    if (keys.length === 0) throw new Error("Add an active validated OpenAI API key before starting a run.");
    let lastError: unknown;
    for (let offset = 0; offset < keys.length; offset += 1) {
      const index = (this.nextKeyIndex + offset) % keys.length;
      const candidate = keys[index];
      if (!candidate) continue;
      try {
        const client = new OpenAIClient(candidate.key);
        const result = await operation(client, candidate.id);
        if (client.lastRateHeaders) this.database.setHeaderProbe(client.lastRateHeaders);
        this.nextKeyIndex = (index + 1) % keys.length;
        return { result, keyId: candidate.id };
      } catch (error) {
        lastError = error;
        if (!(error instanceof OpenAIError)) throw error;
        if (error.category === "rate_limit") {
          this.database.markRateLimited(candidate.id, error.retryAt ?? new Date(Date.now() + 60_000).toISOString());
          continue;
        }
        if (error.category === "auth") {
          this.database.setKeyActive(candidate.id, false);
          this.keyVault.invalidateKey(candidate.id);
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No API key is currently available.");
  }

  private usageCost(usage: ImageTokenUsage, mode: RunMode): number {
    return this.pricing.costFromUsage({ model: "gpt-image-2", mode, ...usage });
  }

  private outputPath(sessionId: string): string {
    return join(this.batchesDirectory, `${sessionId}-output.jsonl`);
  }

  async uploadReference(bytes: Uint8Array, filename: string, mimeType: string): Promise<{ fileId: string }> {
    const cleanName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!cleanName || cleanName.length > 180) throw new Error("Choose a reference image with a valid filename.");
    if (!REFERENCE_MIME_TYPES.has(mimeType)) throw new Error("Use PNG, JPEG, or WebP.");
    if (bytes.byteLength < 1 || bytes.byteLength > REFERENCE_LIMIT_BYTES) {
      throw new Error("Each reference can be up to 50 MB.");
    }
    const selected = await this.withRotatingKey((client) => client.uploadReferenceImage(bytes, cleanName, mimeType));
    const localPath = join(this.referenceDirectory, `${selected.result}-${cleanName}`);
    await Bun.write(localPath, bytes);
    this.database.cacheReferenceFile(selected.result, localPath, mimeType, selected.keyId);
    return { fileId: selected.result };
  }

  async removeReference(fileId: string): Promise<{ success: boolean }> {
    if (typeof fileId !== "string" || !fileId.trim() || fileId.length > 200) throw new Error("The reference image is invalid.");
    if (this.database.isReferenceInUse(fileId)) throw new Error("This reference is being used by an active session.");
    const cached = this.database.getReferenceFile(fileId);
    if (!cached) return { success: true };
    if (!cached.remote_deleted_at) await this.withRotatingKey((client) => client.deleteFile(fileId));
    const root = resolve(this.referenceDirectory).toLowerCase();
    const localPath = resolve(cached.local_path);
    if (localPath.toLowerCase().startsWith(`${root}\\`) && existsSync(localPath)) unlinkSync(localPath);
    this.database.deleteReferenceFile(fileId);
    return { success: true };
  }

  async submit(rawInput: SubmitRunInput): Promise<SessionTelemetry> {
    const base = validateInput(rawInput);
    for (const fileId of base.referenceImageFileIds ?? []) {
      if (!this.database.getReferenceFile(fileId)) throw new Error("Upload the missing reference image again before generating.");
    }
    const fxRate = await this.fx.getUsdPkrRate();
    const settingsWave = this.database.getAppSettings().waveSize;
    const waveSize = base.mode === "batch"
      ? (base.waveSize !== undefined ? base.waveSize : settingsWave)
      : 0;
    const strategy = base.mode === "batch" ? (base.waveStrategy ?? (waveSize ? "guided" : "all")) : "all";
    const firstWaveSize = Math.max(1, Math.min(base.prompts.length, base.firstWaveSize ?? this.database.getAppSettings().firstWaveSize));
    const waves = base.mode === "batch"
      ? (base.waveSizes?.length ? planCustomWaves(base.prompts, base.waveSizes) : planBatchWaves(base.prompts, strategy, waveSize || BATCH_LIMIT, firstWaveSize))
      : [base.prompts];
    const estimate = this.estimate({
      model: base.model, promptCount: base.prompts.length, mode: base.mode,
      quality: base.quality, format: base.format, referenceCount: base.referenceImageFileIds?.length ?? 0,
    }, fxRate);

    if (base.mode === "batch" && waves.length > 1) {
      const runId = base.parentRunId ?? crypto.randomUUID();
      if (!base.parentRunId) {
        this.database.createBatchRun({
          runId, model: base.model, mode: base.mode, format: base.format, quality: base.quality,
          waveSize, waveCount: waves.length, waveStrategy: strategy, totalPrompts: base.prompts.length,
          estimateUsd: estimate.costUsd, fxRate,
        });
      }
      this.cancelledRuns.delete(runId);
      const sessionIds: string[] = [];
      const waveInputs: SubmitRunInput[] = [];
      for (let index = 0; index < waves.length; index += 1) {
        const chunk = waves[index]!;
        const sessionId = crypto.randomUUID();
        const waveInput: SubmitRunInput = {
          ...base,
          prompts: chunk,
          parentRunId: runId,
          waveIndex: index,
          waveCount: waves.length,
          waveSize,
        };
        this.database.createSession(sessionId, waveInput, fxRate, {
          costUsd: this.pricing.estimateUsd({
            model: base.model, promptCount: chunk.length, mode: base.mode,
            quality: base.quality, format: base.format, referenceCount: base.referenceImageFileIds?.length ?? 0,
          }),
          pricingVersion: estimate.pricingVersion,
        }, { parentRunId: runId, waveIndex: index, waveCount: waves.length });
        if (index > 0) {
          this.database.updateSession(sessionId, {
            status: "pending",
            message: `Queued as batch ${index + 1} of ${waves.length}.`,
          });
        }
        sessionIds.push(sessionId);
        waveInputs.push(waveInput);
        void this.diagnostics?.write("session_created", {
          sessionId, parentRunId: runId, waveIndex: index, waveCount: waves.length,
          mode: base.mode, promptCount: chunk.length, referenceCount: base.referenceImageFileIds?.length ?? 0,
        });
      }
      this.activeRunWave.set(runId, 0);
      this.database.updateBatchRun(runId, { status: "processing", message: `Batch 1 of ${waves.length}` });
      if (strategy === "parallel") {
        for (let index = 0; index < sessionIds.length; index += 1) queueMicrotask(() => void this.submitRemoteBatch(sessionIds[index]!, waveInputs[index]!));
        this.database.updateBatchRun(runId, { status: "processing", message: `${waves.length} batches submitted together.` });
      } else {
        queueMicrotask(() => void this.runWaveChain(runId, sessionIds, waveInputs));
      }
      return this.emit(sessionIds[0]!);
    }

    const sessionId = crypto.randomUUID();
    const parentRunId = base.parentRunId ?? (base.mode === "batch" ? crypto.randomUUID() : undefined);
    if (parentRunId && !base.parentRunId && base.mode === "batch") {
      this.database.createBatchRun({
        runId: parentRunId, model: base.model, mode: base.mode, format: base.format, quality: base.quality,
        waveSize: 0, waveCount: 1, waveStrategy: "all", totalPrompts: base.prompts.length, estimateUsd: estimate.costUsd, fxRate,
      });
    }
    this.database.createSession(sessionId, base, fxRate, { costUsd: estimate.costUsd, pricingVersion: estimate.pricingVersion }, {
      parentRunId: parentRunId ?? null,
      waveIndex: base.waveIndex ?? (parentRunId ? 0 : null),
      waveCount: base.waveCount ?? (parentRunId ? 1 : null),
    });
    void this.diagnostics?.write("session_created", {
      sessionId, diagnosticId: this.database.getTelemetry(sessionId).diagnosticId,
      mode: base.mode, format: base.format, quality: base.quality,
      promptCount: base.prompts.length, referenceCount: base.referenceImageFileIds?.length ?? 0,
      parentRunId: parentRunId ?? null,
    });
    queueMicrotask(() => void (base.mode === "direct" ? this.runDirect(sessionId, base) : this.submitRemoteBatch(sessionId, base)));
    return this.emit(sessionId);
  }

  private async runWaveChain(runId: string, sessionIds: string[], waveInputs: SubmitRunInput[]): Promise<void> {
    if (this.runningWaveChains.has(runId)) return;
    this.runningWaveChains.add(runId);
    try {
      const nextIndex = sessionIds.findIndex((sessionId) => !TERMINAL.has(this.database.getTelemetry(sessionId).status));
      if (nextIndex === -1) {
        await this.reconcileRunStatus(runId);
        return;
      }
      for (let index = nextIndex; index <= nextIndex; index += 1) {
        if (this.cancelledRuns.has(runId) || this.database.isRunCancelled(runId)) break;
        const sessionId = sessionIds[index]!;
        const tele = this.database.getTelemetry(sessionId);
        this.activeRunWave.set(runId, index);
        const rolling = this.database.aggregateRunUsage(runId);
        this.database.updateBatchRun(runId, {
          status: "processing",
          message: `Running batch ${index + 1} of ${sessionIds.length}.`,
          completedCount: rolling.completed,
          costUsd: rolling.costUsd,
        });

        if (!TERMINAL.has(tele.status)) {
          if (!this.database.getExternalBatchId(sessionId)) {
            const input = waveInputs[index] ?? this.sessionInputFromDb(sessionId);
            await this.submitRemoteBatch(sessionId, input);
          }
          await this.waitForSessionTerminal(sessionId, runId);
        }

        if (this.cancelledRuns.has(runId) || this.database.isRunCancelled(runId)) break;
      }

      if (this.cancelledRuns.has(runId) || this.database.isRunCancelled(runId)) {
        for (const sessionId of sessionIds) {
          const status = this.database.getTelemetry(sessionId).status;
          if (status === "pending") {
            this.database.cancelOpenPrompts(sessionId);
            this.database.updateSession(sessionId, { status: "cancelled", message: "Cancelled before wave started." });
            this.emit(sessionId);
          }
        }
        const agg = this.database.aggregateRunUsage(runId);
        this.database.updateBatchRun(runId, {
          status: "cancelled", message: "Cancelled. Saved waves are kept.",
          completedCount: agg.completed, costUsd: agg.costUsd,
        });
        return;
      }

      const remaining = sessionIds.filter((sessionId) => !TERMINAL.has(this.database.getTelemetry(sessionId).status));
      if (remaining.length > 0) {
        const agg = this.database.aggregateRunUsage(runId);
        this.database.updateBatchRun(runId, {
          status: "processing",
          message: `Batch ${nextIndex + 1} is ready to review. Continue when you are ready for batch ${nextIndex + 2}.`,
          completedCount: agg.completed,
          costUsd: agg.costUsd,
        });
      } else {
        await this.reconcileRunStatus(runId);
      }
    } finally {
      this.runningWaveChains.delete(runId);
      this.activeRunWave.delete(runId);
    }
  }

  /** Remote batches are polled after restart; guided batches deliberately wait for Continue. */
  private async recoverPendingWaveChains(): Promise<void> {
    for (const run of this.database.listRuns()) {
      if (run.waveStrategy === "parallel" && ["processing", "pending"].includes(run.status)) {
        void this.reconcileRunStatus(run.runId);
      }
    }
  }

  async continueRun(runId: string): Promise<SessionTelemetry> {
    const run = this.database.getRunDetail(runId);
    if (!run) throw new Error("That run was not found.");
    if (run.waveStrategy !== "guided") throw new Error("Only guided batches need Continue.");
    const next = run.sessions.find((session) => session.status === "pending");
    if (!next) throw new Error("There is no next batch waiting to run.");
    const sessionIds = this.database.listSessionIdsForRun(runId);
    const input = this.sessionInputFromDb(next.sessionId);
    void this.diagnostics?.write("guided_batch_continue", { runId, sessionId: next.sessionId });
    void this.runWaveChain(runId, sessionIds, sessionIds.map((id) => id === next.sessionId ? input : this.sessionInputFromDb(id)));
    return this.emit(next.sessionId);
  }

  private async reconcileRunStatus(runId: string): Promise<void> {
    const sessions = this.database.listSessionIdsForRun(runId).map((id) => this.database.getTelemetry(id));
    if (!sessions.length) return;
    const agg = this.database.aggregateRunUsage(runId);
    if (sessions.some((session) => !TERMINAL.has(session.status))) {
      this.database.updateBatchRun(runId, { status: "processing", completedCount: agg.completed, costUsd: agg.costUsd });
      return;
    }
    const status: SessionStatus = sessions.every((session) => session.status === "cancelled")
      ? "cancelled"
      : sessions.some((session) => session.status !== "completed") || agg.failed > 0 ? "partial" : "completed";
    this.database.updateBatchRun(runId, {
      status,
      message: status === "completed" ? `Saved ${agg.completed} images.`
        : status === "cancelled" ? "Stopped. Saved images are kept."
          : `Saved ${agg.completed}; some prompts need attention.`,
      completedCount: agg.completed,
      costUsd: agg.costUsd,
    });
  }

  private async runDirect(sessionId: string, input: SubmitRunInput): Promise<void> {
    if (this.database.isSessionCancelled(sessionId)) return;
    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);
    this.database.setSessionPhase(sessionId, "generating", { submitted: true });
    this.database.updateSession(sessionId, { status: "processing", message: "Generating 0 of " + input.prompts.length + "." });
    this.emit(sessionId);
    const prompts = this.database.getSessionPrompts(sessionId);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        const prompt = prompts[index];
        if (!prompt || controller.signal.aborted || this.database.isSessionCancelled(sessionId)) return;
        if (!this.database.markPromptProcessing(prompt.prompt_id)) continue;
        try {
          const selected = await this.withRotatingKey((client) => client.generateOne(input, index, controller.signal));
          this.noteRateHeaders(selected.result);
          if (controller.signal.aborted || this.database.isSessionCancelled(sessionId)) return;
          this.database.assignSessionKey(sessionId, selected.keyId);
          const costUsd = this.usageCost(selected.result.tokenUsage, "direct");
          const saved = await this.history.persistDirect({
            sessionId, model: input.model, keyId: selected.keyId, prompt, result: selected.result, costUsd,
          });
          if (!saved && !this.database.isSessionCancelled(sessionId)) {
            this.database.failPrompt(prompt.prompt_id, {
              message: "OpenAI returned no image data.", category: "provider", httpStatus: null,
              requestId: selected.result.requestId, retryAt: null,
            });
          }
          this.database.recordKeyUsage(selected.keyId, {
            requests: 1, inputTokens: selected.result.inputTokens, outputTokens: selected.result.outputTokens,
            costUsd, costPkr: costUsd * this.database.getTelemetry(sessionId).fxRate,
          });
        } catch (error) {
          if (controller.signal.aborted || this.database.isSessionCancelled(sessionId)) return;
          this.database.failPrompt(prompt.prompt_id, sanitizedError(error));
        }
        const aggregate = this.database.aggregatePromptUsage(sessionId);
        this.database.updateSession(sessionId, {
          status: "processing", message: `Generated ${aggregate.completed} of ${input.prompts.length}.`,
          completedCount: aggregate.completed, inputTokens: aggregate.inputTokens,
          outputTokens: aggregate.outputTokens, costUsd: aggregate.costUsd,
        });
        this.emit(sessionId);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(DIRECT_CONCURRENCY, prompts.length) }, () => worker()));
      if (this.database.isSessionCancelled(sessionId)) return;
      const aggregate = this.database.aggregatePromptUsage(sessionId);
      const status: SessionStatus = aggregate.completed === input.prompts.length ? "completed" : aggregate.completed > 0 ? "partial" : "failed";
      this.database.setSessionPhase(sessionId, status === "completed" ? "done" : "error", { persistFinished: true });
      this.database.updateSession(sessionId, {
        status, message: status === "completed" ? `Saved ${aggregate.completed} images.` :
          status === "partial" ? `Saved ${aggregate.completed}; ${aggregate.failed} need retry.` : "No images were generated.",
        completedCount: aggregate.completed, inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens, costUsd: aggregate.costUsd,
      });
      this.emit(sessionId);
      void this.diagnostics?.write("direct_terminal", { sessionId, status, completed: aggregate.completed, failed: aggregate.failed, costUsd: aggregate.costUsd });
      void showNotification("BulkImg Studio", status === "completed" ? "Direct run completed." : "Direct run needs attention.");
      await this.cleanupRemoteReferences(sessionId);
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  private async submitRemoteBatch(sessionId: string, input: SubmitRunInput): Promise<void> {
    if (this.database.isSessionCancelled(sessionId)) return;
    try {
      this.database.setSessionPhase(sessionId, "waiting_batch", { submitted: true });
      const selected = await this.withRotatingKey((client) => client.submitBatch(input));
      if (this.database.isSessionCancelled(sessionId)) {
        void new OpenAIClient((await this.keyVault.keyById(selected.keyId)) ?? "").cancelBatch(selected.result.id).catch(() => undefined);
        return;
      }
      this.database.assignSessionKey(sessionId, selected.keyId);
      this.database.recordKeyUsage(selected.keyId, { requests: input.prompts.length });
      this.database.updateSession(sessionId, {
        status: "processing", message: "Batch submitted; status checks are running.",
        externalBatchId: selected.result.id, nextPollAt: new Date(Date.now() + 15_000).toISOString(), pollAttempts: 0,
      });
    } catch (error) {
      const safe = sanitizedError(error);
      void this.diagnostics?.write("batch_submit_error", { sessionId, ...safe });
      for (const prompt of this.database.getSessionPrompts(sessionId)) this.database.failPrompt(prompt.prompt_id, safe);
      this.database.setSessionPhase(sessionId, "error");
      this.database.updateSession(sessionId, { status: "failed", message: safe.message, lastError: safe });
      await this.cleanupRemoteReferences(sessionId);
    }
    this.emit(sessionId);
  }

  private async pollDueBatches(): Promise<void> {
    for (const sessionId of this.database.listActiveBatchSessionIds()) void this.poll(sessionId);
  }

  private pollAttempt(sessionId: string): number {
    return (this.database.db.query<{ poll_attempts: number }, [string]>(
      "SELECT poll_attempts FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId)?.poll_attempts ?? 0) + 1;
  }

  async poll(sessionId: string, force = false): Promise<SessionTelemetry> {
    const current = this.database.getTelemetry(sessionId);
    if (TERMINAL.has(current.status) || current.runMode !== "batch") return current;
    if (this.finalizing.has(sessionId)) return this.database.getTelemetry(sessionId);
    if (force) {
      const last = this.manualPollAt.get(sessionId) ?? 0;
      if (Date.now() - last < 10_000) return current;
      this.manualPollAt.set(sessionId, Date.now());
    }
    if (this.polling.has(sessionId)) return current;
    const externalId = this.database.getExternalBatchId(sessionId);
    if (!externalId) return current;
    this.polling.add(sessionId);
    try {
      const selected = await this.withRotatingKey((client) => client.getBatch(externalId));
      if (this.database.isSessionCancelled(sessionId)) return this.emit(sessionId);
      const batch = selected.result;
      this.database.assignSessionKey(sessionId, selected.keyId);

      if (!REMOTE_TERMINAL.has(batch.status)) {
        const counts = batch.request_counts;
        const completedRemote = counts?.completed ?? 0;
        const totalRemote = counts?.total ?? current.totalPrompts;
        const failedRemote = counts?.failed ?? 0;
        const attempt = this.pollAttempt(sessionId);
        const delay = Math.min(300_000, 15_000 * (2 ** Math.min(attempt, 4)));
        const failedSuffix = failedRemote > 0 ? ` (${failedRemote} failed)` : "";
        this.database.setSessionPhase(sessionId, "waiting_batch");
        this.database.updateSession(sessionId, {
          status: "processing",
          message: `OpenAI batch ${batch.status.replaceAll("_", " ")} · ${completedRemote}/${totalRemote} requests finished${failedSuffix}.`,
          completedCount: completedRemote,
          nextPollAt: new Date(Date.now() + delay).toISOString(),
          pollAttempts: attempt,
          lastError: null,
        });
        return this.emit(sessionId);
      }

      // Remote batch is terminal — download/persist runs in the background so RPC polls stay short.
      this.finalizing.add(sessionId);
      this.database.updateSession(sessionId, {
        status: "processing",
        message: batch.output_file_id
          ? "Batch completed; downloading results…"
          : "Batch finished; finalizing…",
        nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
        lastError: null,
      });
      this.emit(sessionId);
      void this.finalizeRemoteBatch(sessionId, batch, selected.keyId)
        .catch((error) => {
          const safe = sanitizedError(error);
          void this.diagnostics?.write("batch_finalize_error", { sessionId, ...safe });
          if (!this.database.isSessionCancelled(sessionId) && !TERMINAL.has(this.database.getTelemetry(sessionId).status)) {
            this.database.updateSession(sessionId, {
              status: "processing",
              message: "Batch finished; finalizing failed — retrying automatically.",
              lastError: safe,
              nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
            });
            this.emit(sessionId);
          }
        })
        .finally(() => { this.finalizing.delete(sessionId); });
    } catch (error) {
      if (!this.database.isSessionCancelled(sessionId)) {
        const safe = sanitizedError(error);
        void this.diagnostics?.write("batch_poll_error", { sessionId, ...safe });
        const retryAt = safe.retryAt ?? new Date(Date.now() + 60_000).toISOString();
        this.database.updateSession(sessionId, {
          status: "processing", message: "Status check deferred; retrying automatically.",
          lastError: safe, nextPollAt: retryAt,
        });
      }
    } finally {
      this.polling.delete(sessionId);
    }
    return this.emit(sessionId);
  }

  private async finalizeRemoteBatch(sessionId: string, batch: BatchObject, keyId: string): Promise<void> {
    if (this.database.isSessionCancelled(sessionId)) return;
    const current = this.database.getTelemetry(sessionId);
    const outputPath = this.outputPath(sessionId);

    if (batch.output_file_id) {
      void this.diagnostics?.write("batch_download_start", {
        sessionId, fileId: batch.output_file_id, remoteStatus: batch.status,
      });
      this.database.setSessionPhase(sessionId, "downloading", { remoteCompleted: true, downloadStarted: true });
      this.database.updateSession(sessionId, {
        status: "processing",
        message: "Batch completed; downloading results…",
        nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
      });
      this.emit(sessionId);

      try {
        await this.withRotatingKey((client) => client.downloadFileToPath(batch.output_file_id!, outputPath));
        this.database.setSessionPhase(sessionId, "saving", { downloadFinished: true });
        void this.diagnostics?.write("batch_download_ok", {
          sessionId, fileId: batch.output_file_id, bytes: existsSync(outputPath) ? statSync(outputPath).size : 0,
        });
      } catch (error) {
        const safe = sanitizedError(error);
        void this.diagnostics?.write("batch_download_error", { sessionId, fileId: batch.output_file_id, ...safe });
        this.database.updateSession(sessionId, {
          status: "processing",
          message: "Batch finished; download failed — retrying automatically.",
          lastError: safe,
          nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
        });
        this.emit(sessionId);
        return;
      }

      this.database.updateSession(sessionId, {
        status: "processing",
        message: "Saving images…",
        nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
        lastError: null,
      });
      this.emit(sessionId);

      const ctx = this.database.getSessionRunContext(sessionId);
      try {
        await this.history.persistBatchOutputFromFile(
          sessionId,
          ctx.model,
          keyId,
          outputPath,
          (usage) => this.usageCost(usage, "batch"),
          (progress) => {
            if (this.database.isSessionCancelled(sessionId)) return;
            const aggregate = this.database.aggregatePromptUsage(sessionId);
            this.database.updateSession(sessionId, {
              status: "processing",
              message: `Saving images… ${progress.saved + progress.failed} processed.`,
              completedCount: aggregate.completed,
              inputTokens: aggregate.inputTokens,
              outputTokens: aggregate.outputTokens,
              costUsd: aggregate.costUsd,
            });
            this.emit(sessionId);
            void this.diagnostics?.write("batch_persist_progress", {
              sessionId, saved: progress.saved, failed: progress.failed, malformed: progress.malformed,
            });
          },
        );
      } catch (error) {
        const safe = sanitizedError(error);
        void this.diagnostics?.write("batch_persist_error", { sessionId, ...safe });
        this.database.updateSession(sessionId, {
          status: "processing",
          message: "Batch finished; saving images failed — retrying automatically.",
          lastError: safe,
          nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
        });
        this.emit(sessionId);
        return;
      } finally {
        try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch { /* keep for retry if delete races */ }
      }
    }

    if (this.database.isSessionCancelled(sessionId)) return;

    const aggregateAfter = this.database.aggregatePromptUsage(sessionId);
    this.database.recordKeyUsage(keyId, {
      inputTokens: Math.max(0, aggregateAfter.inputTokens - current.inputTokens),
      outputTokens: Math.max(0, aggregateAfter.outputTokens - current.outputTokens),
      costUsd: Math.max(0, aggregateAfter.costUsd - current.costUsd),
      costPkr: Math.max(0, aggregateAfter.costUsd - current.costUsd) * current.fxRate,
    });

    if (["completed", "failed", "expired"].includes(batch.status)) {
      const missing = this.database.getSessionPrompts(sessionId).filter((item) => item.status !== "completed" && item.status !== "failed");
      const safe = {
        message: batch.errors?.data?.[0]?.message?.slice(0, 240) || "OpenAI returned no result for this prompt.",
        category: "provider" as const, httpStatus: null, requestId: null, retryAt: null,
      };
      for (const prompt of missing) this.database.failPrompt(prompt.prompt_id, safe);
    }
    if (["failed", "expired"].includes(batch.status)) {
      const safe = sanitizedError(new Error(batch.errors?.data?.[0]?.message || "The batch did not complete."));
      for (const prompt of this.database.getSessionPrompts(sessionId).filter((item) => item.status !== "completed")) {
        this.database.failPrompt(prompt.prompt_id, safe);
      }
    }

    const nextAggregate = this.database.aggregatePromptUsage(sessionId);
    const status = batchStatus(batch.status, nextAggregate.completed, nextAggregate.failed, current.totalPrompts);
    this.database.setSessionPhase(sessionId, TERMINAL.has(status) ? (status === "completed" ? "done" : "error") : "waiting_batch", {
      persistFinished: true, remoteCompleted: true,
    });
    this.database.updateSession(sessionId, {
      status,
      message: status === "processing" ? `Batch ${batch.status.replaceAll("_", " ")}; checking again automatically.` :
        status === "completed" ? `Saved ${nextAggregate.completed} images.` :
        status === "partial" ? `Saved ${nextAggregate.completed}; ${nextAggregate.failed} need retry.` :
        status === "cancelled" ? "Batch cancelled." : "Batch failed.",
      completedCount: nextAggregate.completed, inputTokens: nextAggregate.inputTokens,
      outputTokens: nextAggregate.outputTokens, costUsd: nextAggregate.costUsd,
      nextPollAt: null, lastError: null,
    });
    this.emit(sessionId);
    const parentRunId = this.database.getTelemetry(sessionId).parentRunId;
    if (parentRunId && TERMINAL.has(status)) {
      await this.reconcileRunStatus(parentRunId);
    }

    if (TERMINAL.has(status)) {
      void this.diagnostics?.write("batch_terminal", {
        sessionId, status, completed: nextAggregate.completed, failed: nextAggregate.failed, costUsd: nextAggregate.costUsd,
      });
      await this.cleanupRemoteReferences(sessionId);
      void showNotification("BulkImg Studio", status === "completed" ? "Batch completed." : "Batch needs attention.");
    }
  }

  getDetail(sessionId: string): SessionDetail {
    return { telemetry: this.database.getTelemetry(sessionId), prompts: this.database.listSessionPromptOutcomes(sessionId) };
  }

  async cancel(sessionId: string): Promise<SessionTelemetry> {
    const current = this.database.getTelemetry(sessionId);
    if (TERMINAL.has(current.status)) return current;
    if (current.parentRunId) {
      this.cancelledRuns.add(current.parentRunId);
      this.database.updateBatchRun(current.parentRunId, {
        status: "cancelled",
        message: "Stopped. Saved images are kept.",
        ...(() => {
          const agg = this.database.aggregateRunUsage(current.parentRunId!);
          return { completedCount: agg.completed, costUsd: agg.costUsd };
        })(),
      });
      for (const siblingId of this.database.listSessionIdsForRun(current.parentRunId)) {
        const sibling = this.database.getTelemetry(siblingId);
        if (sibling.status === "pending" || siblingId === sessionId) {
          this.database.cancelOpenPrompts(siblingId);
          if (sibling.status === "pending") {
            this.database.updateSession(siblingId, { status: "cancelled", message: "Cancelled before wave started.", nextPollAt: null });
            this.emit(siblingId);
          }
        }
      }
    }
    this.database.cancelOpenPrompts(sessionId);
    this.database.setSessionPhase(sessionId, "done");
    this.database.updateSession(sessionId, { status: "cancelled", message: "Cancelled.", nextPollAt: null });
    void this.diagnostics?.write("session_cancelled", { sessionId, diagnosticId: current.diagnosticId, parentRunId: current.parentRunId });
    this.abortControllers.get(sessionId)?.abort();
    this.emit(sessionId);
    const externalId = this.database.getExternalBatchId(sessionId);
    if (externalId) {
      try { await this.withRotatingKey((client) => client.cancelBatch(externalId)); } catch { /* local state remains cancelled */ }
    }
    await this.cleanupRemoteReferences(sessionId);
    return this.emit(sessionId);
  }

  async resumeRun(params: { runId?: string; sessionId?: string }): Promise<SessionTelemetry> {
    let prompts: Array<{ promptText: string; week: string; scheduleDate: string; themeColumn: string }> = [];
    let ctx: ReturnType<AppDatabase["getSessionRunContext"]> | null = null;
    let parentRunId: string | undefined;
    if (params.runId) {
      const run = this.database.getBatchRun(params.runId);
      if (!run) throw new Error("That run was not found.");
      prompts = this.database.listIncompletePromptsForRun(params.runId);
      parentRunId = params.runId;
      const sampleSession = this.database.listSessionIdsForRun(params.runId)[0];
      if (!sampleSession) throw new Error("That run has no sessions to resume from.");
      ctx = this.database.getSessionRunContext(sampleSession);
    } else if (params.sessionId) {
      prompts = this.database.listIncompletePromptsForSession(params.sessionId);
      ctx = this.database.getSessionRunContext(params.sessionId);
      parentRunId = this.database.getTelemetry(params.sessionId).parentRunId ?? undefined;
    } else {
      throw new Error("Choose a run or session to resume.");
    }
    if (prompts.length === 0) throw new Error("Nothing left to resume. All prompts already have images or were completed.");
    if (parentRunId) {
      this.cancelledRuns.delete(parentRunId);
      this.database.updateBatchRun(parentRunId, {
        status: "processing",
        message: `Resuming ${prompts.length} remaining prompt${prompts.length === 1 ? "" : "s"}.`,
      });
    }
    const referenceImageFileIds: string[] = [];
    for (const fileId of ctx.referenceFileIds) referenceImageFileIds.push(await this.reuploadReference(fileId));
    void this.diagnostics?.write("resume_new_batch", {
      parentRunId: parentRunId ?? null, remaining: prompts.length, sessionId: params.sessionId ?? null,
    });
    return this.submit({
      prompts, model: ctx.model, mode: ctx.runMode, format: ctx.format, quality: ctx.quality,
      waveSize: parentRunId ? this.database.getBatchRun(parentRunId)?.wave_size : this.database.getAppSettings().waveSize,
      waveStrategy: parentRunId ? this.database.getBatchRun(parentRunId)?.wave_strategy : undefined,
      parentRunId,
      ...(referenceImageFileIds.length ? { referenceImageFileIds } : {}),
    });
  }

  async retryFailed(sessionId: string): Promise<SessionTelemetry> {
    return this.resumeRun({ sessionId });
  }

  private async reuploadReference(fileId: string): Promise<string> {
    const cached = this.database.getReferenceFile(fileId);
    if (!cached || !existsSync(cached.local_path)) throw new Error("The local reference image is missing; upload it again.");
    const bytes = new Uint8Array(await Bun.file(cached.local_path).arrayBuffer());
    return (await this.uploadReference(bytes, basename(cached.local_path).replace(/^[^-]+-/, ""), cached.mime_type)).fileId;
  }

  private async cleanupRemoteReferences(sessionId: string): Promise<void> {
    for (const fileId of this.database.getSessionRunContext(sessionId).referenceFileIds) {
      const cached = this.database.getReferenceFile(fileId);
      if (!cached || cached.remote_deleted_at) continue;
      try {
        await this.withRotatingKey((client) => client.deleteFile(fileId));
        this.database.markReferenceRemoteDeleted(fileId);
      } catch { /* retry cleanup on a later status/detail action */ }
    }
  }

  recoverOnStartup(): number {
    const recovered = this.database.recoverOrphanedSessions();
    const root = resolve(this.referenceDirectory).toLowerCase();
    for (const reference of this.database.listOrphanedReferences()) {
      const path = resolve(reference.local_path);
      if (path.toLowerCase().startsWith(`${root}\\`)) {
        try { if (existsSync(path)) unlinkSync(path); } catch { continue; }
      }
      this.database.deleteReferenceFile(reference.file_id);
    }
    return recovered;
  }

  estimate(input: {
    model: string; promptCount: number; mode: RunMode; quality: QualityTier;
    format: OutputFormatId; referenceCount: number;
  }, fxRate: number): CostEstimate {
    if (!Number.isInteger(input.promptCount) || input.promptCount < 1 || input.promptCount > BATCH_LIMIT) {
      throw new Error("Prompt count must be between 1 and 1,000.");
    }
    if (!isOutputFormatId(input.format)) throw new Error("Unsupported output format.");
    if (!Number.isInteger(input.referenceCount) || input.referenceCount < 0 || input.referenceCount > REFERENCE_LIMIT) {
      throw new Error(`Reference count must be between 0 and ${REFERENCE_LIMIT}.`);
    }
    const costUsd = this.pricing.estimateUsd(input);
    return { costUsd, costPkr: costUsd * fxRate, fxRate, pricingVersion: this.pricing.version, isEstimate: true };
  }
}
