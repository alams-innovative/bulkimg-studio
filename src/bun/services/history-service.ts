import { createReadStream, copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { basename, extname, join, resolve } from "node:path";
import type { AppDatabase, SessionPromptRecord } from "../database";
import type { SanitizedProviderError } from "../../shared/contracts";
import type { DirectImageResult } from "./openai-client";

type BatchOutputLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    request_id?: string;
    body?: {
      data?: Array<{ b64_json?: string; url?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
  };
  error?: { message?: string };
};

export type BatchPersistResult = {
  saved: number;
  failed: number;
  malformed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "image";
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "image/png";
  }
}

export class HistoryService {
  private readonly historyDirectory: string;

  constructor(
    private readonly database: AppDatabase,
    dataDirectory: string,
    private readonly downloadsDirectory: string,
  ) {
    this.historyDirectory = join(dataDirectory, "history");
    mkdirSync(this.historyDirectory, { recursive: true });
  }

  private assertManagedPath(filePath: string): string {
    const root = resolve(this.historyDirectory).toLowerCase();
    const candidate = resolve(filePath);
    if (candidate.toLowerCase() !== root && !candidate.toLowerCase().startsWith(`${root}\\`)) {
      throw new Error("History file is outside the managed asset directory.");
    }
    return candidate;
  }

  private async imageBytes(result: { b64Json: string | null; url: string | null }): Promise<Uint8Array | null> {
    if (result.b64Json) return Buffer.from(result.b64Json, "base64");
    if (!result.url) return null;
    const response = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not download generated image (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }

  private filename(prompt: SessionPromptRecord): string {
    return `${String(prompt.ordinal).padStart(3, "0")}_${slug(prompt.schedule_date || prompt.theme_column || prompt.prompt_text)}.png`;
  }

  private async persistOne(params: {
    sessionId: string;
    model: string;
    keyId: string | null;
    prompt: SessionPromptRecord;
    sourceKey: string;
    costUsd: number;
    result: { b64Json: string | null; url: string | null; inputTokens: number; outputTokens: number };
  }): Promise<boolean> {
    const bytes = await this.imageBytes(params.result);
    if (!bytes || this.database.isSessionCancelled(params.sessionId)) return false;
    const sessionDirectory = join(this.historyDirectory, params.sessionId);
    mkdirSync(sessionDirectory, { recursive: true });
    const imageFilename = this.filename(params.prompt);
    const filePath = join(sessionDirectory, imageFilename);
    await Bun.write(filePath, bytes);
    const telemetry = this.database.getTelemetry(params.sessionId);
    const inserted = this.database.insertGeneratedAsset({
      assetId: crypto.randomUUID(), promptId: params.prompt.prompt_id, sessionId: params.sessionId,
      imageFilename, promptText: params.prompt.prompt_text, scheduleDate: params.prompt.schedule_date,
      week: params.prompt.week, themeColumn: params.prompt.theme_column, keyUsedId: params.keyId,
      filePath, model: params.model, inputTokens: params.result.inputTokens,
      outputTokens: params.result.outputTokens, costUsd: params.costUsd,
      costPkr: params.costUsd * telemetry.fxRate, sourceKey: params.sourceKey,
    });
    if (!inserted) {
      try { unlinkSync(filePath); } catch { /* cancellation may race with file cleanup */ }
      return false;
    }
    this.database.completePrompt(params.prompt.prompt_id, {
      inputTokens: params.result.inputTokens,
      outputTokens: params.result.outputTokens,
      costUsd: params.costUsd,
    });
    return true;
  }

  async persistDirect(params: {
    sessionId: string; model: string; keyId: string; prompt: SessionPromptRecord;
    result: DirectImageResult; costUsd: number;
  }): Promise<boolean> {
    return this.persistOne({ ...params, sourceKey: `${params.sessionId}:prompt:${params.prompt.prompt_id}` });
  }

  async persistBatchOutput(
    sessionId: string,
    model: string,
    keyId: string | null,
    jsonl: string,
    usageCost: (inputTokens: number, outputTokens: number) => number,
    onProgress?: (progress: BatchPersistResult) => void | Promise<void>,
  ): Promise<BatchPersistResult> {
    return this.persistBatchLines(sessionId, model, keyId, jsonl.split(/\r?\n/).filter(Boolean), usageCost, onProgress);
  }

  /** Stream JSONL line-by-line so multi-MB base64 rows never sit wholly in one string. */
  async persistBatchOutputFromFile(
    sessionId: string,
    model: string,
    keyId: string | null,
    filePath: string,
    usageCost: (inputTokens: number, outputTokens: number) => number,
    onProgress?: (progress: BatchPersistResult) => void | Promise<void>,
  ): Promise<BatchPersistResult> {
    if (!existsSync(filePath)) throw new Error("Batch output file is missing.");
    const result: BatchPersistResult = { saved: 0, failed: 0, malformed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const prompts = this.database.getSessionPrompts(sessionId);
    const reader = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    try {
      for await (const rawLine of reader) {
        if (!rawLine.trim()) continue;
        await this.persistBatchLine(sessionId, model, keyId, rawLine, prompts, usageCost, result);
        await onProgress?.(result);
      }
    } finally {
      reader.close();
    }
    return result;
  }

  private async persistBatchLines(
    sessionId: string,
    model: string,
    keyId: string | null,
    lines: string[],
    usageCost: (inputTokens: number, outputTokens: number) => number,
    onProgress?: (progress: BatchPersistResult) => void | Promise<void>,
  ): Promise<BatchPersistResult> {
    const prompts = this.database.getSessionPrompts(sessionId);
    const result: BatchPersistResult = { saved: 0, failed: 0, malformed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    for (const rawLine of lines) {
      await this.persistBatchLine(sessionId, model, keyId, rawLine, prompts, usageCost, result);
      await onProgress?.(result);
    }
    return result;
  }

  private async persistBatchLine(
    sessionId: string,
    model: string,
    keyId: string | null,
    rawLine: string,
    prompts: SessionPromptRecord[],
    usageCost: (inputTokens: number, outputTokens: number) => number,
    result: BatchPersistResult,
  ): Promise<void> {
    let line: BatchOutputLine;
    try { line = JSON.parse(rawLine) as BatchOutputLine; } catch { result.malformed += 1; return; }
    const match = line.custom_id?.match(/^prompt-(\d+)$/);
    const index = match?.[1] ? Number(match[1]) - 1 : -1;
    const prompt = prompts[index];
    if (!prompt) { result.malformed += 1; return; }
    const status = line.response?.status_code ?? 500;
    const data = line.response?.body?.data?.[0];
    if (status >= 400 || !data) {
      const error: SanitizedProviderError = {
        message: (line.response?.body?.error?.message || line.error?.message || "OpenAI did not return an image.").slice(0, 240),
        category: status === 429 ? "rate_limit" : status >= 500 ? "provider" : "validation",
        httpStatus: status,
        requestId: line.response?.request_id ?? null,
        retryAt: null,
      };
      this.database.failPrompt(prompt.prompt_id, error);
      result.failed += 1;
      return;
    }
    const inputTokens = line.response?.body?.usage?.input_tokens ?? 0;
    const outputTokens = line.response?.body?.usage?.output_tokens ?? 0;
    const costUsd = usageCost(inputTokens, outputTokens);
    if (await this.persistOne({
      sessionId, model, keyId, prompt, sourceKey: `${sessionId}:${line.custom_id}`,
      costUsd, result: { b64Json: data.b64_json ?? null, url: data.url ?? null, inputTokens, outputTokens },
    })) result.saved += 1;
    result.inputTokens += inputTokens;
    result.outputTokens += outputTokens;
    result.costUsd += costUsd;
  }

  list() {
    this.database.reconcileMissingAssets(existsSync);
    return this.database.listHistory();
  }

  async imageDataUrl(assetId: string): Promise<string> {
    const asset = this.database.getAsset(assetId);
    if (!asset) throw new Error("History image was not found.");
    const filePath = this.assertManagedPath(asset.file_path);
    if (!existsSync(filePath)) throw new Error("The stored image file is missing.");
    const data = Buffer.from(await Bun.file(filePath).arrayBuffer()).toString("base64");
    return `data:${mimeType(filePath)};base64,${data}`;
  }

  download(assetId: string): string {
    const asset = this.database.getAsset(assetId);
    if (!asset) throw new Error("History image was not found.");
    const source = this.assertManagedPath(asset.file_path);
    if (!existsSync(source)) throw new Error("The stored image file is missing.");
    const directory = join(this.downloadsDirectory, "BulkImg Studio");
    mkdirSync(directory, { recursive: true });
    let destination = join(directory, basename(asset.image_filename));
    if (existsSync(destination)) {
      const extension = extname(destination);
      destination = join(directory, `${basename(destination, extension)}_${Date.now()}${extension}`);
    }
    copyFileSync(source, destination);
    Bun.spawn(["explorer.exe", `/select,${destination}`], { stdout: "ignore", stderr: "ignore" });
    return destination;
  }

  deletePrompt(promptId: string): { deletedAssets: number } {
    const result = this.database.deleteHistoryPrompt(promptId);
    for (const filePath of result.filePaths) {
      try { const managed = this.assertManagedPath(filePath); if (existsSync(managed)) unlinkSync(managed); } catch { /* stale */ }
    }
    return { deletedAssets: result.deletedAssets };
  }

  clear(): { deletedPrompts: number; deletedAssets: number } {
    const result = this.database.clearHistoryRecords();
    for (const filePath of result.filePaths) {
      try { const managed = this.assertManagedPath(filePath); if (existsSync(managed)) unlinkSync(managed); } catch { /* stale */ }
    }
    return { deletedPrompts: result.deletedPrompts, deletedAssets: result.deletedAssets };
  }
}
