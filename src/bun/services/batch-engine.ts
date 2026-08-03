import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AppDatabase } from "../database";
import type { KeyVault } from "./key-vault";
import type { FxService } from "./fx-service";
import { OpenAIClient } from "./openai-client";
import type { HistoryService } from "./history-service";
import type { PricingService } from "./pricing-service";
import type { SessionStatus, SessionTelemetry, SubmitRunInput } from "../../shared/contracts";
import { showNotification } from "./windows-native";

function normalizeBatchStatus(status: string): SessionStatus {
  if (status === "completed") return "completed";
  if (["failed", "expired", "cancelled", "cancelling"].includes(status)) return "failed";
  return "processing";
}

export class BatchEngine {
  private nextKeyIndex = 0;
  private readonly abortControllers = new Map<string, AbortController>();
  private progressSink: ((telemetry: SessionTelemetry) => void) | null = null;
  private readonly referenceDirectory: string;

  constructor(
    private readonly database: AppDatabase,
    private readonly keyVault: KeyVault,
    private readonly fx: FxService,
    private readonly history: HistoryService,
    private readonly pricing: PricingService,
    dataDirectory: string,
  ) {
    this.referenceDirectory = join(dataDirectory, "references");
    mkdirSync(this.referenceDirectory, { recursive: true });
  }

  setProgressSink(sink: (telemetry: SessionTelemetry) => void): void {
    this.progressSink = sink;
  }

  private emit(sessionId: string): SessionTelemetry {
    const telemetry = this.database.getTelemetry(sessionId);
    try { this.progressSink?.(telemetry); } catch { /* webview may not be ready */ }
    return telemetry;
  }

  private async withRotatingKey<T>(
    operation: (client: OpenAIClient, keyId: string) => Promise<T>,
    onSelected?: (keyId: string) => void,
  ): Promise<{ result: T; keyId: string }> {
    const keys = await this.keyVault.activeKeys();
    if (keys.length === 0) throw new Error("Add an active OpenAI API key before starting a run.");
    let lastError: unknown;
    for (let offset = 0; offset < keys.length; offset += 1) {
      const index = (this.nextKeyIndex + offset) % keys.length;
      const candidate = keys[index];
      if (!candidate) continue;
      try {
        onSelected?.(candidate.id);
        const result = await operation(new OpenAIClient(candidate.key), candidate.id);
        this.nextKeyIndex = (index + 1) % keys.length;
        return { result, keyId: candidate.id };
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number }).status;
        if (status !== 429) throw error;
        const retryAt = new Date(Date.now() + 60_000).toISOString();
        this.database.markRateLimited(candidate.id, retryAt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All API keys are rate limited.");
  }

  private applyCost(sessionId: string, imageCount: number, inputTokens: number, outputTokens: number): number {
    const ctx = this.database.getSessionPricingContext(sessionId);
    const costUsd = this.pricing.costFromUsage({
      model: ctx.model,
      mode: ctx.runMode,
      quality: ctx.quality,
      imageCount,
      inputTokens,
      outputTokens,
    });
    return costUsd;
  }

  async uploadReference(bytes: Uint8Array, filename: string, mimeType: string): Promise<{ fileId: string }> {
    const selected = await this.withRotatingKey((client) => client.uploadReferenceImage(bytes, filename, mimeType));
    const localPath = join(this.referenceDirectory, `${selected.result}.${filename.replace(/[^\w.-]+/g, "_")}`);
    await Bun.write(localPath, bytes);
    this.database.cacheReferenceFile(selected.result, localPath, mimeType);
    return { fileId: selected.result };
  }

  async submit(input: SubmitRunInput): Promise<SessionTelemetry> {
    if (input.prompts.length === 0) throw new Error("Select at least one prompt.");
    const sessionId = crypto.randomUUID();
    this.database.createSession(sessionId, input, await this.fx.getUsdPkrRate());
    this.emit(sessionId);

    try {
      if (input.mode === "batch") {
        const selected = await this.withRotatingKey(
          (client) => client.submitBatch(input),
          (keyId) => this.database.assignSessionKey(sessionId, keyId),
        );
        const batch = selected.result;
        this.database.recordKeyUsage(selected.keyId, { requests: input.prompts.length });
        this.database.updateSession(sessionId, {
          status: "processing",
          message: `OpenAI batch ${batch.status}; completion window is up to 24 hours.`,
          externalBatchId: batch.id,
          completedCount: batch.request_counts?.completed ?? 0,
        });
      } else {
        const controller = new AbortController();
        this.abortControllers.set(sessionId, controller);
        this.database.updateSession(sessionId, { status: "processing", message: "Generating images directly…" });
        this.emit(sessionId);
        const selected = await this.withRotatingKey(
          (client) => client.generateDirect(input, {
            signal: controller.signal,
            onPromptDone: (completed) => {
              this.database.updateSession(sessionId, {
                status: "processing",
                message: `Generating image ${completed} of ${input.prompts.length}…`,
                completedCount: completed,
              });
              this.emit(sessionId);
            },
          }),
          (keyId) => this.database.assignSessionKey(sessionId, keyId),
        );
        const direct = selected.result;
        const costUsd = this.applyCost(sessionId, direct.completed, direct.inputTokens, direct.outputTokens);
        this.database.recordKeyUsage(selected.keyId, {
          requests: direct.completed,
          inputTokens: direct.inputTokens,
          outputTokens: direct.outputTokens,
          costUsd,
          costPkr: costUsd * this.database.getTelemetry(sessionId).fxRate,
        });
        this.database.updateSession(sessionId, {
          status: "processing",
          message: "Saving generated images to History…",
          completedCount: direct.completed,
          inputTokens: direct.inputTokens,
          outputTokens: direct.outputTokens,
          costUsd,
        });
        const saved = await this.history.persistDirect(sessionId, input.model, selected.keyId, direct.images);
        this.database.updateSession(sessionId, {
          status: "completed",
          message: `Direct generation completed; ${saved} image${saved === 1 ? "" : "s"} saved to History.`,
          completedCount: direct.completed,
          inputTokens: direct.inputTokens,
          outputTokens: direct.outputTokens,
          costUsd,
        });
        void showNotification("BulkImg Studio", `Direct run finished · ${saved} image(s).`);
      }
    } catch (error) {
      this.database.updateSession(sessionId, {
        status: "failed",
        message: error instanceof Error ? error.message : "Run failed",
      });
    } finally {
      this.abortControllers.delete(sessionId);
    }
    return this.emit(sessionId);
  }

  async poll(sessionId: string): Promise<SessionTelemetry> {
    const current = this.database.getTelemetry(sessionId);
    const externalId = this.database.getExternalBatchId(sessionId);
    if (!externalId || current.status === "completed" || current.status === "failed") return current;
    try {
      const selected = await this.withRotatingKey(async (client) => {
        const batch = await client.getBatch(externalId);
        const output = batch.status === "completed" && batch.output_file_id
          ? await client.getFileContent(batch.output_file_id)
          : null;
        return { batch, output };
      });
      const { batch, output } = selected.result;
      const status = normalizeBatchStatus(batch.status);
      const errorMessage = batch.errors?.data?.map((item) => item.message).filter(Boolean).join("; ");
      const nextInputTokens = batch.usage?.input_tokens ?? current.inputTokens;
      const nextOutputTokens = batch.usage?.output_tokens ?? current.outputTokens;
      const sessionKeyId = this.database.getSessionKeyId(sessionId);
      const completedCount = batch.request_counts?.completed ?? current.completedCount;
      let savedImages = 0;
      let costUsd = current.costUsd;
      if (status === "completed") {
        costUsd = this.applyCost(
          sessionId,
          Math.max(completedCount, 1),
          nextInputTokens,
          nextOutputTokens,
        );
        this.database.updateSession(sessionId, {
          status: "processing",
          message: "Batch completed; saving images to History…",
          completedCount,
          inputTokens: nextInputTokens,
          outputTokens: nextOutputTokens,
          costUsd,
        });
        if (output) {
          savedImages = await this.history.persistBatchOutput(
            sessionId,
            this.database.getSessionModel(sessionId),
            sessionKeyId,
            output,
          );
        }
      }
      if (sessionKeyId) {
        this.database.recordKeyUsage(sessionKeyId, {
          inputTokens: Math.max(0, nextInputTokens - current.inputTokens),
          outputTokens: Math.max(0, nextOutputTokens - current.outputTokens),
          costUsd: Math.max(0, costUsd - current.costUsd),
          costPkr: Math.max(0, (costUsd - current.costUsd) * current.fxRate),
        });
      }
      this.database.updateSession(sessionId, {
        status,
        message: errorMessage || (status === "completed"
          ? `OpenAI batch completed; ${savedImages} image${savedImages === 1 ? "" : "s"} saved to History.`
          : `OpenAI batch status: ${batch.status}`),
        completedCount,
        inputTokens: nextInputTokens,
        outputTokens: nextOutputTokens,
        costUsd,
      });
      if (status === "completed") {
        void showNotification("BulkImg Studio", `Batch completed · ${savedImages} image(s).`);
      }
    } catch (error) {
      this.database.updateSession(sessionId, {
        status: "processing",
        message: `Status check deferred: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
    return this.emit(sessionId);
  }

  async cancel(sessionId: string): Promise<SessionTelemetry> {
    const current = this.database.getTelemetry(sessionId);
    if (current.status !== "pending" && current.status !== "processing") return current;
    const controller = this.abortControllers.get(sessionId);
    controller?.abort();
    const externalId = this.database.getExternalBatchId(sessionId);
    if (externalId) {
      try {
        await this.withRotatingKey((client) => client.cancelBatch(externalId));
      } catch {
        // Local cancellation still recorded if remote cancel fails.
      }
    }
    this.database.updateSession(sessionId, {
      status: "failed",
      message: "Cancelled by user.",
    });
    return this.emit(sessionId);
  }

  async retryFailed(sessionId: string): Promise<SessionTelemetry> {
    const prompts = this.database.listRetryablePrompts(sessionId);
    if (prompts.length === 0) throw new Error("No failed or missing prompts to retry for this session.");
    const ctx = this.database.getSessionPricingContext(sessionId);
    const sessionRow = this.database.db.query<{
      size_used: string; reference_file_id: string | null;
    }, [string]>(
      "SELECT size_used, reference_file_id FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId);
    return this.submit({
      prompts,
      model: ctx.model,
      mode: ctx.runMode,
      size: sessionRow?.size_used ?? "1024x1024",
      quality: ctx.quality,
      referenceImageFileId: sessionRow?.reference_file_id ?? undefined,
    });
  }

  recoverOnStartup(): number {
    return this.database.recoverOrphanedSessions();
  }

  estimate(input: {
    model: string;
    promptCount: number;
    mode: "batch" | "direct";
    quality: "low" | "medium" | "high";
  }, fxRate: number): { costUsd: number; costPkr: number; fxRate: number } {
    const costUsd = this.pricing.estimateUsd(input);
    return { costUsd, costPkr: costUsd * fxRate, fxRate };
  }
}
