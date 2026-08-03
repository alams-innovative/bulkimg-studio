import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
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

export type DiagnosticLogReadOptions = {
  limit?: number;
  query?: string;
  event?: string;
};

export type DiagnosticLogReadResult = {
  lines: string[];
  path: string;
  events: string[];
  total: number;
};

export class DiagnosticLog {
  private readonly directory: string;
  private readonly path: string;

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, "logs");
    this.path = join(this.directory, "bulkimg.log");
    mkdirSync(this.directory, { recursive: true });
  }

  get logPath(): string {
    return this.path;
  }

  get logDirectory(): string {
    return this.directory;
  }

  async write(event: string, fields: Record<string, unknown> = {}): Promise<void> {
    try {
      this.rotate();
      const safeFields = redact(fields) as Record<string, unknown>;
      appendFileSync(this.path, `${JSON.stringify({ at: new Date().toISOString(), event, ...safeFields })}\n`, "utf8");
    } catch { /* diagnostics must never block generation */ }
  }

  read(options: DiagnosticLogReadOptions = {}): DiagnosticLogReadResult {
    const limit = Math.min(Math.max(options.limit ?? 300, 1), 2_000);
    const query = options.query?.trim().toLowerCase() ?? "";
    const eventFilter = options.event?.trim() ?? "";
    const sources = [`${this.path}.3`, `${this.path}.2`, `${this.path}.1`, this.path]
      .filter((candidate) => existsSync(candidate));

    const all: string[] = [];
    for (const source of sources) {
      try {
        const content = readFileSync(source, "utf8");
        for (const line of content.split(/\r?\n/)) {
          if (line.trim()) all.push(line);
        }
      } catch { /* skip unreadable rotated segments */ }
    }

    const events = new Set<string>();
    for (const line of all) {
      try {
        const parsed = JSON.parse(line) as { event?: unknown };
        if (typeof parsed.event === "string" && parsed.event) events.add(parsed.event);
      } catch { /* keep raw lines listable even if malformed */ }
    }

    let filtered = all;
    if (eventFilter) {
      filtered = filtered.filter((line) => {
        try {
          return (JSON.parse(line) as { event?: string }).event === eventFilter;
        } catch {
          return false;
        }
      });
    }
    if (query) {
      filtered = filtered.filter((line) => line.toLowerCase().includes(query));
    }

    return {
      lines: filtered.slice(-limit),
      path: this.path,
      events: [...events].sort(),
      total: filtered.length,
    };
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
  const directories = [
    dataDirectory,
    join(dataDirectory, "references"),
    join(dataDirectory, "exports"),
    join(dataDirectory, "batches"),
  ];
  let removed = 0;
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    const resolvedDirectory = resolve(directory).toLowerCase();
    if (resolvedDirectory !== root && !resolvedDirectory.startsWith(`${root}\\`)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || ![".tmp", ".download", ".partial", ".jsonl"].includes(extname(entry.name).toLowerCase())) continue;
      // Only purge temporary .jsonl downloads, not permanent user files (none live here).
      if (extname(entry.name).toLowerCase() === ".jsonl" && !entry.name.includes("-output")) continue;
      const path = join(directory, entry.name);
      if (Date.now() - statSync(path).mtimeMs < STALE_MS) continue;
      try { unlinkSync(path); removed += 1; } catch { /* in-use files survive cleanup */ }
    }
  }
  return removed;
}
