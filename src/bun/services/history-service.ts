import { copyFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { AppDatabase, SessionPromptRecord } from "../database";
import type { DirectImageResult } from "./openai-client";

type BatchOutputLine = {
  custom_id?: string;
  response?: {
    status_code?: number;
    body?: {
      data?: Array<{ b64_json?: string; url?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
  };
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "image";
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
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
    const managedRoot = `${resolve(this.historyDirectory).toLowerCase()}\\`;
    const candidate = resolve(filePath);
    if (!candidate.toLowerCase().startsWith(managedRoot)) throw new Error("History file is outside the managed asset directory.");
    return candidate;
  }

  private async imageBytes(result: { b64Json: string | null; url: string | null }): Promise<Uint8Array | null> {
    if (result.b64Json) return Buffer.from(result.b64Json, "base64");
    if (result.url) {
      const response = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Could not download generated image (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    }
    return null;
  }

  private filename(prompt: SessionPromptRecord): string {
    const ordinal = String(prompt.ordinal).padStart(2, "0");
    const detail = prompt.schedule_date || prompt.theme_column || prompt.prompt_text;
    return `${ordinal}_${slug(detail)}.png`;
  }

  private async persistOne(params: {
    sessionId: string;
    model: string;
    keyId: string | null;
    prompt: SessionPromptRecord;
    result: { b64Json: string | null; url: string | null; inputTokens: number; outputTokens: number };
  }): Promise<boolean> {
    const bytes = await this.imageBytes(params.result);
    if (!bytes) return false;
    const sessionDirectory = join(this.historyDirectory, params.sessionId);
    mkdirSync(sessionDirectory, { recursive: true });
    const imageFilename = this.filename(params.prompt);
    const filePath = join(sessionDirectory, imageFilename);
    await Bun.write(filePath, bytes);
    const telemetry = this.database.getTelemetry(params.sessionId);
    const promptShare = Math.max(1, telemetry.totalPrompts);
    const costUsd = telemetry.costUsd > 0 ? telemetry.costUsd / promptShare : 0;
    this.database.insertGeneratedAsset({
      assetId: crypto.randomUUID(),
      promptId: params.prompt.prompt_id,
      sessionId: params.sessionId,
      imageFilename,
      promptText: params.prompt.prompt_text,
      scheduleDate: params.prompt.schedule_date,
      week: params.prompt.week,
      themeColumn: params.prompt.theme_column,
      keyUsedId: params.keyId,
      filePath,
      model: params.model,
      inputTokens: params.result.inputTokens,
      outputTokens: params.result.outputTokens,
      costUsd,
      costPkr: costUsd * telemetry.fxRate,
    });
    return true;
  }

  async persistDirect(
    sessionId: string,
    model: string,
    keyId: string,
    images: DirectImageResult[],
  ): Promise<number> {
    const prompts = this.database.getSessionPrompts(sessionId);
    let saved = 0;
    for (const image of images) {
      const prompt = prompts[image.index];
      if (!prompt) continue;
      if (await this.persistOne({ sessionId, model, keyId, prompt, result: image })) saved += 1;
    }
    return saved;
  }

  async persistBatchOutput(sessionId: string, model: string, keyId: string | null, jsonl: string): Promise<number> {
    const prompts = this.database.getSessionPrompts(sessionId);
    const lines = jsonl.split(/\r?\n/).filter(Boolean);
    let saved = 0;
    for (const rawLine of lines) {
      const line = JSON.parse(rawLine) as BatchOutputLine;
      if ((line.response?.status_code ?? 500) >= 400) continue;
      const match = line.custom_id?.match(/prompt-(\d+)/);
      const index = match?.[1] ? Number(match[1]) - 1 : -1;
      const prompt = prompts[index];
      const data = line.response?.body?.data?.[0];
      if (!prompt || !data) continue;
      const usage = line.response?.body?.usage;
      if (await this.persistOne({
        sessionId,
        model,
        keyId,
        prompt,
        result: {
          b64Json: data.b64_json ?? null,
          url: data.url ?? null,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
        },
      })) saved += 1;
    }
    return saved;
  }

  list() {
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
    const destinationDirectory = join(this.downloadsDirectory, "BulkImg Studio");
    mkdirSync(destinationDirectory, { recursive: true });
    let destination = join(destinationDirectory, basename(asset.image_filename));
    if (existsSync(destination)) {
      const extension = extname(destination);
      const stem = basename(destination, extension);
      destination = join(destinationDirectory, `${stem}_${Date.now()}${extension}`);
    }
    copyFileSync(source, destination);
    Bun.spawn(["explorer.exe", `/select,${destination}`], { stdout: "ignore", stderr: "ignore" });
    return destination;
  }

  deletePrompt(promptId: string): { deletedAssets: number } {
    const result = this.database.deleteHistoryPrompt(promptId);
    for (const filePath of result.filePaths) {
      try {
        const managed = this.assertManagedPath(filePath);
        if (existsSync(managed)) unlinkSync(managed);
      } catch {
        // Database history is removed even if a stale file can no longer be managed.
      }
    }
    return { deletedAssets: result.deletedAssets };
  }

  clear(): { deletedPrompts: number; deletedAssets: number } {
    const result = this.database.clearHistoryRecords();
    for (const filePath of result.filePaths) {
      try {
        const managed = this.assertManagedPath(filePath);
        if (existsSync(managed)) unlinkSync(managed);
      } catch {
        // Ignore stale or unmanaged paths while clearing database history.
      }
    }
    return { deletedPrompts: result.deletedPrompts, deletedAssets: result.deletedAssets };
  }
}
