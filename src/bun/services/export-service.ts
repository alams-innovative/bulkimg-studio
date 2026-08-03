import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { AppDatabase } from "../database";
import { pickSaveFile, showNotification } from "./windows-native";

function csvValue(value: string | number): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, string | number>>): string {
  const headers = [
    "Image_Filename", "Week", "Schedule_Date", "Theme_Column", "Prompt_Text",
    "Model_Used", "Seed", "Input_Tokens", "Output_Tokens", "Cost_USD", "Cost_PKR",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header] ?? "")).join(",")),
  ].join("\r\n");
}

export class ExportService {
  constructor(private readonly database: AppDatabase, private readonly dataDirectory: string) {}

  async export(sessionId: string, options?: { pickPath?: boolean }): Promise<string> {
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
    const readme = `# BulkImg Studio export\r\n\r\n` +
      `- Session: ${sessionId}\r\n` +
      `- Exported: ${new Date().toISOString()}\r\n` +
      `- Prompt count: ${rows.length}\r\n` +
      `- Image count: ${assets.length}\r\n` +
      `- Status: ${telemetry.status}\r\n` +
      `- Cost: $${telemetry.costUsd.toFixed(4)} / Rs. ${telemetry.costPkr.toFixed(2)}\r\n\r\n` +
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
    const exportsDirectory = join(this.dataDirectory, "exports");
    mkdirSync(exportsDirectory, { recursive: true });
    let filePath = join(exportsDirectory, `${root}.zip`);

    if (options?.pickPath) {
      const chosen = await pickSaveFile({
        title: "Export session ZIP",
        defaultName: `${root}.zip`,
        filter: "*.zip",
        filterLabel: "ZIP archive",
      });
      if (chosen) filePath = chosen;
    }

    await Bun.write(filePath, archive);
    void showNotification("BulkImg Studio", `Exported ${assets.length} image(s) to ZIP.`);
    return filePath;
  }

  list() {
    const exportsDirectory = join(this.dataDirectory, "exports");
    mkdirSync(exportsDirectory, { recursive: true });
    return readdirSync(exportsDirectory)
      .filter((name) => name.toLowerCase().endsWith(".zip"))
      .map((name) => {
        const filePath = join(exportsDirectory, name);
        const stat = statSync(filePath);
        return { name, filePath, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
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
