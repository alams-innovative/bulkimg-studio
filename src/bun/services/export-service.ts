import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { AppDatabase } from "../database";

function csvValue(value: string | number): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, string | number>>): string {
  const headers = ["Ordinal", "Week", "Schedule_Date", "Theme_Column", "Prompt_Text"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header] ?? "")).join(",")),
  ].join("\r\n");
}

export class ExportService {
  constructor(private readonly database: AppDatabase, private readonly dataDirectory: string) {}

  async export(sessionId: string): Promise<string> {
    const telemetry = this.database.getTelemetry(sessionId);
    const rows = this.database.getExportRows(sessionId);
    const timestamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const root = `BulkImg_Export_${timestamp}`;
    const mapping = rows.map((row) => [
      `#${row["Ordinal"]}`,
      `Week: ${row["Week"]}`,
      `Schedule: ${row["Schedule_Date"]}`,
      `Theme: ${row["Theme_Column"]}`,
      `Prompt: ${row["Prompt_Text"]}`,
    ].join("\r\n")).join("\r\n\r\n");
    const readme = `# BulkImg Studio export\r\n\r\n` +
      `- Session: ${sessionId}\r\n` +
      `- Exported: ${new Date().toISOString()}\r\n` +
      `- Prompt count: ${rows.length}\r\n` +
      `- Status: ${telemetry.status}\r\n` +
      `- Cost: $${telemetry.costUsd.toFixed(4)} / Rs. ${telemetry.costPkr.toFixed(2)}\r\n\r\n` +
      `Generated images are placed under images/ when output persistence is enabled.\r\n`;

    const archive = zipSync({
      [`${root}/images/.gitkeep`]: new Uint8Array(),
      [`${root}/metadata.csv`]: strToU8(rowsToCsv(rows)),
      [`${root}/prompt_mapping.txt`]: strToU8(mapping),
      [`${root}/README.md`]: strToU8(readme),
    }, { level: 6 });

    const exportsDirectory = join(this.dataDirectory, "exports");
    mkdirSync(exportsDirectory, { recursive: true });
    const filePath = join(exportsDirectory, `${root}.zip`);
    await Bun.write(filePath, archive);
    return filePath;
  }
}
