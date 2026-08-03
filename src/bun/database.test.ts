import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppDatabase } from "./database";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("history database", () => {
  test("lists prompts without images and deletes matching legacy assets", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-history-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.createSession("session-1", {
      prompts: [{
        promptText: "A geometric blue bird",
        week: "Week 1",
        scheduleDate: "2026-08-01",
        themeColumn: "Brand",
      }],
      model: "gpt-image-1",
      mode: "direct",
      size: "1024x1024",
      quality: "high",
    }, 280);

    const prompt = database.getSessionPrompts("session-1")[0];
    expect(prompt).toBeDefined();
    expect(database.listHistory()).toMatchObject([{
      promptText: "A geometric blue bird",
      assetId: null,
      hasImage: false,
    }]);

    database.db.query(`
      INSERT INTO generated_assets
        (asset_id, session_id, image_filename, prompt_text, file_path, model_used)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("legacy-asset", "session-1", "bird.png", prompt!.prompt_text, join(directory, "bird.png"), "gpt-image-1");

    expect(database.listHistory()[0]).toMatchObject({ assetId: "legacy-asset", hasImage: true });
    expect(database.deleteHistoryPrompt(prompt!.prompt_id)).toMatchObject({ deletedAssets: 1 });
    expect(database.listHistory()).toEqual([]);
    database.db.close();
  });

  test("recovers interrupted direct runs and retains retry/reference context", () => {
    const directory = mkdtempSync(join(tmpdir(), "bulkimg-recovery-test-"));
    temporaryDirectories.push(directory);
    const database = new AppDatabase(directory);
    database.createSession("session-recovery", {
      prompts: [{
        promptText: "A layered monochrome image icon",
        week: "Week 2",
        scheduleDate: "2026-08-08",
        themeColumn: "Brand",
      }],
      model: "gpt-image-2",
      mode: "direct",
      size: "1024x1024",
      quality: "medium",
      referenceImageFileId: "file-reference",
    }, 278);
    database.updateSession("session-recovery", {
      status: "processing",
      message: "Generating image 1 of 1…",
    });
    database.cacheReferenceFile("file-reference", join(directory, "reference.png"), "image/png");

    expect(database.getSessionPricingContext("session-recovery")).toEqual({
      model: "gpt-image-2",
      runMode: "direct",
      quality: "medium",
    });
    expect(database.getReferenceFile("file-reference")).toMatchObject({ mime_type: "image/png" });
    expect(database.listRetryablePrompts("session-recovery")).toHaveLength(1);
    expect(database.recoverOrphanedSessions()).toBe(1);
    expect(database.getTelemetry("session-recovery")).toMatchObject({
      status: "failed",
      message: "Interrupted by app restart before direct generation finished.",
    });
    database.db.close();
  });
});
