import type { AppDatabase } from "../database";
import type { KeyVault } from "./key-vault";
import type { FxService } from "./fx-service";
import { OpenAIClient } from "./openai-client";
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
  ) {}

  private async withRotatingKey<T>(operation: (client: OpenAIClient, keyId: string) => Promise<T>): Promise<T> {
    const keys = await this.keyVault.activeKeys();
    if (keys.length === 0) throw new Error("Add an active OpenAI API key before starting a run.");
    let lastError: unknown;
    for (let offset = 0; offset < keys.length; offset += 1) {
      const index = (this.nextKeyIndex + offset) % keys.length;
      const candidate = keys[index];
      if (!candidate) continue;
      try {
        const result = await operation(new OpenAIClient(candidate.key), candidate.id);
        this.nextKeyIndex = (index + 1) % keys.length;
        return result;
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
        const batch = await this.withRotatingKey((client) => client.submitBatch(input));
        this.database.updateSession(sessionId, {
          status: "processing",
          message: `OpenAI batch ${batch.status}; completion window is up to 24 hours.`,
          externalBatchId: batch.id,
          completedCount: batch.request_counts?.completed ?? 0,
        });
      } else {
        this.database.updateSession(sessionId, { status: "processing", message: "Generating images directly…" });
        const direct = await this.withRotatingKey((client) => client.generateDirect(input));
        this.database.updateSession(sessionId, {
          status: "completed",
          message: "Direct generation completed. Output persistence is the next implementation milestone.",
          completedCount: direct.completed,
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
      const batch = await this.withRotatingKey((client) => client.getBatch(externalId));
      const status = normalizeBatchStatus(batch.status);
      const errorMessage = batch.errors?.data?.map((item) => item.message).filter(Boolean).join("; ");
      this.database.updateSession(sessionId, {
        status,
        message: errorMessage || `OpenAI batch status: ${batch.status}`,
        completedCount: batch.request_counts?.completed ?? current.completedCount,
        inputTokens: batch.usage?.input_tokens ?? current.inputTokens,
        outputTokens: batch.usage?.output_tokens ?? current.outputTokens,
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
