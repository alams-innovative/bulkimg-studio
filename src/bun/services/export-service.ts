import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { AppDatabase } from "../database";
import type { ExportResult } from "../../shared/contracts";
import { pickSaveFile, showNotification } from "./windows-native";

type LocalAsset = { image_filename: string; file_path: string };

function csvValue(value: string | number): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, string | number>>): string {
  const headers = [
    "Ordinal", "Image_Filename", "Week", "Schedule_Date", "Theme_Column", "Prompt_Text",
    "Model_Used", "Seed", "Input_Tokens", "Output_Tokens", "Cost_USD", "Cost_PKR",
    "Key_Used",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header] ?? "")).join(",")),
  ].join("\r\n");
}

export class ExportService {
  constructor(private readonly database: AppDatabase, private readonly dataDirectory: string) {}

  private exportsDirectory(): string {
    const directory = join(this.dataDirectory, "exports");
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  private async exportSingleImage(asset: LocalAsset, root: string, options?: { pickPath?: boolean }): Promise<ExportResult> {
    const extension = extname(asset.image_filename) || extname(asset.file_path) || ".png";
    const filename = basename(asset.image_filename) || `image${extension}`;
    let filePath = join(this.exportsDirectory(), `${root}_${filename}`);
    if (options?.pickPath) {
      const chosen = await pickSaveFile({
        title: "Download image",
        defaultName: filename,
        filter: `*${extension}`,
        filterLabel: `${extension.slice(1).toUpperCase()} image`,
      });
      if (!chosen) return { filePath: null, kind: "image", imageCount: 1 };
      filePath = extname(chosen).toLowerCase() === extension.toLowerCase() ? chosen : `${chosen}${extension}`;
    }
    copyFileSync(asset.file_path, filePath);
    void showNotification("BulkImg Studio", "Downloaded 1 image.");
    return { filePath, kind: "image", imageCount: 1 };
  }

  async export(sessionId: string, options?: { pickPath?: boolean }): Promise<ExportResult> {
    const telemetry = this.database.getTelemetry(sessionId);
    const rows = this.database.getExportRows(sessionId);
    const assets = this.database.listSessionAssets(sessionId);
    const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const root = `BulkImg_Export_${timestamp}`;
    const mapping = rows.map((row) => [
      `#${row["Ordinal"]}`,
      `Image: ${row["Image_Filename"] || "(pending)"}`,
      `Week: ${row["Week"]}`,
      `Schedule: ${row["Schedule_Date"]}`,
      `Theme: ${row["Theme_Column"]}`,
      `Model: ${row["Model_Used"]}`,
      `Seed: ${row["Seed"]}`,
      `Key: ${row["Key_Used"]}`,
      `Prompt: ${row["Prompt_Text"]}`,
    ].join("\r\n")).join("\r\n\r\n");
    const availableAssets = assets.filter((asset) => existsSync(asset.file_path));
    if (availableAssets.length === 1) return this.exportSingleImage(availableAssets[0]!, root, options);
    const missing = assets.filter((asset) => !existsSync(asset.file_path));
    const readme = `# BulkImg Studio export\r\n\r\n` +
      `- Session: ${sessionId}\r\n` +
      `- Exported: ${new Date().toISOString()}\r\n` +
      `- Prompt count: ${rows.length}\r\n` +
      `- Image count: ${assets.length}\r\n` +
      `- Status: ${telemetry.status}\r\n` +
      `- Cost: $${telemetry.costUsd.toFixed(4)} / PKR ${telemetry.costPkr.toFixed(2)}\r\n` +
      `- Missing local files skipped: ${missing.length}\r\n\r\n` +
      `See images/ for generated PNG files, metadata.csv for structured rows, and prompt_mapping.txt for the human-readable manifest.\r\n`;

    const files: Record<string, Uint8Array> = {
      [`${root}/metadata.csv`]: strToU8(rowsToCsv(rows)),
      [`${root}/prompt_mapping.txt`]: strToU8(mapping),
      [`${root}/README.md`]: strToU8(readme),
    };

    if (assets.length === 0) {
      files[`${root}/images/.gitkeep`] = new Uint8Array();
    } else {
      for (const asset of assets) {
        if (!existsSync(asset.file_path)) continue;
        const bytes = new Uint8Array(await Bun.file(asset.file_path).arrayBuffer());
        files[`${root}/images/${asset.image_filename}`] = bytes;
      }
    }

    const archive = zipSync(files, { level: 6 });
    let filePath = join(this.exportsDirectory(), `${root}.zip`);

    if (options?.pickPath) {
      const chosen = await pickSaveFile({
        title: "Export session ZIP",
        defaultName: `${root}.zip`,
        filter: "*.zip",
        filterLabel: "ZIP archive",
      });
      if (!chosen) return { filePath: null, kind: "zip", imageCount: availableAssets.length };
      filePath = chosen;
    }

    await Bun.write(filePath, archive);
    void showNotification("BulkImg Studio", `Exported ${availableAssets.length} image(s) to ZIP.`);
    return { filePath, kind: "zip", imageCount: availableAssets.length };
  }

  async exportRun(runId: string, options?: { pickPath?: boolean }): Promise<ExportResult> {
    const sessionIds = this.database.listSessionIdsForRun(runId);
    if (!sessionIds.length) throw new Error("That run has no sessions to export.");
    const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const root = `BulkImg_Run_${timestamp}`;
    const files: Record<string, Uint8Array> = {};
    const availableAssets: LocalAsset[] = [];
    let imageCount = 0;
    for (const sessionId of sessionIds) {
      const rows = this.database.getExportRows(sessionId);
      const assets = this.database.listSessionAssets(sessionId);
      files[`${root}/${sessionId}/metadata.csv`] = strToU8(rowsToCsv(rows));
      for (const asset of assets) {
        if (!existsSync(asset.file_path)) continue;
        availableAssets.push(asset);
        const bytes = new Uint8Array(await Bun.file(asset.file_path).arrayBuffer());
        files[`${root}/${sessionId}/images/${asset.image_filename}`] = bytes;
        imageCount += 1;
      }
    }
    if (availableAssets.length === 1) return this.exportSingleImage(availableAssets[0]!, root, options);
    files[`${root}/README.md`] = strToU8(
      `# BulkImg Studio run export\r\n\r\n- Run: ${runId}\r\n- Sessions: ${sessionIds.length}\r\n- Images: ${imageCount}\r\n`,
    );
    const archive = zipSync(files, { level: 6 });
    let filePath = join(this.exportsDirectory(), `${root}.zip`);
    if (options?.pickPath) {
      const chosen = await pickSaveFile({
        title: "Export run ZIP",
        defaultName: `${root}.zip`,
        filter: "*.zip",
        filterLabel: "ZIP archive",
      });
      if (!chosen) return { filePath: null, kind: "zip", imageCount };
      filePath = chosen;
    }
    await Bun.write(filePath, archive);
    void showNotification("BulkImg Studio", `Exported run (${imageCount} image(s)).`);
    return { filePath, kind: "zip", imageCount };
  }

  async exportSelectedHistory(assetIds: string[], options?: { pickPath?: boolean }): Promise<ExportResult> {
    const uniqueIds = [...new Set(assetIds.filter(Boolean))];
    if (!uniqueIds.length) throw new Error("Choose at least one image to download.");
    const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const root = `BulkImg_Selected_${timestamp}`;
    const files: Record<string, Uint8Array> = {};
    const availableAssets: LocalAsset[] = [];
    let imageCount = 0;
    for (const assetId of uniqueIds) {
      const asset = this.database.getAsset(assetId);
      if (!asset || !existsSync(asset.file_path)) continue;
      availableAssets.push(asset);
      const filename = imageCount ? `${imageCount + 1}_${asset.image_filename}` : asset.image_filename;
      files[`${root}/images/${filename}`] = new Uint8Array(await Bun.file(asset.file_path).arrayBuffer());
      imageCount += 1;
    }
    if (!imageCount) throw new Error("The selected images are no longer available locally.");
    if (availableAssets.length === 1) return this.exportSingleImage(availableAssets[0]!, root, options);
    files[`${root}/README.md`] = strToU8(`# BulkImg Studio selected images\r\n\r\n- Images: ${imageCount}\r\n- Exported: ${new Date().toISOString()}\r\n`);
    const archive = zipSync(files, { level: 6 });
    let filePath = join(this.exportsDirectory(), `${root}.zip`);
    if (options?.pickPath) {
      const chosen = await pickSaveFile({ title: "Download selected images", defaultName: `${root}.zip`, filter: "*.zip", filterLabel: "ZIP archive" });
      if (!chosen) return { filePath: null, kind: "zip", imageCount };
      filePath = chosen;
    }
    await Bun.write(filePath, archive);
    void showNotification("BulkImg Studio", `Downloaded ${imageCount} selected image(s) as a ZIP.`);
    return { filePath, kind: "zip", imageCount };
  }

  list() {
    const exportsDirectory = join(this.dataDirectory, "exports");
    mkdirSync(exportsDirectory, { recursive: true });
    return readdirSync(exportsDirectory)
      .filter((name) => /\.(zip|png|jpe?g|webp|avif|gif|bmp|tiff)$/i.test(name))
      .map((name) => {
        const filePath = join(exportsDirectory, name);
        const stat = statSync(filePath);
        return { name, filePath, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), kind: name.toLowerCase().endsWith(".zip") ? "zip" as const : "image" as const };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  revealFolder(): string {
    const exportsDirectory = join(this.dataDirectory, "exports");
    mkdirSync(exportsDirectory, { recursive: true });
    Bun.spawn(["explorer.exe", exportsDirectory], { stdout: "ignore", stderr: "ignore" });
    return exportsDirectory;
  }

  copyExportTo(filePath: string, destination: string): string {
    copyFileSync(filePath, destination);
    return destination;
  }
}
