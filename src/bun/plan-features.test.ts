import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { AppDatabase } from "./database";
import { BatchEngine, chunkPrompts, planBatchWaves, planCustomWaves } from "./services/batch-engine";
import { HistoryService } from "./services/history-service";
import { PricingService } from "./services/pricing-service";
import { APP_LIMITS } from "../shared/contracts";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function makeDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "bulkimg-plan-"));
  temporaryDirectories.push(directory);
  return directory;
}

function input(count = 1, mode: "direct" | "batch" = "batch") {
  return {
    prompts: Array.from({ length: count }, (_, index) => ({
      promptText: `Prompt ${index + 1}`,
      week: "Week 1",
      scheduleDate: "2026-08-01",
      themeColumn: "Brand",
    })),
    model: "gpt-image-2" as const,
    mode,
    format: "square" as const,
    quality: "medium" as const,
  };
}

describe("wave planner", () => {
  test("splits 365 / 100 into 4 chunks", () => {
    const items = Array.from({ length: 365 }, (_, i) => i);
    const chunks = chunkPrompts(items, 100);
    expect(chunks).toHaveLength(4);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 100, 65]);
  });

  test("wave size 0 keeps one chunk", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunkPrompts(items, 0)).toHaveLength(1);
    expect(chunkPrompts(items, 0)[0]).toHaveLength(250);
  });

  test("guided 365 starts with 10 then uses the configured later batch size", () => {
    const items = Array.from({ length: 365 }, (_, i) => i);
    const batches = planBatchWaves(items, "guided", 50, 10);
    expect(batches.map((batch) => batch.length)).toEqual([10, 50, 50, 50, 50, 50, 50, 50, 5]);
  });

  test("parallel splitting has no special first batch", () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    expect(planBatchWaves(items, "parallel", 50, 10).map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(planBatchWaves(items, "all", 50, 10).map((batch) => batch.length)).toEqual([120]);
  });

  test("uses the exact editable wave plan", () => {
    const items = Array.from({ length: 260 }, (_, i) => i);
    expect(planCustomWaves(items, [10, 100, 75, 75]).map((batch) => batch.length)).toEqual([10, 100, 75, 75]);
    expect(() => planCustomWaves(items, [10, 100])).toThrow("cover every selected prompt");
  });
});

describe("v6 migration, runs, and Converter storage", () => {
  test("opens fresh DB at user_version 6 with settings defaults", () => {
    const directory = makeDir();
    const database = new AppDatabase(directory);
    expect(database.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(6);
    expect(database.getAppSettings().waveSize).toBe(APP_LIMITS.defaultWaveSize);
    database.db.close();
  });

  test("migrates v3 schema to v6", () => {
    const directory = makeDir();
    const original = new AppDatabase(directory);
    original.createSession("session-v3", input(2, "direct"), 278);
    original.db.close();

    const raw = new Database(join(directory, "bulkimg-studio.db"));
    raw.exec("PRAGMA user_version = 3;");
    raw.close();

    const migrated = new AppDatabase(directory);
    expect(migrated.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(6);
    expect(migrated.getSessionPrompts("session-v3")).toHaveLength(2);
    expect(migrated.getAppSettings().waveSize).toBe(APP_LIMITS.defaultWaveSize);
    migrated.db.close();
  });

  test("repairs swapped guided-wave metadata from v5", () => {
    const directory = makeDir();
    const original = new AppDatabase(directory);
    original.db.close();
    const raw = new Database(join(directory, "bulkimg-studio.db"));
    raw.query(`
      INSERT INTO batch_runs
        (run_id, model_used, run_mode, output_format, quality, wave_size, wave_count, total_prompts,
         wave_strategy, status, status_message, estimate_usd, fx_rate, diagnostic_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("swapped-v5-run", "gpt-image-2", "batch", "square", "medium", 100, 2, "guided", 165, "processing", "Batch 1 of 2", 0.3, 278, "BIS-swapped");
    raw.exec("PRAGMA user_version = 5;");
    raw.close();

    const migrated = new AppDatabase(directory);
    const run = migrated.getRunDetail("swapped-v5-run");
    expect(run?.waveStrategy).toBe("guided");
    expect(run?.totalPrompts).toBe(165);
    migrated.db.close();
  });

  test("tracks parent run waves and incomplete resume set", () => {
    const directory = makeDir();
    const database = new AppDatabase(directory);
    const runId = "run-parent-1";
    database.createBatchRun({
      runId,
      model: "gpt-image-2",
      mode: "batch",
      format: "square",
      quality: "medium",
      waveSize: 2,
      waveCount: 2,
      waveStrategy: "guided",
      totalPrompts: 3,
      estimateUsd: 0.15,
      fxRate: 278,
    });
    database.createSession("wave-0", {
      ...input(2, "batch"),
      parentRunId: runId,
      waveIndex: 0,
      waveCount: 2,
    }, 278, { costUsd: 0.1, pricingVersion: "test" }, { parentRunId: runId, waveIndex: 0, waveCount: 2 });
    database.createSession("wave-1", {
      prompts: input(1, "batch").prompts,
      model: "gpt-image-2",
      mode: "batch",
      format: "square",
      quality: "medium",
      parentRunId: runId,
      waveIndex: 1,
      waveCount: 2,
    }, 278, { costUsd: 0.05, pricingVersion: "test" }, { parentRunId: runId, waveIndex: 1, waveCount: 2 });

    const completed = database.getSessionPrompts("wave-0")[0]!;
    database.markPromptProcessing(completed.prompt_id);
    database.completePrompt(completed.prompt_id, { inputTokens: 1, outputTokens: 2, costUsd: 0.01 });

    const incomplete = database.listIncompletePromptsForRun(runId);
    expect(incomplete).toHaveLength(2);
    expect(incomplete.map((prompt) => prompt.promptText)).toEqual(["Prompt 2", "Prompt 1"]);

    database.cancelOpenPrompts("wave-1");
    const afterCancel = database.listIncompletePromptsForSession("wave-1");
    expect(afterCancel).toHaveLength(1);
    expect(afterCancel[0]!.promptText).toBe("Prompt 1");

    const runs = database.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sessions).toHaveLength(2);
    database.db.close();
  });

  test("does not start a guided wave before the prior wave is terminal", async () => {
    const directory = makeDir();
    const database = new AppDatabase(directory);
    const runId = "run-guarded-continue";
    database.createBatchRun({
      runId,
      model: "gpt-image-2",
      mode: "batch",
      format: "square",
      quality: "medium",
      waveSize: 1,
      waveCount: 2,
      waveStrategy: "guided",
      totalPrompts: 2,
      estimateUsd: 0.1,
      fxRate: 278,
    });
    for (const [sessionId, waveIndex] of [["guard-wave-1", 0], ["guard-wave-2", 1]] as const) {
      database.createSession(sessionId, {
        ...input(1, "batch"), parentRunId: runId, waveIndex, waveCount: 2,
      }, 278, { costUsd: 0.05, pricingVersion: "test" }, { parentRunId: runId, waveIndex, waveCount: 2 });
    }
    database.updateSession("guard-wave-1", { status: "processing", message: "Batch 1 is processing." });
    const engine = new BatchEngine(
      database,
      { listSafe: () => [], activeKeys: async () => [], invalidateKey: () => undefined } as any,
      { getUsdPkrRate: async () => 278 } as any,
      new HistoryService(database, directory, join(directory, "downloads")),
      new PricingService([]),
      directory,
    );

    await expect(engine.continueRun(runId)).rejects.toThrow("current batch must finish");
    database.db.close();
  });
});

describe("generation limits", () => {
  test("rejects oversize reference, over-count refs, and long prompts with plain errors", async () => {
    const directory = makeDir();
    const database = new AppDatabase(directory);
    const history = new HistoryService(database, directory, join(directory, "downloads"));
    const pricing = new PricingService([]);
    const keyVault = {
      listSafe: () => [],
      activeKeys: async () => [],
      invalidateKey: () => undefined,
    } as any;
    const fx = { getUsdPkrRate: async () => 278 } as any;
    const engine = new BatchEngine(database, keyVault, fx, history, pricing, directory);

    await expect(engine.uploadReference(new Uint8Array(APP_LIMITS.maxReferenceBytes + 1), "big.png", "image/png"))
      .rejects.toThrow(/50 MB/i);

    await expect(engine.submit({
      ...input(5, "direct"),
    })).rejects.toThrow(/Direct mode only allows 4 prompts/i);

    await expect(engine.submit({
      ...input(1, "direct"),
      prompts: [{
        promptText: "x".repeat(APP_LIMITS.maxPromptChars + 1),
        week: "1",
        scheduleDate: "Mon",
        themeColumn: "A",
      }],
    })).rejects.toThrow(/32,000 character max/i);

    await expect(engine.submit({
      ...input(1, "batch"),
      referenceImageFileIds: Array.from({ length: APP_LIMITS.maxReferences + 1 }, (_, i) => `file-${i}`),
    })).rejects.toThrow(/at most 16 reference images/i);

    database.db.close();
  });
});

describe("admin soft degrade", () => {
  test("stores soft warning when rate limits cannot be fetched without an admin key", () => {
    const directory = makeDir();
    const database = new AppDatabase(directory);
    expect(database.getAdminConfigRow().encrypted_key).toBeNull();
    database.setAdminRateLimits(null, "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works.");
    const row = database.getAdminConfigRow();
    expect(row.encrypted_key).toBeNull();
    expect(row.last_error).toMatch(/won't show|won’t show/i);
    database.setAdminRateLimits({
      model: "gpt-image-2",
      maxImagesPerMinute: 20,
      maxTokensPerMinute: 250_000,
      maxRequestsPerMinute: null,
      batchDayMaxInputTokens: null,
      fetchedAt: new Date().toISOString(),
    }, null);
    const updated = database.getAdminConfigRow();
    expect(updated.last_error).toBeNull();
    expect(updated.rate_limits_json).toContain("gpt-image-2");
    database.db.close();
  });
});
