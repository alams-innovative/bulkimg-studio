import type { AppDatabase } from "../database";
import type { KeyVault } from "./key-vault";
import type { FxService } from "./fx-service";
import { OpenAIClient } from "./openai-client";
import type { HistoryService } from "./history-service";
import type { SessionStatus, SessionTelemetry, SubmitRunInput } from "../../shared/contracts";

function normalizeBatchStatus(status: string): SessionStatus {
  if (status === "completed") return "completed";
  if (["failed", "expired", "cancelled"].includes(status)) return "failed";
  return "processing";
}

export class BatchEngine {
  private nextKeyIndex = 0;

  constructor(
    private readonly database: AppDatabase,
    private readonly keyVault: KeyVault,
    private readonly fx: FxService,
    private readonly history: HistoryService,
  ) {}

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

  async submit(input: SubmitRunInput): Promise<SessionTelemetry> {
    if (input.prompts.length === 0) throw new Error("Select at least one prompt.");
    const sessionId = crypto.randomUUID();
    this.database.createSession(sessionId, input, await this.fx.getUsdPkrRate());

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
        this.database.updateSession(sessionId, { status: "processing", message: "Generating images directly…" });
        const selected = await this.withRotatingKey(
          (client) => client.generateDirect(input),
          (keyId) => this.database.assignSessionKey(sessionId, keyId),
        );
        const direct = selected.result;
        this.database.recordKeyUsage(selected.keyId, {
          requests: direct.completed,
          inputTokens: direct.inputTokens,
          outputTokens: direct.outputTokens,
        });
        const saved = await this.history.persistDirect(sessionId, input.model, selected.keyId, direct.images);
        this.database.updateSession(sessionId, {
          status: "completed",
          message: `Direct generation completed; ${saved} image${saved === 1 ? "" : "s"} saved to History.`,
          completedCount: direct.completed,
          inputTokens: direct.inputTokens,
          outputTokens: direct.outputTokens,
        });
      }
    } catch (error) {
      this.database.updateSession(sessionId, {
        status: "failed",
        message: error instanceof Error ? error.message : "Run failed",
      });
    }
    return this.database.getTelemetry(sessionId);
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
      let savedImages = 0;
      if (status === "completed" && output) {
        savedImages = await this.history.persistBatchOutput(
          sessionId,
          this.database.getSessionModel(sessionId),
          sessionKeyId,
          output,
        );
      }
      if (sessionKeyId) {
        this.database.recordKeyUsage(sessionKeyId, {
          inputTokens: Math.max(0, nextInputTokens - current.inputTokens),
          outputTokens: Math.max(0, nextOutputTokens - current.outputTokens),
        });
      }
      this.database.updateSession(sessionId, {
        status,
        message: errorMessage || (status === "completed"
          ? `OpenAI batch completed; ${savedImages} image${savedImages === 1 ? "" : "s"} saved to History.`
          : `OpenAI batch status: ${batch.status}`),
        completedCount: batch.request_counts?.completed ?? current.completedCount,
        inputTokens: nextInputTokens,
        outputTokens: nextOutputTokens,
      });
    } catch (error) {
      this.database.updateSession(sessionId, {
        status: "processing",
        message: `Status check deferred: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
    return this.database.getTelemetry(sessionId);
  }
}
