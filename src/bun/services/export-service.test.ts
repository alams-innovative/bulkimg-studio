import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { AppDatabase } from "../database";
import { ExportService } from "./export-service";

const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function addImage(database: AppDatabase, root: string, sessionId: string, filename: string): string {
  const prompt = database.getSessionPrompts(sessionId)[0]!;
  const path = join(root, filename);
  writeFileSync(path, pngBytes);
  const assetId = crypto.randomUUID();
  database.insertGeneratedAsset({
    assetId,
    promptId: prompt.prompt_id,
    sessionId,
    imageFilename: filename,
    promptText: prompt.prompt_text,
    scheduleDate: prompt.schedule_date,
    week: prompt.week,
    themeColumn: prompt.theme_column,
    keyUsedId: null,
    filePath: path,
    model: "gpt-image-2",
    sourceKey: assetId,
  });
  return assetId;
}

function createSession(database: AppDatabase, sessionId: string, parentRunId?: string): void {
  database.createSession(sessionId, {
    prompts: [{ promptText: "Export image", week: "Week 1", scheduleDate: "2026-08-13", themeColumn: "Brand" }],
    model: "gpt-image-2",
    mode: "direct",
    format: "square",
    quality: "medium",
    parentRunId,
  }, 278, { costUsd: 0.04, pricingVersion: "test" }, { parentRunId });
}

describe("ExportService single-image downloads", () => {
  test("copies one selected image directly and keeps its file extension", async () => {
    const root = mkdtempSync(join(tmpdir(), "bulkimg-export-single-"));
    const database = new AppDatabase(root);
    createSession(database, "session-single");
    const assetId = addImage(database, root, "session-single", "social-post.png");
    const service = new ExportService(database, root);

    const result = await service.exportSelectedHistory([assetId]);

    expect(result).toMatchObject({ kind: "image", imageCount: 1 });
    expect(result.filePath).toEndWith(".png");
    expect(existsSync(result.filePath!)).toBe(true);
    expect(readFileSync(result.filePath!)).toEqual(pngBytes);
  });

  test("keeps multi-image exports as ZIP archives", async () => {
    const root = mkdtempSync(join(tmpdir(), "bulkimg-export-many-"));
    const database = new AppDatabase(root);
    createSession(database, "session-one");
    createSession(database, "session-two");
    const first = addImage(database, root, "session-one", "first.png");
    const second = addImage(database, root, "session-two", "second.png");
    const service = new ExportService(database, root);

    const result = await service.exportSelectedHistory([first, second]);

    expect(result).toMatchObject({ kind: "zip", imageCount: 2 });
    expect(result.filePath).toEndWith(".zip");
    const archive = unzipSync(new Uint8Array(readFileSync(result.filePath!)));
    expect(Object.keys(archive).filter((name) => name.includes("/images/")).length).toBe(2);
  });

  test("exports a one-image session and run as the image file", async () => {
    const root = mkdtempSync(join(tmpdir(), "bulkimg-export-run-"));
    const database = new AppDatabase(root);
    database.createBatchRun({ runId: "run-single", model: "gpt-image-2", mode: "direct", format: "square", quality: "medium", waveSize: 1, waveCount: 1, waveStrategy: "all", totalPrompts: 1, estimateUsd: 0.04, fxRate: 278 });
    createSession(database, "session-run-single", "run-single");
    addImage(database, root, "session-run-single", "one-result.png");
    const service = new ExportService(database, root);

    await expect(service.export("session-run-single")).resolves.toMatchObject({ kind: "image", imageCount: 1 });
    await expect(service.exportRun("run-single")).resolves.toMatchObject({ kind: "image", imageCount: 1 });
  });
});
