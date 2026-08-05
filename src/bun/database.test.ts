import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { AppDatabase } from "./database";

const temporaryDirectories: string[] = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function input(mode: "direct" | "batch" = "direct") {
  return {
    prompts: [{ promptText: "A geometric blue bird", week: "Week 1", scheduleDate: "2026-08-01", themeColumn: "Brand" }],
    model: "gpt-image-2", mode, format: "square" as const, quality: "medium" as const,
  };
}

describe("database migrations and job state", () => {
  test("creates prompt outcomes and preserves retry state", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-db-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.createSession("session-1", input(), 280);
    const prompt = database.getSessionPrompts("session-1")[0]!;
    expect(database.markPromptProcessing(prompt.prompt_id)).toBe(true);
    database.failPrompt(prompt.prompt_id, { message: "Try later", category: "rate_limit", httpStatus: 429, requestId: "req_1", retryAt: null });
    expect(database.listSessionPromptOutcomes("session-1")[0]).toMatchObject({ status: "failed", attempts: 1, error: { requestId: "req_1" } });
    database.db.close();
  });

  test("recovers direct work and schedules batch work", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-recovery-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.createSession("direct-1", input("direct"), 278);
    database.createSession("batch-1", input("batch"), 278);
    database.updateSession("direct-1", { status: "processing", message: "Working" });
    database.updateSession("batch-1", { status: "processing", message: "Working", externalBatchId: "batch_remote" });
    expect(database.recoverOrphanedSessions()).toBe(2);
    expect(database.getTelemetry("direct-1").status).toBe("failed");
    expect(database.listActiveBatchSessionIds()).toContain("batch-1");
    database.db.close();
  });

  test("persists ordered reference image collections per session", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-reference-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.cacheReferenceFile("file-first", join(directory, "first.png"), "image/png", "key-1");
    database.cacheReferenceFile("file-second", join(directory, "second.webp"), "image/webp", "key-1");
    database.createSession("session-references", {
      ...input(), referenceImageFileIds: ["file-first", "file-second"],
    }, 278);
    expect(database.getSessionRunContext("session-references").referenceFileIds).toEqual(["file-first", "file-second"]);
    expect(database.listOrphanedReferences()).toEqual([]);
    database.db.close();
  });

  test("migrates a legacy single reference into the ordered collection", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-reference-migration-test-"));
    temporaryDirectories.push(directory);
    const original = new AppDatabase(directory);
    original.cacheReferenceFile("file-legacy", join(directory, "legacy.png"), "image/png", "key-1");
    original.createSession("legacy-session", { ...input(), referenceImageFileIds: ["file-legacy"] }, 278);
    original.db.close();

    const raw = new Database(join(directory, "bulkimg-studio.db"));
    raw.exec("PRAGMA foreign_keys = OFF; DROP TABLE session_reference_files; PRAGMA user_version = 2;");
    raw.close();

    const migrated = new AppDatabase(directory);
    expect(migrated.getSessionRunContext("legacy-session").referenceFileIds).toEqual(["file-legacy"]);
    expect(migrated.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(4);
    migrated.db.close();
  });

  test("aggregates app-scoped usage by mode without counting capped lists", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-usage-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.createSession("usage-direct", {
      ...input("direct"),
      prompts: [
        { promptText: "One", week: "Week 1", scheduleDate: "2026-08-01", themeColumn: "Brand" },
        { promptText: "Two", week: "Week 1", scheduleDate: "2026-08-02", themeColumn: "Brand" },
      ],
    }, 280);
    const directPrompts = database.getSessionPrompts("usage-direct");
    database.completePrompt(directPrompts[0]!.prompt_id, { inputTokens: 100, outputTokens: 200, costUsd: 0.01 });
    database.failPrompt(directPrompts[1]!.prompt_id, { message: "failed", category: "provider", httpStatus: 500, requestId: null, retryAt: null });

    database.createSession("usage-batch", input("batch"), 280);
    const batchPrompt = database.getSessionPrompts("usage-batch")[0]!;
    database.completePrompt(batchPrompt.prompt_id, { inputTokens: 300, outputTokens: 400, costUsd: 0.02 });

    const summary = database.getUsageSummary({
      startAt: "2020-01-01T00:00:00.000Z",
      endAt: "2030-01-01T00:00:00.000Z",
    });
    expect(summary.scope).toBe("this_app");
    expect(summary.direct).toMatchObject({ requestCount: 2, completedCount: 1, failedCount: 1, inputTokens: 100, outputTokens: 200, costUsd: 0.01 });
    expect(summary.batch).toMatchObject({ requestCount: 1, completedCount: 1, inputTokens: 300, outputTokens: 400, costUsd: 0.02 });
    expect(summary.total).toMatchObject({ requestCount: 3, completedCount: 2, failedCount: 1, inputTokens: 400, outputTokens: 600, costUsd: 0.03 });
    database.db.close();
  });
});
