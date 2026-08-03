import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const MAX_LOG_BYTES = 1_000_000;
const STALE_MS = 24 * 60 * 60 * 1000;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED_KEY]")
      .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[REDACTED_BINARY]")
      .slice(0, 500);
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/prompt|image|keyValue|apiKey/i.test(key)).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}

export class DiagnosticLog {
  private readonly directory: string;
  private readonly path: string;

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, "logs");
    this.path = join(this.directory, "bulkimg.log");
    mkdirSync(this.directory, { recursive: true });
  }

  async write(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    try {
      this.rotate();
      const safeFields = redact(fields) as Record<string, unknown>;
      appendFileSync(this.path, `${JSON.stringify({ at: new Date().toISOString(), event, ...safeFields })}\n`, "utf8");
    } catch { /* diagnostics must never block generation */ }
  }

  private rotate(): void {
    if (!existsSync(this.path) || statSync(this.path).size < MAX_LOG_BYTES) return;
    for (let index = 2; index >= 1; index -= 1) {
      const source = `${this.path}.${index}`;
      const target = `${this.path}.${index + 1}`;
      if (existsSync(target)) unlinkSync(target);
      if (existsSync(source)) renameSync(source, target);
    }
    renameSync(this.path, `${this.path}.1`);
  }
}

export function cleanupStaleTemporaryFiles(dataDirectory: string): number {
  const root = resolve(dataDirectory).toLowerCase();
  const directories = [dataDirectory, join(dataDirectory, "references"), join(dataDirectory, "exports")];
  let removed = 0;
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    const resolvedDirectory = resolve(directory).toLowerCase();
    if (resolvedDirectory !== root && !resolvedDirectory.startsWith(`${root}\\`)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || ![".tmp", ".download", ".partial"].includes(extname(entry.name).toLowerCase())) continue;
      const path = join(directory, entry.name);
      if (Date.now() - statSync(path).mtimeMs < STALE_MS) continue;
      try { unlinkSync(path); removed += 1; } catch { /* in-use files survive cleanup */ }
    }
  }
  return removed;
}
