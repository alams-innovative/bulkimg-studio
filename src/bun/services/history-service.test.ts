import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppDatabase } from "../database";
import { DiagnosticLog } from "./diagnostics";
import { HistoryService } from "./history-service";

function tinyPngBase64(): string {
  // 1x1 PNG
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

function makeOutputLine(customId: string, b64: string): string {
  return JSON.stringify({
    custom_id: customId,
    response: {
      status_code: 200,
      body: {
        data: [{ b64_json: b64 }],
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    },
  });
}

describe("HistoryService batch JSONL persist", () => {
  test("persists batch lines from disk one by one", async () => {
    const root = mkdtempSync(join(tmpdir(), "bulkimg-history-"));
    const database = new AppDatabase(root);
    const history = new HistoryService(database, root, join(root, "downloads"));
    const b64 = tinyPngBase64();
    database.createSession("session-batch", {
      prompts: [
        { promptText: "one", week: "1", scheduleDate: "Mon", themeColumn: "A" },
        { promptText: "two", week: "1", scheduleDate: "Tue", themeColumn: "B" },
      ],
      model: "gpt-image-2",
      mode: "batch",
      format: "square",
      quality: "low",
    }, 280, { costUsd: 0.1, pricingVersion: "test" });

    const filePath = join(root, "output.jsonl");
    writeFileSync(filePath, `${makeOutputLine("prompt-00001", b64)}\n${makeOutputLine("prompt-00002", b64)}\n`, "utf8");

    const progress: number[] = [];
    const result = await history.persistBatchOutputFromFile(
      "session-batch",
      "gpt-image-2",
      null,
      filePath,
      (input, output) => input + output,
      (partial) => { progress.push(partial.saved); },
    );

    expect(result.saved).toBe(2);
    expect(result.failed).toBe(0);
    expect(progress).toEqual([1, 2]);
    expect(database.aggregatePromptUsage("session-batch").completed).toBe(2);
    expect(history.list().filter((item) => item.hasImage)).toHaveLength(2);
  });
});

describe("DiagnosticLog.read", () => {
  test("filters events and keeps copy-ready lines", async () => {
    const root = mkdtempSync(join(tmpdir(), "bulkimg-logs-"));
    mkdirSync(join(root, "logs"), { recursive: true });
    const log = new DiagnosticLog(root);
    await log.write("session_created", { sessionId: "s1" });
    await log.write("batch_download_error", { sessionId: "s1", message: "timeout", secret: "sk-abcdefghijklmnopqrstuvwxyz" });
    await log.write("batch_terminal", { sessionId: "s1", status: "completed" });

    const all = log.read({ limit: 50 });
    expect(all.total).toBe(3);
    expect(all.events).toContain("batch_download_error");
    expect(all.lines.join("\n")).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");

    const filtered = log.read({ event: "batch_download_error" });
    expect(filtered.lines).toHaveLength(1);
    expect(filtered.lines[0]).toContain("batch_download_error");

    const query = log.read({ query: "timeout" });
    expect(query.lines).toHaveLength(1);
  });
});
