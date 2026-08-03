import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AppDatabase } from "../database";
import type { KeyVault } from "./key-vault";
import type { FxService } from "./fx-service";
import { OpenAIClient, OpenAIError, sanitizedError, type BatchObject } from "./openai-client";
import type { HistoryService } from "./history-service";
import type { PricingService } from "./pricing-service";
import type {
  CostEstimate, OutputFormatId, QualityTier, RunMode, SessionDetail, SessionStatus,
  SessionTelemetry, SubmitRunInput,
} from "../../shared/contracts";
import { isOutputFormatId } from "../../shared/output-formats";
import { showNotification } from "./windows-native";
import type { DiagnosticLog } from "./diagnostics";

const DIRECT_LIMIT = 4;
const BATCH_LIMIT = 1_000;
const DIRECT_CONCURRENCY = 2;
const REFERENCE_LIMIT = 4;
const REFERENCE_LIMIT_BYTES = 20 * 1024 * 1024;
const REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TERMINAL = new Set<SessionStatus>(["partial", "completed", "failed", "cancelled"]);
const REMOTE_TERMINAL = new Set(["completed", "failed", "expired", "cancelled"]);
const DOWNLOAD_RETRY_MS = 20_000;

function validateInput(input: SubmitRunInput): SubmitRunInput {
  if (!input || typeof input !== "object" || !Array.isArray(input.prompts)) throw new Error("The generation request is invalid.");
  if (input.model !== "gpt-image-2") throw new Error("Only GPT Image 2 is supported.");
  if (input.mode !== "direct" && input.mode !== "batch") throw new Error("Choose Direct or Batch.");
  if (!isOutputFormatId(input.format)) throw new Error("Choose one of the four supported output formats.");
  if (!["low", "medium", "high"].includes(input.quality)) throw new Error("Choose Low, Medium, or High quality.");
  const limit = input.mode === "direct" ? DIRECT_LIMIT : BATCH_LIMIT;
  if (input.prompts.length < 1 || input.prompts.length > limit) {
    throw new Error(input.mode === "direct" ? "Direct supports 1–4 prompts." : "Batch supports 1–1,000 prompts.");
  }
  for (const prompt of input.prompts) {
    if (!prompt || typeof prompt.promptText !== "string" || !prompt.promptText.trim() || prompt.promptText.length > 32_000) {
      throw new Error("Every prompt must contain 1–32,000 characters.");
    }
    for (const value of [prompt.week, prompt.scheduleDate, prompt.themeColumn]) {
      if (typeof value !== "string" || value.length > 500) throw new Error("Prompt metadata is invalid.");
    }
  }
  if (input.referenceImageFileIds !== undefined) {
    if (!Array.isArray(input.referenceImageFileIds) || input.referenceImageFileIds.length > REFERENCE_LIMIT) {
      throw new Error(`Add no more than ${REFERENCE_LIMIT} reference images.`);
    }
    if (input.referenceImageFileIds.some((fileId) => typeof fileId !== "string" || !fileId.trim() || fileId.length > 200)) {
      throw new Error("One of the reference images is invalid.");
    }
    if (new Set(input.referenceImageFileIds).size !== input.referenceImageFileIds.length) {
      throw new Error("Remove duplicate reference images before generating.");
    }
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
  }

  private emit(sessionId: string): SessionTelemetry {
    const telemetry = this.database.getTelemetry(sessionId);
    try { this.progressSink?.(telemetry); } catch { /* webview may not be ready */ }
    return telemetry;
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
        const result = await operation(new OpenAIClient(candidate.key), candidate.id);
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

  private usageCost(inputTokens: number, outputTokens: number, mode: RunMode): number {
    return this.pricing.costFromUsage({ model: "gpt-image-2", mode, inputTokens, outputTokens });
  }

  private outputPath(sessionId: string): string {
    return join(this.batchesDirectory, `${sessionId}-output.jsonl`);
  }

  async uploadReference(bytes: Uint8Array, filename: string, mimeType: string): Promise<{ fileId: string }> {
    const cleanName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!cleanName || cleanName.length > 180) throw new Error("Choose a reference image with a valid filename.");
    if (!REFERENCE_MIME_TYPES.has(mimeType)) throw new Error("Reference images must be PNG, JPEG, or WebP.");
    if (bytes.byteLength < 1 || bytes.byteLength > REFERENCE_LIMIT_BYTES) throw new Error("Reference images must be 20 MB or smaller.");
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
    const input = validateInput(rawInput);
    for (const fileId of input.referenceImageFileIds ?? []) {
      if (!this.database.getReferenceFile(fileId)) throw new Error("Upload the missing reference image again before generating.");
    }
    const fxRate = await this.fx.getUsdPkrRate();
    const estimate = this.estimate({
      model: input.model, promptCount: input.prompts.length, mode: input.mode,
      quality: input.quality, format: input.format, referenceCount: input.referenceImageFileIds?.length ?? 0,
    }, fxRate);
    const sessionId = crypto.randomUUID();
    this.database.createSession(sessionId, input, fxRate, { costUsd: estimate.costUsd, pricingVersion: estimate.pricingVersion });
    void this.diagnostics?.write("session_created", { sessionId, diagnosticId: this.database.getTelemetry(sessionId).diagnosticId, mode: input.mode, format: input.format, quality: input.quality, promptCount: input.prompts.length, referenceCount: input.referenceImageFileIds?.length ?? 0 });
    queueMicrotask(() => void (input.mode === "direct" ? this.runDirect(sessionId, input) : this.submitRemoteBatch(sessionId, input)));
    return this.emit(sessionId);
  }

  private async runDirect(sessionId: string, input: SubmitRunInput): Promise<void> {
    if (this.database.isSessionCancelled(sessionId)) return;
    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);
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
          if (controller.signal.aborted || this.database.isSessionCancelled(sessionId)) return;
          this.database.assignSessionKey(sessionId, selected.keyId);
          const costUsd = this.usageCost(selected.result.inputTokens, selected.result.outputTokens, "direct");
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
      this.database.updateSession(sessionId, {
        status: "processing",
        message: "Batch completed; downloading results…",
        nextPollAt: new Date(Date.now() + DOWNLOAD_RETRY_MS).toISOString(),
      });
      this.emit(sessionId);

      try {
        await this.withRotatingKey((client) => client.downloadFileToPath(batch.output_file_id!, outputPath));
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
          (inputTokens, outputTokens) => this.usageCost(inputTokens, outputTokens, "batch"),
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
    this.database.cancelOpenPrompts(sessionId);
    this.database.updateSession(sessionId, { status: "cancelled", message: "Cancelled.", nextPollAt: null });
    void this.diagnostics?.write("session_cancelled", { sessionId, diagnosticId: current.diagnosticId });
    this.abortControllers.get(sessionId)?.abort();
    this.emit(sessionId);
    const externalId = this.database.getExternalBatchId(sessionId);
    if (externalId) {
      try { await this.withRotatingKey((client) => client.cancelBatch(externalId)); } catch { /* local state remains cancelled */ }
    }
    await this.cleanupRemoteReferences(sessionId);
    return this.emit(sessionId);
  }

  async retryFailed(sessionId: string): Promise<SessionTelemetry> {
    const prompts = this.database.listRetryablePrompts(sessionId);
    if (prompts.length === 0) throw new Error("This session has no missing prompts to retry.");
    const ctx = this.database.getSessionRunContext(sessionId);
    const referenceImageFileIds: string[] = [];
    for (const fileId of ctx.referenceFileIds) referenceImageFileIds.push(await this.reuploadReference(fileId));
    return this.submit({
      prompts, model: ctx.model, mode: ctx.runMode, format: ctx.format, quality: ctx.quality,
      ...(referenceImageFileIds.length ? { referenceImageFileIds } : {}),
    });
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
