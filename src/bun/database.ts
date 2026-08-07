import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ApiKeyStats, AppSettings, ConverterJob, ConverterJobItem, ConverterOptions, ConverterSourceImage, HistoryItem, OutputFormatId, PromptStatus, QualityTier, RateLimitSnapshot,
  RunMode, RunPhase, RunSummary, SanitizedProviderError, SessionPromptOutcome, SessionStatus,
  SessionSummary, SessionTelemetry, SubmitRunInput, UsageSummary, UsageTotals,
} from "../shared/contracts";
import { APP_LIMITS } from "../shared/contracts";
import { isOutputFormatId, legacySizeToFormat, outputSize } from "../shared/output-formats";
import { estimateEtaMs } from "./services/eta";

export type ApiKeyRecord = {
  id: string;
  key_value: string;
  label: string;
  key_hint: string;
  is_active: number;
  rate_limited_until: string | null;
};

export type SessionPromptRecord = {
  prompt_id: string;
  ordinal: number;
  prompt_text: string;
  schedule_date: string;
  week: string;
  theme_column: string;
  status: PromptStatus;
  error_message: string | null;
  attempts: number;
};

export type GeneratedAssetRecord = {
  asset_id: string;
  prompt_id: string | null;
  session_id: string;
  image_filename: string;
  file_path: string;
};

export type SessionRunContext = {
  sessionId: string;
  model: string;
  runMode: RunMode;
  format: OutputFormatId;
  quality: QualityTier;
  referenceFileIds: string[];
};

function serializeError(error: SanitizedProviderError | null): string | null {
  return error ? JSON.stringify(error) : null;
}

function parseError(value: string | null): SanitizedProviderError | null {
  if (!value) return null;
  try { return JSON.parse(value) as SanitizedProviderError; } catch {
    return { message: value, category: "unknown", httpStatus: null, requestId: null, retryAt: null };
  }
}

export class AppDatabase {
  readonly db: Database;

  constructor(dataDirectory: string) {
    mkdirSync(dataDirectory, { recursive: true });
    const databasePath = join(dataDirectory, "bulkimg-studio.db");
    const backupPath = join(dataDirectory, "bulkimg-studio.pre-v4.backup.db");
    if (existsSync(databasePath) && !existsSync(backupPath)) copyFileSync(databasePath, backupPath);
    this.db = new Database(databasePath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    try {
      this.db.transaction(() => this.migrate())();
    } catch (error) {
      this.db.close();
      throw new Error(`Database migration failed. Your pre-migration backup is at ${backupPath}.`, { cause: error });
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        key_value TEXT NOT NULL,
        label TEXT,
        is_active INTEGER DEFAULT 1,
        rate_limited_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS batch_sessions (
        session_id TEXT PRIMARY KEY,
        external_batch_id TEXT,
        model_used TEXT NOT NULL,
        run_mode TEXT NOT NULL DEFAULT 'batch',
        total_prompts INTEGER NOT NULL,
        completed_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        status_message TEXT DEFAULT '',
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0.0,
        cost_pkr REAL DEFAULT 0.0,
        fx_rate REAL DEFAULT 276.61
      );

      CREATE TABLE IF NOT EXISTS generated_assets (
        asset_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        image_filename TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        schedule_date TEXT,
        week TEXT,
        theme_column TEXT,
        seed_value TEXT,
        key_used_id TEXT,
        file_path TEXT NOT NULL,
        model_used TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0.0,
        cost_pkr REAL DEFAULT 0.0,
        FOREIGN KEY(session_id) REFERENCES batch_sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS session_prompts (
        prompt_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        schedule_date TEXT,
        week TEXT,
        theme_column TEXT,
        FOREIGN KEY(session_id) REFERENCES batch_sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS fx_cache (
        currency_pair TEXT PRIMARY KEY,
        exchange_rate REAL NOT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.ensureColumn("api_keys", "key_hint", "TEXT NOT NULL DEFAULT '••••'");
    this.ensureColumn("api_keys", "last_used_at", "DATETIME");
    this.ensureColumn("api_keys", "total_requests", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("api_keys", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("api_keys", "output_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("api_keys", "cost_usd", "REAL NOT NULL DEFAULT 0.0");
    this.ensureColumn("api_keys", "cost_pkr", "REAL NOT NULL DEFAULT 0.0");
    this.ensureColumn("batch_sessions", "key_used_id", "TEXT");
    this.ensureColumn("batch_sessions", "quality", "TEXT NOT NULL DEFAULT 'high'");
    this.ensureColumn("batch_sessions", "size_used", "TEXT NOT NULL DEFAULT '1024x1024'");
    this.ensureColumn("batch_sessions", "reference_file_id", "TEXT");
    this.ensureColumn("batch_sessions", "output_format", "TEXT NOT NULL DEFAULT 'square'");
    this.ensureColumn("batch_sessions", "diagnostic_id", "TEXT");
    this.ensureColumn("batch_sessions", "last_provider_error", "TEXT");
    this.ensureColumn("batch_sessions", "next_poll_at", "DATETIME");
    this.ensureColumn("batch_sessions", "poll_attempts", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("batch_sessions", "estimate_usd", "REAL NOT NULL DEFAULT 0.0");
    this.ensureColumn("batch_sessions", "pricing_version", "TEXT NOT NULL DEFAULT 'legacy'");
    this.ensureColumn("generated_assets", "prompt_id", "TEXT");
    this.ensureColumn("generated_assets", "source_key", "TEXT");
    this.ensureColumn("session_prompts", "status", "TEXT NOT NULL DEFAULT 'pending'");
    this.ensureColumn("session_prompts", "error_message", "TEXT");
    this.ensureColumn("session_prompts", "attempts", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("session_prompts", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("session_prompts", "output_tokens", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("session_prompts", "cost_usd", "REAL NOT NULL DEFAULT 0.0");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reference_files (
        file_id TEXT PRIMARY KEY,
        local_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        key_used_id TEXT,
        remote_deleted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS session_reference_files (
        session_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        PRIMARY KEY(session_id, ordinal),
        UNIQUE(session_id, file_id),
        FOREIGN KEY(session_id) REFERENCES batch_sessions(session_id),
        FOREIGN KEY(file_id) REFERENCES reference_files(file_id)
      );
    `);
    this.ensureColumn("reference_files", "key_used_id", "TEXT");
    this.ensureColumn("reference_files", "remote_deleted_at", "DATETIME");
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_assets_source_key
      ON generated_assets(source_key) WHERE source_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_batch_sessions_poll
      ON batch_sessions(status, run_mode, next_poll_at);
      CREATE INDEX IF NOT EXISTS idx_session_prompts_status
      ON session_prompts(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_session_reference_files_file
      ON session_reference_files(file_id);
      INSERT OR IGNORE INTO session_reference_files (session_id, ordinal, file_id)
      SELECT session_id, 0, reference_file_id FROM batch_sessions
      WHERE reference_file_id IS NOT NULL AND reference_file_id != ''
        AND EXISTS (SELECT 1 FROM reference_files r WHERE r.file_id = batch_sessions.reference_file_id);
      UPDATE batch_sessions SET output_format = CASE size_used
        WHEN '1024x1280' THEN 'portrait'
        WHEN '1024x1536' THEN 'portrait'
        WHEN '1536x864' THEN 'landscape'
        WHEN '1536x1024' THEN 'landscape'
        WHEN '864x1536' THEN 'story'
        ELSE 'square' END
      WHERE output_format IS NULL OR output_format = '' OR output_format = 'square';
      UPDATE batch_sessions SET diagnostic_id = 'BIS-' || substr(replace(session_id, '-', ''), 1, 8)
      WHERE diagnostic_id IS NULL OR diagnostic_id = '';
      UPDATE session_prompts SET status = 'completed'
      WHERE prompt_id IN (SELECT prompt_id FROM generated_assets WHERE prompt_id IS NOT NULL);
      PRAGMA user_version = 3;
    `);
    this.migrateToV4();
    this.migrateToV5();
    // Kept outside the numbered migrations so an existing v5 database gains this
    // small, backwards-compatible field without a destructive migration.
    this.ensureColumn("batch_runs", "wave_strategy", "TEXT NOT NULL DEFAULT 'guided'");
    this.db.exec("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('first_wave_size', '10')");
    this.migrateToV6();
  }

  private migrateToV4(): void {
    const version = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    if (version >= 4) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS batch_runs (
        run_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        model_used TEXT NOT NULL,
        run_mode TEXT NOT NULL DEFAULT 'batch',
        output_format TEXT NOT NULL DEFAULT 'square',
        quality TEXT NOT NULL DEFAULT 'high',
        wave_size INTEGER NOT NULL DEFAULT 0,
        wave_count INTEGER NOT NULL DEFAULT 1,
        total_prompts INTEGER NOT NULL,
        completed_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        status_message TEXT DEFAULT '',
        estimate_usd REAL NOT NULL DEFAULT 0.0,
        cost_usd REAL DEFAULT 0.0,
        cost_pkr REAL DEFAULT 0.0,
        fx_rate REAL DEFAULT 276.61,
        diagnostic_id TEXT
      );
      CREATE TABLE IF NOT EXISTS admin_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        encrypted_key TEXT,
        key_hint TEXT,
        project_id TEXT,
        rate_limits_json TEXT,
        rate_limits_fetched_at TEXT,
        last_error TEXT,
        header_probe_json TEXT
      );
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('wave_size', '${APP_LIMITS.defaultWaveSize}');
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('first_wave_size', '10');
      INSERT OR IGNORE INTO admin_config (id) VALUES (1);
    `);
    this.ensureColumn("batch_sessions", "parent_run_id", "TEXT");
    this.ensureColumn("batch_sessions", "wave_index", "INTEGER");
    this.ensureColumn("batch_sessions", "wave_count", "INTEGER");
    this.ensureColumn("batch_sessions", "phase", "TEXT NOT NULL DEFAULT 'queued'");
    this.ensureColumn("batch_sessions", "submitted_at", "DATETIME");
    this.ensureColumn("batch_sessions", "remote_completed_at", "DATETIME");
    this.ensureColumn("batch_sessions", "download_started_at", "DATETIME");
    this.ensureColumn("batch_sessions", "download_finished_at", "DATETIME");
    this.ensureColumn("batch_sessions", "persist_finished_at", "DATETIME");
    this.ensureColumn("session_prompts", "started_at", "DATETIME");
    this.ensureColumn("session_prompts", "completed_at", "DATETIME");
    this.ensureColumn("session_prompts", "duration_ms", "INTEGER");
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_batch_sessions_parent_run ON batch_sessions(parent_run_id);
      CREATE INDEX IF NOT EXISTS idx_session_prompts_session_status ON session_prompts(session_id, status);
      PRAGMA user_version = 4;
    `);
  }

  private migrateToV5(): void {
    const version = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    if (version >= 5) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS converter_jobs (
        job_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        total_count INTEGER NOT NULL,
        completed_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS converter_items (
        item_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        source_kind TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        output_name TEXT,
        output_path TEXT,
        output_format TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        properties_json TEXT,
        FOREIGN KEY(job_id) REFERENCES converter_jobs(job_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_converter_items_job ON converter_items(job_id, ordinal);
      PRAGMA user_version = 5;
    `);
  }

  private migrateToV6(): void {
    const version = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    if (version >= 6) return;
    // v5 wrote total_prompts and wave_strategy in the reverse order. Repair only
    // rows with that unmistakable shape, preserving any valid historical run.
    this.db.exec(`
      UPDATE batch_runs
      SET wave_strategy = total_prompts,
          total_prompts = wave_strategy
      WHERE CAST(wave_strategy AS TEXT) GLOB '[0-9]*'
        AND total_prompts IN ('all', 'guided', 'parallel');
      PRAGMA user_version = 6;
    `);
  }

  private ensureColumn(table: "api_keys" | "batch_sessions" | "batch_runs" | "generated_assets" | "session_prompts" | "reference_files", column: string, definition: string): void {
    const columns = this.db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  getSetting(key: string, fallback = ""): string {
    return this.db.query<{ value: string }, [string]>("SELECT value FROM app_settings WHERE key = ?").get(key)?.value ?? fallback;
  }

  setSetting(key: string, value: string): void {
    this.db.query(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  getAppSettings(): AppSettings {
    const waveSize = Number(this.getSetting("wave_size", String(APP_LIMITS.defaultWaveSize)));
    const firstWaveSize = Number(this.getSetting("first_wave_size", "10"));
    return {
      waveSize: Number.isFinite(waveSize) ? Math.max(0, Math.floor(waveSize)) : APP_LIMITS.defaultWaveSize,
      firstWaveSize: Number.isFinite(firstWaveSize) ? Math.max(1, Math.min(APP_LIMITS.batchPromptLimit, Math.floor(firstWaveSize))) : 10,
    };
  }

  setAppSettings(partial: Partial<AppSettings>): AppSettings {
    if (partial.waveSize !== undefined) {
      if (!Number.isInteger(partial.waveSize) || partial.waveSize < 0 || partial.waveSize > APP_LIMITS.batchPromptLimit) {
        throw new Error(`Wave size must be 0 (no split) or 1–${APP_LIMITS.batchPromptLimit}.`);
      }
      this.setSetting("wave_size", String(partial.waveSize));
    }
    if (partial.firstWaveSize !== undefined) {
      if (!Number.isInteger(partial.firstWaveSize) || partial.firstWaveSize < 1 || partial.firstWaveSize > APP_LIMITS.batchPromptLimit) {
        throw new Error(`First batch must be 1–${APP_LIMITS.batchPromptLimit}.`);
      }
      this.setSetting("first_wave_size", String(partial.firstWaveSize));
    }
    return this.getAppSettings();
  }

  listConverterSessionImages(): ConverterSourceImage[] {
    return this.db.query<{
      asset_id: string; session_id: string; image_filename: string; start_time: string;
    }, []>(`
      SELECT a.asset_id, a.session_id, a.image_filename, s.start_time
      FROM generated_assets a JOIN batch_sessions s ON s.session_id = a.session_id
      WHERE a.file_path != ''
      ORDER BY s.start_time DESC, a.rowid DESC LIMIT 500
    `).all().map((row) => ({
      assetId: row.asset_id, sessionId: row.session_id, name: row.image_filename, createdAt: row.start_time,
    }));
  }

  createConverterJob(job: {
    id: string; options: ConverterOptions; items: Array<{
      id: string; ordinal: number; sourceKind: "session" | "upload" | "clipboard";
      sourceName: string; sourcePath: string; format: string;
    }>;
  }): void {
    const transaction = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO converter_jobs (job_id, status, options_json, total_count, completed_count)
        VALUES (?, 'processing', ?, ?, 0)
      `).run(job.id, JSON.stringify(job.options), job.items.length);
      const insert = this.db.query(`
        INSERT INTO converter_items
          (item_id, job_id, ordinal, source_kind, source_name, source_path, output_format, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')
      `);
      for (const item of job.items) {
        insert.run(item.id, job.id, item.ordinal, item.sourceKind, item.sourceName, item.sourcePath, item.format);
      }
    });
    transaction();
  }

  completeConverterItem(itemId: string, result: {
    outputName: string; outputPath: string; properties: object;
  }): void {
    this.db.query(`
      UPDATE converter_items SET status = 'completed', output_name = ?, output_path = ?, properties_json = ?, error_message = NULL
      WHERE item_id = ?
    `).run(result.outputName, result.outputPath, JSON.stringify(result.properties), itemId);
  }

  failConverterItem(itemId: string, message: string): void {
    this.db.query("UPDATE converter_items SET status = 'failed', error_message = ? WHERE item_id = ?")
      .run(message.slice(0, 500), itemId);
  }

  finishConverterJob(jobId: string): void {
    const counts = this.db.query<{ total: number; completed: number }, [string]>(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM converter_items WHERE job_id = ?
    `).get(jobId);
    const completed = counts?.completed ?? 0;
    const total = counts?.total ?? 0;
    const status = completed === total ? "completed" : completed ? "partial" : "failed";
    this.db.query("UPDATE converter_jobs SET status = ?, completed_count = ? WHERE job_id = ?")
      .run(status, completed, jobId);
  }

  getConverterOutputPath(jobId: string, itemId: string): string | null {
    return this.db.query<{ output_path: string | null }, [string, string]>(
      "SELECT output_path FROM converter_items WHERE job_id = ? AND item_id = ? AND status = 'completed'",
    ).get(jobId, itemId)?.output_path ?? null;
  }

  getConverterItem(jobId: string, itemId: string): ConverterJobItem & { outputPath: string | null } | null {
    const row = this.db.query<{
      item_id: string; ordinal: number; source_kind: "session" | "upload" | "clipboard"; source_name: string;
      output_name: string | null; output_path: string | null; output_format: ConverterJobItem["format"];
      status: "completed" | "failed"; error_message: string | null; properties_json: string | null;
    }, [string, string]>(`
      SELECT item_id, ordinal, source_kind, source_name, output_name, output_path, output_format, status, error_message, properties_json
      FROM converter_items WHERE job_id = ? AND item_id = ?
    `).get(jobId, itemId);
    if (!row) return null;
    let properties = null;
    try { properties = row.properties_json ? JSON.parse(row.properties_json) : null; } catch { properties = null; }
    return {
      id: row.item_id, ordinal: row.ordinal, sourceKind: row.source_kind, sourceName: row.source_name,
      outputName: row.output_name, outputPath: row.output_path, format: row.output_format,
      status: row.status, error: row.error_message, properties,
    };
  }

  listConverterJobs(): ConverterJob[] {
    const jobs = this.db.query<{
      job_id: string; created_at: string; status: ConverterJob["status"]; options_json: string;
      total_count: number; completed_count: number;
    }, []>("SELECT job_id, created_at, status, options_json, total_count, completed_count FROM converter_jobs ORDER BY created_at DESC LIMIT 100").all();
    const items = this.db.query<{
      item_id: string; job_id: string; ordinal: number; source_kind: "session" | "upload" | "clipboard"; source_name: string;
      output_name: string | null; output_format: ConverterJobItem["format"]; status: "completed" | "failed";
      error_message: string | null; properties_json: string | null;
    }, []>("SELECT item_id, job_id, ordinal, source_kind, source_name, output_name, output_format, status, error_message, properties_json FROM converter_items ORDER BY ordinal").all();
    return jobs.map((job) => {
      let options: ConverterOptions;
      try { options = JSON.parse(job.options_json) as ConverterOptions; } catch { throw new Error("A saved Converter job is invalid."); }
      return {
        id: job.job_id, createdAt: job.created_at, status: job.status, totalCount: job.total_count,
        completedCount: job.completed_count, options,
        items: items.filter((item) => item.job_id === job.job_id).map((item) => {
          let properties = null;
          try { properties = item.properties_json ? JSON.parse(item.properties_json) : null; } catch { properties = null; }
          return {
            id: item.item_id, ordinal: item.ordinal, sourceKind: item.source_kind, sourceName: item.source_name,
            outputName: item.output_name, format: item.output_format, status: item.status,
            error: item.error_message, properties,
          };
        }),
      };
    });
  }

  deleteConverterJob(jobId: string): string[] {
    const files = this.db.query<{ output_path: string | null; source_path: string }, [string]>(
      "SELECT output_path, source_path FROM converter_items WHERE job_id = ?",
    ).all(jobId);
    this.db.query("DELETE FROM converter_jobs WHERE job_id = ?").run(jobId);
    return files.flatMap((item) => [item.source_path, item.output_path].filter((path): path is string => Boolean(path)));
  }

  getAdminConfigRow(): {
    encrypted_key: string | null; key_hint: string | null; project_id: string | null;
    rate_limits_json: string | null; rate_limits_fetched_at: string | null; last_error: string | null;
    header_probe_json: string | null;
  } {
    return this.db.query<{
      encrypted_key: string | null; key_hint: string | null; project_id: string | null;
      rate_limits_json: string | null; rate_limits_fetched_at: string | null; last_error: string | null;
      header_probe_json: string | null;
    }, []>("SELECT encrypted_key, key_hint, project_id, rate_limits_json, rate_limits_fetched_at, last_error, header_probe_json FROM admin_config WHERE id = 1").get()
      ?? {
        encrypted_key: null, key_hint: null, project_id: null, rate_limits_json: null,
        rate_limits_fetched_at: null, last_error: null, header_probe_json: null,
      };
  }

  setAdminEncryptedKey(encryptedKey: string | null, keyHint: string | null): void {
    this.db.query(`
      UPDATE admin_config SET encrypted_key = ?, key_hint = ?, last_error = NULL WHERE id = 1
    `).run(encryptedKey, keyHint);
  }

  setAdminProjectId(projectId: string | null): void {
    this.db.query("UPDATE admin_config SET project_id = ? WHERE id = 1").run(projectId);
  }

  setAdminRateLimits(snapshot: RateLimitSnapshot | null, lastError: string | null = null): void {
    this.db.query(`
      UPDATE admin_config SET rate_limits_json = ?, rate_limits_fetched_at = ?, last_error = ? WHERE id = 1
    `).run(
      snapshot ? JSON.stringify(snapshot) : null,
      snapshot?.fetchedAt ?? null,
      lastError,
    );
  }

  setHeaderProbe(probe: object | null): void {
    this.db.query("UPDATE admin_config SET header_probe_json = ? WHERE id = 1")
      .run(probe ? JSON.stringify(probe) : null);
  }

  createBatchRun(run: {
    runId: string; model: string; mode: RunMode; format: OutputFormatId; quality: QualityTier;
    waveSize: number; waveCount: number; waveStrategy: "all" | "guided" | "parallel";
    totalPrompts: number; estimateUsd: number; fxRate: number;
  }): void {
    this.db.query(`
      INSERT INTO batch_runs
        (run_id, model_used, run_mode, output_format, quality, wave_size, wave_count, total_prompts,
         wave_strategy, status, status_message, estimate_usd, fx_rate, diagnostic_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'Queued', ?, ?, ?)
    `).run(
      run.runId, run.model, run.mode, run.format, run.quality, run.waveSize, run.waveCount,
      run.totalPrompts, run.waveStrategy, run.estimateUsd, run.fxRate, `BIS-${run.runId.replaceAll("-", "").slice(0, 8)}`,
    );
  }

  updateBatchRun(runId: string, update: {
    status?: SessionStatus; message?: string; completedCount?: number;
    costUsd?: number; costPkr?: number;
  }): void {
    const row = this.db.query<{
      status: SessionStatus; status_message: string; completed_count: number; cost_usd: number; fx_rate: number;
    }, [string]>(
      "SELECT status, status_message, completed_count, cost_usd, fx_rate FROM batch_runs WHERE run_id = ?",
    ).get(runId);
    if (!row) return;
    const costUsd = update.costUsd ?? row.cost_usd;
    this.db.query(`
      UPDATE batch_runs SET status = ?, status_message = ?, completed_count = ?,
        cost_usd = ?, cost_pkr = ?
      WHERE run_id = ?
    `).run(
      update.status ?? row.status,
      update.message ?? row.status_message,
      update.completedCount ?? row.completed_count,
      costUsd,
      update.costPkr ?? costUsd * row.fx_rate,
      runId,
    );
  }

  getBatchRun(runId: string): {
    run_id: string; model_used: string; run_mode: RunMode; output_format: string; quality: QualityTier;
    wave_size: number; wave_count: number; wave_strategy: "all" | "guided" | "parallel"; total_prompts: number; completed_count: number;
    status: SessionStatus; status_message: string; estimate_usd: number; cost_usd: number;
    cost_pkr: number; fx_rate: number; created_at: string; diagnostic_id: string;
  } | null {
    return this.db.query<{
      run_id: string; model_used: string; run_mode: RunMode; output_format: string; quality: QualityTier;
      wave_size: number; wave_count: number; wave_strategy: "all" | "guided" | "parallel"; total_prompts: number; completed_count: number;
      status: SessionStatus; status_message: string; estimate_usd: number; cost_usd: number;
      cost_pkr: number; fx_rate: number; created_at: string; diagnostic_id: string;
    }, [string]>(`
      SELECT run_id, model_used, run_mode, output_format, quality, wave_size, wave_count, wave_strategy, total_prompts,
        completed_count, status, status_message, estimate_usd, cost_usd, cost_pkr, fx_rate, created_at,
        COALESCE(diagnostic_id, '') AS diagnostic_id
      FROM batch_runs WHERE run_id = ?
    `).get(runId) ?? null;
  }

  listSessionIdsForRun(runId: string): string[] {
    return this.db.query<{ session_id: string }, [string]>(
      "SELECT session_id FROM batch_sessions WHERE parent_run_id = ? ORDER BY wave_index ASC, start_time ASC",
    ).all(runId).map((row) => row.session_id);
  }

  listIncompletePromptsForRun(runId: string): Array<{
    promptText: string; week: string; scheduleDate: string; themeColumn: string;
  }> {
    return this.db.query<{
      prompt_text: string; week: string; schedule_date: string; theme_column: string;
    }, [string]>(`
      SELECT p.prompt_text, COALESCE(p.week, '') AS week,
        COALESCE(p.schedule_date, '') AS schedule_date,
        COALESCE(p.theme_column, '') AS theme_column
      FROM session_prompts p
      JOIN batch_sessions s ON s.session_id = p.session_id
      LEFT JOIN generated_assets a ON a.prompt_id = p.prompt_id
      WHERE s.parent_run_id = ? AND a.asset_id IS NULL AND p.status != 'completed'
      ORDER BY s.wave_index ASC, p.ordinal ASC
    `).all(runId).map((row) => ({
      promptText: row.prompt_text,
      week: row.week,
      scheduleDate: row.schedule_date,
      themeColumn: row.theme_column,
    }));
  }

  listIncompletePromptsForSession(sessionId: string): Array<{
    promptText: string; week: string; scheduleDate: string; themeColumn: string;
  }> {
    return this.db.query<{
      prompt_text: string; week: string; schedule_date: string; theme_column: string;
    }, [string]>(`
      SELECT p.prompt_text, COALESCE(p.week, '') AS week,
        COALESCE(p.schedule_date, '') AS schedule_date,
        COALESCE(p.theme_column, '') AS theme_column
      FROM session_prompts p
      LEFT JOIN generated_assets a ON a.prompt_id = p.prompt_id
      WHERE p.session_id = ? AND a.asset_id IS NULL AND p.status != 'completed'
      ORDER BY p.ordinal
    `).all(sessionId).map((row) => ({
      promptText: row.prompt_text,
      week: row.week,
      scheduleDate: row.schedule_date,
      themeColumn: row.theme_column,
    }));
  }

  setSessionPhase(sessionId: string, phase: RunPhase, stamp?: {
    submitted?: boolean; remoteCompleted?: boolean; downloadStarted?: boolean;
    downloadFinished?: boolean; persistFinished?: boolean;
  }): void {
    const parts = ["phase = ?"];
    const values: Array<string | null> = [phase];
    if (stamp?.submitted) parts.push("submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)");
    if (stamp?.remoteCompleted) parts.push("remote_completed_at = COALESCE(remote_completed_at, CURRENT_TIMESTAMP)");
    if (stamp?.downloadStarted) parts.push("download_started_at = COALESCE(download_started_at, CURRENT_TIMESTAMP)");
    if (stamp?.downloadFinished) parts.push("download_finished_at = COALESCE(download_finished_at, CURRENT_TIMESTAMP)");
    if (stamp?.persistFinished) parts.push("persist_finished_at = COALESCE(persist_finished_at, CURRENT_TIMESTAMP)");
    this.db.query(`UPDATE batch_sessions SET ${parts.join(", ")} WHERE session_id = ?`).run(...values, sessionId);
  }

  markPromptStarted(promptId: string): void {
    this.db.query(`
      UPDATE session_prompts SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE prompt_id = ?
    `).run(promptId);
  }

  averagePromptDurationMs(limit = 40): number | null {
    const row = this.db.query<{ avg_ms: number | null }, [number]>(`
      SELECT AVG(duration_ms) AS avg_ms FROM (
        SELECT duration_ms FROM session_prompts
        WHERE duration_ms IS NOT NULL AND duration_ms > 0
        ORDER BY rowid DESC LIMIT ?
      )
    `).get(limit);
    return row?.avg_ms != null && Number.isFinite(row.avg_ms) ? row.avg_ms : null;
  }

  listKeys(): ApiKeyRecord[] {
    return this.db.query<ApiKeyRecord, []>(
      "SELECT id, key_value, COALESCE(label, 'OpenAI key') AS label, key_hint, is_active, rate_limited_until FROM api_keys ORDER BY created_at",
    ).all();
  }

  insertKey(record: { id: string; encryptedKey: string; label: string; keyHint: string }): void {
    this.db.query("INSERT INTO api_keys (id, key_value, label, key_hint) VALUES (?, ?, ?, ?)")
      .run(record.id, record.encryptedKey, record.label, record.keyHint);
  }

  listKeyStats(): ApiKeyStats[] {
    const rows = this.db.query<{
      id: string; label: string; key_hint: string; is_active: number; rate_limited_until: string | null;
      created_at: string; last_used_at: string | null; total_requests: number; input_tokens: number;
      output_tokens: number; cost_usd: number; cost_pkr: number; current_session_id: string | null;
      current_model: string | null; current_run_mode: "batch" | "direct" | null;
      current_status: SessionStatus | null; current_prompts: number | null; current_completed: number | null;
    }, []>(`
      SELECT k.id, COALESCE(k.label, 'OpenAI key') AS label, k.key_hint, k.is_active,
        k.rate_limited_until, k.created_at, k.last_used_at, k.total_requests,
        k.input_tokens, k.output_tokens, k.cost_usd, k.cost_pkr,
        s.session_id AS current_session_id, s.model_used AS current_model,
        s.run_mode AS current_run_mode, s.status AS current_status,
        s.total_prompts AS current_prompts, s.completed_count AS current_completed
      FROM api_keys k
      LEFT JOIN batch_sessions s ON s.session_id = (
        SELECT session_id FROM batch_sessions
        WHERE key_used_id = k.id AND status IN ('pending', 'processing')
        ORDER BY start_time DESC LIMIT 1
      )
      ORDER BY CASE WHEN s.session_id IS NULL THEN 1 ELSE 0 END, k.created_at
    `).all();
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      keyHint: row.key_hint,
      provider: "OpenAI",
      isActive: row.is_active === 1,
      isRateLimited: Boolean(row.rate_limited_until && Date.parse(row.rate_limited_until) > now),
      rateLimitedUntil: row.rate_limited_until,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      totalRequests: row.total_requests,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd,
      costPkr: row.cost_pkr,
      currentSessionId: row.current_session_id,
      currentModel: row.current_model,
      currentRunMode: row.current_run_mode,
      currentStatus: row.current_status,
      currentPrompts: row.current_prompts ?? 0,
      currentCompleted: row.current_completed ?? 0,
    }));
  }

  setKeyActive(id: string, isActive: boolean): void {
    this.db.query("UPDATE api_keys SET is_active = ? WHERE id = ?").run(isActive ? 1 : 0, id);
  }

  deleteKey(id: string): void {
    const active = this.db.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM batch_sessions WHERE key_used_id = ? AND status IN ('pending', 'processing')",
    ).get(id)?.count ?? 0;
    if (active > 0) throw new Error("This key is currently assigned to an active session.");
    this.db.query("DELETE FROM api_keys WHERE id = ?").run(id);
  }

  recordKeyUsage(id: string, usage: {
    requests?: number; inputTokens?: number; outputTokens?: number; costUsd?: number; costPkr?: number;
  }): void {
    this.db.query(`
      UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP,
        total_requests = total_requests + ?, input_tokens = input_tokens + ?,
        output_tokens = output_tokens + ?, cost_usd = cost_usd + ?, cost_pkr = cost_pkr + ?
      WHERE id = ?
    `).run(
      usage.requests ?? 0, usage.inputTokens ?? 0, usage.outputTokens ?? 0,
      usage.costUsd ?? 0, usage.costPkr ?? 0, id,
    );
  }

  markRateLimited(id: string, until: string): void {
    this.db.query("UPDATE api_keys SET rate_limited_until = ? WHERE id = ?").run(until, id);
  }

  assignSessionKey(sessionId: string, keyId: string): void {
    this.db.query("UPDATE batch_sessions SET key_used_id = ? WHERE session_id = ?").run(keyId, sessionId);
  }

  getSessionKeyId(sessionId: string): string | null {
    return this.db.query<{ key_used_id: string | null }, [string]>(
      "SELECT key_used_id FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId)?.key_used_id ?? null;
  }

  getSessionModel(sessionId: string): string {
    const row = this.db.query<{ model_used: string }, [string]>(
      "SELECT model_used FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId);
    if (!row) throw new Error(`Unknown session: ${sessionId}`);
    return row.model_used;
  }

  getSessionPricingContext(sessionId: string): {
    model: string;
    runMode: RunMode;
    quality: QualityTier;
    format: OutputFormatId;
  } {
    const row = this.db.query<{
      model_used: string; run_mode: RunMode; quality: QualityTier; output_format: string; size_used: string;
    }, [string]>(
      "SELECT model_used, run_mode, quality, output_format, size_used FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId);
    if (!row) throw new Error(`Unknown session: ${sessionId}`);
    return {
      model: row.model_used,
      runMode: row.run_mode,
      quality: row.quality,
      format: isOutputFormatId(row.output_format) ? row.output_format : legacySizeToFormat(row.size_used),
    };
  }

  getSessionRunContext(sessionId: string): SessionRunContext {
    const row = this.db.query<{
      session_id: string; model_used: string; run_mode: RunMode; output_format: string;
      size_used: string; quality: QualityTier; reference_file_id: string | null;
    }, [string]>(`
      SELECT session_id, model_used, run_mode, output_format, size_used, quality, reference_file_id
      FROM batch_sessions WHERE session_id = ?
    `).get(sessionId);
    if (!row) throw new Error(`Unknown session: ${sessionId}`);
    const storedReferences = this.db.query<{ file_id: string }, [string]>(
      "SELECT file_id FROM session_reference_files WHERE session_id = ? ORDER BY ordinal",
    ).all(sessionId).map((reference) => reference.file_id);
    return {
      sessionId: row.session_id,
      model: row.model_used,
      runMode: row.run_mode,
      format: isOutputFormatId(row.output_format) ? row.output_format : legacySizeToFormat(row.size_used),
      quality: row.quality,
      referenceFileIds: storedReferences.length ? storedReferences : row.reference_file_id ? [row.reference_file_id] : [],
    };
  }

  listSessionAssets(sessionId: string): Array<{ image_filename: string; file_path: string }> {
    return this.db.query<{ image_filename: string; file_path: string }, [string]>(`
      SELECT image_filename, file_path FROM generated_assets
      WHERE session_id = ? ORDER BY image_filename
    `).all(sessionId);
  }

  cacheReferenceFile(fileId: string, localPath: string, mimeType: string, keyId: string): void {
    this.db.query(`
      INSERT INTO reference_files (file_id, local_path, mime_type, key_used_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file_id) DO UPDATE SET local_path=excluded.local_path, mime_type=excluded.mime_type,
        key_used_id=excluded.key_used_id, remote_deleted_at=NULL
    `).run(fileId, localPath, mimeType, keyId);
  }

  getReferenceFile(fileId: string): { local_path: string; mime_type: string; key_used_id: string | null; remote_deleted_at: string | null } | null {
    return this.db.query<{ local_path: string; mime_type: string; key_used_id: string | null; remote_deleted_at: string | null }, [string]>(
      "SELECT local_path, mime_type, key_used_id, remote_deleted_at FROM reference_files WHERE file_id = ?",
    ).get(fileId) ?? null;
  }

  markReferenceRemoteDeleted(fileId: string): void {
    this.db.query("UPDATE reference_files SET remote_deleted_at = CURRENT_TIMESTAMP WHERE file_id = ?").run(fileId);
  }

  deleteReferenceFile(fileId: string): void {
    this.db.query("DELETE FROM session_reference_files WHERE file_id = ?").run(fileId);
    this.db.query("DELETE FROM reference_files WHERE file_id = ?").run(fileId);
  }

  isReferenceInUse(fileId: string): boolean {
    return Boolean(this.db.query<{ value: number }, [string]>(`
      SELECT 1 AS value FROM session_reference_files sr
      JOIN batch_sessions s ON s.session_id = sr.session_id
      WHERE sr.file_id = ? AND s.status IN ('pending', 'processing') LIMIT 1
    `).get(fileId));
  }

  listOrphanedReferences(): Array<{ file_id: string; local_path: string }> {
    return this.db.query<{ file_id: string; local_path: string }, []>(`
      SELECT r.file_id, r.local_path FROM reference_files r
      WHERE NOT EXISTS (
        SELECT 1 FROM session_reference_files sr
        JOIN batch_sessions s ON s.session_id = sr.session_id
        WHERE sr.file_id = r.file_id AND s.status IN ('pending', 'processing', 'partial', 'failed')
      )
    `).all();
  }

  recoverOrphanedSessions(): number {
    const direct = this.db.query(`
      UPDATE batch_sessions SET status = 'failed',
        status_message = 'Interrupted by app restart before direct generation finished.',
        end_time = CURRENT_TIMESTAMP
      WHERE status IN ('pending', 'processing') AND run_mode = 'direct'
        AND (external_batch_id IS NULL OR external_batch_id = '')
    `).run().changes;
    const stale = this.db.query(`
      UPDATE batch_sessions SET status_message = 'Recovered after restart; polling OpenAI batch…'
      WHERE status IN ('pending', 'processing') AND run_mode = 'batch'
    `).run().changes;
    return direct + stale;
  }

  listRetryablePrompts(sessionId: string): Array<{
    promptText: string; week: string; scheduleDate: string; themeColumn: string;
  }> {
    return this.db.query<{
      prompt_text: string; week: string; schedule_date: string; theme_column: string;
    }, [string]>(`
      SELECT p.prompt_text, COALESCE(p.week, '') AS week,
        COALESCE(p.schedule_date, '') AS schedule_date,
        COALESCE(p.theme_column, '') AS theme_column
      FROM session_prompts p
      LEFT JOIN generated_assets a ON a.prompt_id = p.prompt_id
      WHERE p.session_id = ? AND a.asset_id IS NULL AND p.status != 'completed'
      ORDER BY p.ordinal
    `).all(sessionId).map((row) => ({
      promptText: row.prompt_text,
      week: row.week,
      scheduleDate: row.schedule_date,
      themeColumn: row.theme_column,
    }));
  }

  createSession(
    sessionId: string,
    input: SubmitRunInput,
    fxRate: number,
    estimate: { costUsd: number; pricingVersion: string } = { costUsd: 0, pricingVersion: "unknown" },
    meta: { parentRunId?: string | null; waveIndex?: number | null; waveCount?: number | null } = {},
  ): void {
    const transaction = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO batch_sessions
          (session_id, model_used, run_mode, total_prompts, status, status_message, fx_rate, quality,
           size_used, output_format, reference_file_id, diagnostic_id, estimate_usd, pricing_version,
           parent_run_id, wave_index, wave_count, phase)
        VALUES (?, ?, ?, ?, 'pending', 'Queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
      `).run(
        sessionId, input.model, input.mode, input.prompts.length, fxRate,
        input.quality, outputSize(input.format), input.format, input.referenceImageFileIds?.[0] ?? null,
        `BIS-${sessionId.replaceAll("-", "").slice(0, 8)}`, estimate.costUsd, estimate.pricingVersion,
        meta.parentRunId ?? input.parentRunId ?? null,
        meta.waveIndex ?? input.waveIndex ?? null,
        meta.waveCount ?? input.waveCount ?? null,
      );

      const insertReference = this.db.query(`
        INSERT INTO session_reference_files (session_id, ordinal, file_id) VALUES (?, ?, ?)
      `);
      (input.referenceImageFileIds ?? []).forEach((fileId, index) => insertReference.run(sessionId, index, fileId));

      const insertPrompt = this.db.query(`
        INSERT INTO session_prompts
          (prompt_id, session_id, ordinal, prompt_text, schedule_date, week, theme_column)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      input.prompts.forEach((prompt, index) => {
        insertPrompt.run(
          crypto.randomUUID(), sessionId, index + 1, prompt.promptText,
          prompt.scheduleDate, prompt.week, prompt.themeColumn,
        );
      });
    });
    transaction();
  }

  updateSession(sessionId: string, update: {
    status: SessionStatus;
    message: string;
    externalBatchId?: string;
    completedCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    lastError?: SanitizedProviderError | null;
    nextPollAt?: string | null;
    pollAttempts?: number;
  }): void {
    const row = this.getTelemetry(sessionId);
    const costUsd = update.costUsd ?? row.costUsd;
    this.db.query(`
      UPDATE batch_sessions SET
        external_batch_id = COALESCE(?, external_batch_id),
        status = ?, status_message = ?, completed_count = ?,
        input_tokens = ?, output_tokens = ?, cost_usd = ?, cost_pkr = ?,
        last_provider_error = CASE WHEN ? THEN ? ELSE last_provider_error END,
        next_poll_at = CASE WHEN ? THEN ? ELSE next_poll_at END,
        poll_attempts = COALESCE(?, poll_attempts),
        end_time = CASE WHEN ? IN ('partial', 'completed', 'failed', 'cancelled') THEN CURRENT_TIMESTAMP ELSE end_time END
      WHERE session_id = ?
    `).run(
      update.externalBatchId ?? null,
      update.status,
      update.message,
      update.completedCount ?? row.completedCount,
      update.inputTokens ?? row.inputTokens,
      update.outputTokens ?? row.outputTokens,
      costUsd,
      costUsd * row.fxRate,
      update.lastError !== undefined ? 1 : 0,
      serializeError(update.lastError ?? null),
      update.nextPollAt !== undefined ? 1 : 0,
      update.nextPollAt ?? null,
      update.pollAttempts ?? null,
      update.status,
      sessionId,
    );
  }

  getExternalBatchId(sessionId: string): string | null {
    const row = this.db.query<{ external_batch_id: string | null }, [string]>(
      "SELECT external_batch_id FROM batch_sessions WHERE session_id = ?",
    ).get(sessionId);
    return row?.external_batch_id ?? null;
  }

  getTelemetry(sessionId: string): SessionTelemetry {
    const row = this.db.query<{
      session_id: string;
      status: SessionStatus;
      total_prompts: number;
      completed_count: number;
      elapsed_ms: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      cost_pkr: number;
      fx_rate: number;
      status_message: string;
      run_mode: RunMode;
      output_format: string;
      size_used: string;
      quality: QualityTier;
      retryable_count: number;
      diagnostic_id: string;
      last_provider_error: string | null;
      next_poll_at: string | null;
      parent_run_id: string | null;
      wave_index: number | null;
      wave_count: number | null;
      estimate_usd: number;
      phase: string;
      submitted_at: string | null;
      remote_completed_at: string | null;
      download_started_at: string | null;
      download_finished_at: string | null;
      persist_finished_at: string | null;
    }, [string]>(`
      SELECT session_id, status, total_prompts, completed_count,
        CAST((julianday(COALESCE(end_time, CURRENT_TIMESTAMP)) - julianday(start_time)) * 86400000 AS INTEGER) AS elapsed_ms,
        input_tokens, output_tokens, cost_usd, cost_pkr, fx_rate, status_message,
        run_mode, output_format, size_used, quality, diagnostic_id, last_provider_error, next_poll_at,
        parent_run_id, wave_index, wave_count, estimate_usd, COALESCE(phase, 'queued') AS phase,
        submitted_at, remote_completed_at, download_started_at, download_finished_at, persist_finished_at,
        (SELECT COUNT(*) FROM session_prompts p WHERE p.session_id = batch_sessions.session_id
          AND p.status != 'completed') AS retryable_count
      FROM batch_sessions WHERE session_id = ?
    `).get(sessionId);
    if (!row) throw new Error(`Unknown session: ${sessionId}`);
    const remaining = Math.max(0, row.total_prompts - row.completed_count);
    const avgMs = this.averagePromptDurationMs();
    const etaMs = estimateEtaMs({
      status: row.status,
      phase: (row.phase as RunPhase) || "queued",
      runMode: row.run_mode,
      remaining,
      totalPrompts: row.total_prompts,
      completedCount: row.completed_count,
      elapsedMs: Math.max(0, row.elapsed_ms),
      avgDurationMs: avgMs,
    });
    const msBetween = (start: string | null, end: string | null) => {
      if (!start || !end) return null;
      const a = Date.parse(start);
      const b = Date.parse(end);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Math.max(0, b - a);
    };
    return {
      sessionId: row.session_id,
      status: row.status,
      totalPrompts: row.total_prompts,
      completedCount: row.completed_count,
      elapsedMs: Math.max(0, row.elapsed_ms),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd,
      costPkr: row.cost_pkr,
      fxRate: row.fx_rate,
      message: row.status_message,
      runMode: row.run_mode,
      format: isOutputFormatId(row.output_format) ? row.output_format : legacySizeToFormat(row.size_used),
      quality: row.quality,
      retryableCount: row.retryable_count,
      diagnosticId: row.diagnostic_id,
      lastError: parseError(row.last_provider_error),
      nextPollAt: row.next_poll_at,
      parentRunId: row.parent_run_id,
      waveIndex: row.wave_index,
      waveCount: row.wave_count,
      estimateUsd: row.estimate_usd,
      etaMs,
      phase: (row.phase as RunPhase) || "queued",
      durationMs: {
        submit: msBetween(row.submitted_at, row.remote_completed_at ?? row.download_started_at),
        remote: msBetween(row.submitted_at, row.remote_completed_at),
        download: msBetween(row.download_started_at, row.download_finished_at),
        persist: msBetween(row.download_finished_at ?? row.persist_finished_at, row.persist_finished_at),
      },
    };
  }

  getExportRows(sessionId: string): Array<Record<string, string | number>> {
    return this.db.query<Record<string, string | number>, [string]>(`
      SELECT
        p.ordinal AS Ordinal,
        COALESCE(a.image_filename, '') AS Image_Filename,
        COALESCE(p.week, '') AS Week,
        COALESCE(p.schedule_date, '') AS Schedule_Date,
        COALESCE(p.theme_column, '') AS Theme_Column,
        p.prompt_text AS Prompt_Text,
        COALESCE(a.model_used, s.model_used, '') AS Model_Used,
        COALESCE(a.seed_value, '') AS Seed,
        COALESCE(a.input_tokens, 0) AS Input_Tokens,
        COALESCE(a.output_tokens, 0) AS Output_Tokens,
        COALESCE(a.cost_usd, 0) AS Cost_USD,
        COALESCE(a.cost_pkr, 0) AS Cost_PKR,
        COALESCE(k.label, '') AS Key_Used
      FROM session_prompts p
      JOIN batch_sessions s ON s.session_id = p.session_id
      LEFT JOIN generated_assets a ON a.asset_id = (
        SELECT asset_id FROM generated_assets
        WHERE prompt_id = p.prompt_id
        ORDER BY rowid DESC LIMIT 1
      )
      LEFT JOIN api_keys k ON k.id = COALESCE(a.key_used_id, s.key_used_id)
      WHERE p.session_id = ?
      ORDER BY p.ordinal
    `).all(sessionId);
  }

  getSessionPrompts(sessionId: string): SessionPromptRecord[] {
    return this.db.query<SessionPromptRecord, [string]>(`
      SELECT prompt_id, ordinal, prompt_text, COALESCE(schedule_date, '') AS schedule_date,
        COALESCE(week, '') AS week, COALESCE(theme_column, '') AS theme_column,
        status, error_message, attempts
      FROM session_prompts WHERE session_id = ? ORDER BY ordinal
    `).all(sessionId);
  }

  listSessionPromptOutcomes(sessionId: string): SessionPromptOutcome[] {
    const rows = this.db.query<{
      prompt_id: string; ordinal: number; prompt_text: string; status: PromptStatus;
      error_message: string | null; attempts: number; has_image: number;
      duration_ms: number | null; cost_usd: number;
    }, [string]>(`
      SELECT p.prompt_id, p.ordinal, p.prompt_text, p.status, p.error_message, p.attempts,
        EXISTS(SELECT 1 FROM generated_assets a WHERE a.prompt_id = p.prompt_id) AS has_image,
        p.duration_ms, COALESCE(p.cost_usd, 0) AS cost_usd
      FROM session_prompts p WHERE p.session_id = ? ORDER BY p.ordinal
    `).all(sessionId);
    return rows.map((row) => ({
      promptId: row.prompt_id,
      ordinal: row.ordinal,
      promptText: row.prompt_text,
      status: row.status,
      error: parseError(row.error_message),
      attempts: row.attempts,
      hasImage: row.has_image === 1,
      durationMs: row.duration_ms,
      costUsd: row.cost_usd,
    }));
  }

  markPromptProcessing(promptId: string): boolean {
    return this.db.query(`
      UPDATE session_prompts SET status = 'processing', error_message = NULL, attempts = attempts + 1,
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE prompt_id = ? AND status IN ('pending', 'failed')
    `).run(promptId).changes === 1;
  }

  completePrompt(promptId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }): void {
    this.db.query(`
      UPDATE session_prompts SET status = 'completed', error_message = NULL,
        input_tokens = ?, output_tokens = ?, cost_usd = ?,
        completed_at = CURRENT_TIMESTAMP,
        duration_ms = CASE
          WHEN started_at IS NOT NULL THEN CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400000 AS INTEGER)
          ELSE duration_ms END
      WHERE prompt_id = ? AND status != 'cancelled'
    `).run(usage.inputTokens, usage.outputTokens, usage.costUsd, promptId);
  }

  failPrompt(promptId: string, error: SanitizedProviderError): void {
    this.db.query(`
      UPDATE session_prompts SET status = CASE WHEN status = 'cancelled' THEN status ELSE 'failed' END,
        error_message = CASE WHEN status = 'cancelled' THEN error_message ELSE ? END
      WHERE prompt_id = ?
    `).run(serializeError(error), promptId);
  }

  cancelOpenPrompts(sessionId: string): void {
    this.db.query(`UPDATE session_prompts SET status = 'cancelled' WHERE session_id = ? AND status != 'completed'`).run(sessionId);
  }

  resetRetryablePrompts(sessionId: string): number {
    return this.db.query(`
      UPDATE session_prompts SET status = 'pending', error_message = NULL
      WHERE session_id = ? AND status = 'failed'
    `).run(sessionId).changes;
  }

  listActiveBatchSessionIds(): string[] {
    return this.db.query<{ session_id: string }, []>(`
      SELECT session_id FROM batch_sessions
      WHERE run_mode = 'batch' AND status IN ('pending', 'processing')
        AND (next_poll_at IS NULL OR datetime(next_poll_at) <= CURRENT_TIMESTAMP)
      ORDER BY start_time
    `).all().map((row) => row.session_id);
  }

  aggregatePromptUsage(sessionId: string): { completed: number; failed: number; inputTokens: number; outputTokens: number; costUsd: number } {
    const row = this.db.query<{
      completed: number; failed: number; input_tokens: number; output_tokens: number; cost_usd: number;
    }, [string]>(`
      SELECT SUM(status = 'completed') AS completed, SUM(status = 'failed') AS failed,
        SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
      FROM session_prompts WHERE session_id = ?
    `).get(sessionId);
    return {
      completed: row?.completed ?? 0,
      failed: row?.failed ?? 0,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
      costUsd: row?.cost_usd ?? 0,
    };
  }

  getUsageSummary(range: { startAt?: string | null; endAt?: string | null } = {}): UsageSummary {
    const endAt = range.endAt ?? new Date().toISOString();
    const startAt = range.startAt ?? null;
    const rows = this.db.query<{
      run_mode: RunMode;
      request_count: number;
      completed_count: number;
      failed_count: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      cost_pkr: number;
    }, [string | null, string | null, string]>(`
      SELECT s.run_mode,
        COUNT(p.prompt_id) AS request_count,
        SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        COALESCE(SUM(p.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(p.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(p.cost_usd), 0) AS cost_usd,
        COALESCE(SUM(p.cost_usd * COALESCE(s.fx_rate, 0)), 0) AS cost_pkr
      FROM session_prompts p
      JOIN batch_sessions s ON s.session_id = p.session_id
      WHERE (? IS NULL OR datetime(s.start_time) >= datetime(?))
        AND datetime(s.start_time) < datetime(?)
      GROUP BY s.run_mode
    `).all(startAt, startAt, endAt);

    const empty = (): UsageTotals => ({
      requestCount: 0,
      completedCount: 0,
      failedCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costPkr: 0,
    });
    const fromRow = (row: typeof rows[number]): UsageTotals => ({
      requestCount: Number(row.request_count) || 0,
      completedCount: Number(row.completed_count) || 0,
      failedCount: Number(row.failed_count) || 0,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      costUsd: Number(row.cost_usd) || 0,
      costPkr: Number(row.cost_pkr) || 0,
    });
    const add = (left: UsageTotals, right: UsageTotals): UsageTotals => ({
      requestCount: left.requestCount + right.requestCount,
      completedCount: left.completedCount + right.completedCount,
      failedCount: left.failedCount + right.failedCount,
      inputTokens: left.inputTokens + right.inputTokens,
      outputTokens: left.outputTokens + right.outputTokens,
      costUsd: left.costUsd + right.costUsd,
      costPkr: left.costPkr + right.costPkr,
    });
    const direct = rows.find((row) => row.run_mode === "direct");
    const batch = rows.find((row) => row.run_mode === "batch");
    const directTotals = direct ? fromRow(direct) : empty();
    const batchTotals = batch ? fromRow(batch) : empty();

    return {
      scope: "this_app",
      range: { startAt, endAt },
      generatedAt: new Date().toISOString(),
      total: add(directTotals, batchTotals),
      direct: directTotals,
      batch: batchTotals,
    };
  }

  isSessionCancelled(sessionId: string): boolean {
    return this.getTelemetry(sessionId).status === "cancelled";
  }

  insertGeneratedAsset(asset: {
    assetId: string;
    promptId: string;
    sessionId: string;
    imageFilename: string;
    promptText: string;
    scheduleDate: string;
    week: string;
    themeColumn: string;
    keyUsedId: string | null;
    filePath: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    costPkr?: number;
    sourceKey: string;
  }): boolean {
    const transaction = this.db.transaction(() => {
      if (this.isSessionCancelled(asset.sessionId)) return false;
      // Partial unique index on source_key cannot be used with ON CONFLICT(column);
      // update-or-insert keeps re-persists (batch download retries) idempotent.
      const existing = this.db.query<{ asset_id: string }, [string]>(
        "SELECT asset_id FROM generated_assets WHERE source_key = ?",
      ).get(asset.sourceKey);
      if (existing) {
        this.db.query(`
          UPDATE generated_assets SET
            file_path = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, cost_pkr = ?,
            image_filename = ?, key_used_id = COALESCE(?, key_used_id)
          WHERE source_key = ?
        `).run(
          asset.filePath, asset.inputTokens ?? 0, asset.outputTokens ?? 0,
          asset.costUsd ?? 0, asset.costPkr ?? 0, asset.imageFilename, asset.keyUsedId, asset.sourceKey,
        );
        return true;
      }
      this.db.query(`
      INSERT INTO generated_assets
        (asset_id, prompt_id, session_id, image_filename, prompt_text, schedule_date, week,
         theme_column, key_used_id, file_path, model_used, input_tokens, output_tokens, cost_usd, cost_pkr, source_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        asset.assetId, asset.promptId, asset.sessionId, asset.imageFilename, asset.promptText,
        asset.scheduleDate, asset.week, asset.themeColumn, asset.keyUsedId, asset.filePath,
        asset.model, asset.inputTokens ?? 0, asset.outputTokens ?? 0,
        asset.costUsd ?? 0, asset.costPkr ?? 0, asset.sourceKey,
      );
      return true;
    });
    return transaction();
  }

  listHistory(): HistoryItem[] {
    const rows = this.db.query<{
      prompt_id: string; asset_id: string | null; session_id: string; parent_run_id: string | null;
      wave_index: number | null; prompt_text: string;
      week: string; schedule_date: string; theme_column: string; model_used: string;
      status: SessionStatus; start_time: string; image_filename: string | null; file_path: string | null;
      input_tokens: number; output_tokens: number; cost_usd: number; cost_pkr: number; run_mode: RunMode;
    }, []>(`
      SELECT p.prompt_id, a.asset_id, p.session_id, s.parent_run_id, s.wave_index, p.prompt_text,
        COALESCE(p.week, '') AS week, COALESCE(p.schedule_date, '') AS schedule_date,
        COALESCE(p.theme_column, '') AS theme_column, s.model_used, s.status, s.start_time,
        a.image_filename, a.file_path, COALESCE(a.input_tokens, 0) AS input_tokens,
        COALESCE(a.output_tokens, 0) AS output_tokens, COALESCE(a.cost_usd, 0) AS cost_usd,
        COALESCE(a.cost_pkr, 0) AS cost_pkr, s.run_mode
      FROM session_prompts p
      JOIN batch_sessions s ON s.session_id = p.session_id
      LEFT JOIN generated_assets a ON a.asset_id = (
        SELECT asset_id FROM generated_assets
        WHERE prompt_id = p.prompt_id OR (prompt_id IS NULL AND session_id = p.session_id AND prompt_text = p.prompt_text)
        ORDER BY rowid DESC LIMIT 1
      )
      ORDER BY s.start_time DESC, p.ordinal ASC
      LIMIT 500
    `).all();
    return rows.map((row) => ({
      promptId: row.prompt_id,
      assetId: row.asset_id,
      sessionId: row.session_id,
      parentRunId: row.parent_run_id,
      waveIndex: row.wave_index,
      promptText: row.prompt_text,
      week: row.week,
      scheduleDate: row.schedule_date,
      themeColumn: row.theme_column,
      model: row.model_used,
      status: row.status,
      createdAt: row.start_time,
      imageFilename: row.image_filename,
      hasImage: Boolean(row.asset_id && row.file_path),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd,
      costPkr: row.cost_pkr,
      runMode: row.run_mode,
    }));
  }

  getAsset(assetId: string): GeneratedAssetRecord | null {
    return this.db.query<GeneratedAssetRecord, [string]>(`
      SELECT asset_id, prompt_id, session_id, image_filename, file_path
      FROM generated_assets WHERE asset_id = ?
    `).get(assetId) ?? null;
  }

  deleteHistoryPrompt(promptId: string): { filePaths: string[]; deletedAssets: number } {
    const assetMatch = `
      prompt_id = ? OR (prompt_id IS NULL AND EXISTS (
        SELECT 1 FROM session_prompts p
        WHERE p.prompt_id = ? AND p.session_id = generated_assets.session_id
          AND p.prompt_text = generated_assets.prompt_text
      ))
    `;
    const assets = this.db.query<{ file_path: string }, [string, string]>(
      `SELECT file_path FROM generated_assets WHERE ${assetMatch}`,
    ).all(promptId, promptId);
    const transaction = this.db.transaction(() => {
      const deleted = this.db.query(`DELETE FROM generated_assets WHERE ${assetMatch}`).run(promptId, promptId).changes;
      this.db.query("DELETE FROM session_prompts WHERE prompt_id = ?").run(promptId);
      return deleted;
    });
    return { filePaths: assets.map((asset) => asset.file_path), deletedAssets: transaction() };
  }

  clearHistoryRecords(): { filePaths: string[]; deletedPrompts: number; deletedAssets: number } {
    const filePaths = this.db.query<{ file_path: string }, []>("SELECT file_path FROM generated_assets").all()
      .map((asset) => asset.file_path);
    const transaction = this.db.transaction(() => {
      const deletedAssets = this.db.query("DELETE FROM generated_assets").run().changes;
      const deletedPrompts = this.db.query("DELETE FROM session_prompts").run().changes;
      return { deletedPrompts, deletedAssets };
    });
    return { filePaths, ...transaction() };
  }

  listSessions(): SessionSummary[] {
    const rows = this.db.query<{
      session_id: string; status: SessionStatus; model_used: string; run_mode: RunMode;
      total_prompts: number; completed_count: number; cost_usd: number; cost_pkr: number;
      start_time: string; end_time: string | null; key_label: string | null;
      output_format: string; size_used: string; quality: QualityTier; retryable_count: number;
      diagnostic_id: string; last_provider_error: string | null; parent_run_id: string | null;
      wave_index: number | null; estimate_usd: number; elapsed_ms: number;
    }, []>(`
      SELECT s.session_id, s.status, s.model_used, s.run_mode, s.total_prompts,
        s.completed_count, s.cost_usd, s.cost_pkr, s.start_time, s.end_time,
        k.label AS key_label, s.output_format, s.size_used, s.quality, s.diagnostic_id,
        s.last_provider_error, s.parent_run_id, s.wave_index, s.estimate_usd,
        CAST((julianday(COALESCE(s.end_time, CURRENT_TIMESTAMP)) - julianday(s.start_time)) * 86400000 AS INTEGER) AS elapsed_ms,
        (SELECT COUNT(*) FROM session_prompts p WHERE p.session_id = s.session_id
          AND p.status != 'completed') AS retryable_count
      FROM batch_sessions s LEFT JOIN api_keys k ON k.id = s.key_used_id
      ORDER BY s.start_time DESC LIMIT 100
    `).all();
    return rows.map((row) => ({
      sessionId: row.session_id,
      status: row.status,
      model: row.model_used,
      runMode: row.run_mode,
      totalPrompts: row.total_prompts,
      completedCount: row.completed_count,
      costUsd: row.cost_usd,
      costPkr: row.cost_pkr,
      startTime: row.start_time,
      endTime: row.end_time,
      keyLabel: row.key_label,
      format: isOutputFormatId(row.output_format) ? row.output_format : legacySizeToFormat(row.size_used),
      quality: row.quality,
      retryableCount: row.retryable_count,
      diagnosticId: row.diagnostic_id,
      lastError: parseError(row.last_provider_error),
      parentRunId: row.parent_run_id,
      waveIndex: row.wave_index,
      estimateUsd: row.estimate_usd,
      elapsedMs: Math.max(0, row.elapsed_ms),
    }));
  }

  listRuns(): RunSummary[] {
    const runs = this.db.query<{
      run_id: string; status: SessionStatus; model_used: string; run_mode: RunMode;
      total_prompts: number; completed_count: number; cost_usd: number; cost_pkr: number;
      estimate_usd: number; wave_size: number; wave_count: number; wave_strategy: "all" | "guided" | "parallel"; created_at: string;
      status_message: string; output_format: string; quality: QualityTier; diagnostic_id: string;
    }, []>(`
      SELECT run_id, status, model_used, run_mode, total_prompts, completed_count, cost_usd, cost_pkr,
        estimate_usd, wave_size, wave_count, wave_strategy, created_at, status_message, output_format, quality,
        COALESCE(diagnostic_id, '') AS diagnostic_id
      FROM batch_runs ORDER BY created_at DESC LIMIT 100
    `).all();
    const sessions = this.listSessions();
    return runs.map((run) => ({
      runId: run.run_id,
      status: run.status,
      model: run.model_used,
      runMode: run.run_mode,
      totalPrompts: run.total_prompts,
      completedCount: run.completed_count,
      costUsd: run.cost_usd,
      costPkr: run.cost_pkr,
      estimateUsd: run.estimate_usd,
      waveSize: run.wave_size,
      waveCount: run.wave_count,
      waveStrategy: run.wave_strategy,
      startTime: run.created_at,
      message: run.status_message,
      format: isOutputFormatId(run.output_format) ? run.output_format : "square",
      quality: run.quality,
      diagnosticId: run.diagnostic_id,
      sessions: sessions.filter((session) => session.parentRunId === run.run_id),
    }));
  }

  getRunDetail(runId: string): RunSummary | null {
    return this.listRuns().find((run) => run.runId === runId) ?? null;
  }

  isRunCancelled(runId: string): boolean {
    const row = this.getBatchRun(runId);
    return row?.status === "cancelled";
  }

  aggregateRunUsage(runId: string): { completed: number; failed: number; costUsd: number } {
    const row = this.db.query<{ completed: number; failed: number; cost_usd: number }, [string]>(`
      SELECT COALESCE(SUM(s.completed_count), 0) AS completed,
        COALESCE(SUM((SELECT COUNT(*) FROM session_prompts p WHERE p.session_id = s.session_id AND p.status = 'failed')), 0) AS failed,
        COALESCE(SUM(s.cost_usd), 0) AS cost_usd
      FROM batch_sessions s WHERE s.parent_run_id = ?
    `).get(runId);
    return { completed: row?.completed ?? 0, failed: row?.failed ?? 0, costUsd: row?.cost_usd ?? 0 };
  }

  reconcileMissingAssets(fileExists: (path: string) => boolean): number {
    const assets = this.db.query<{ asset_id: string; prompt_id: string | null; file_path: string }, []>(
      "SELECT asset_id, prompt_id, file_path FROM generated_assets",
    ).all();
    let removed = 0;
    const transaction = this.db.transaction(() => {
      for (const asset of assets) {
        if (fileExists(asset.file_path)) continue;
        this.db.query("DELETE FROM generated_assets WHERE asset_id = ?").run(asset.asset_id);
        if (asset.prompt_id) {
          this.db.query(`UPDATE session_prompts SET status = 'failed', error_message = ? WHERE prompt_id = ?`).run(
            serializeError({ message: "The local image file was removed outside BulkImg Studio.", category: "unknown", httpStatus: null, requestId: null, retryAt: null }),
            asset.prompt_id,
          );
        }
        removed += 1;
      }
    });
    transaction();
    return removed;
  }

  getCachedFx(): { rate: number; ageSeconds: number } | null {
    const row = this.db.query<{ exchange_rate: number; age_seconds: number }, []>(`
      SELECT exchange_rate,
        CAST((julianday(CURRENT_TIMESTAMP) - julianday(last_updated)) * 86400 AS INTEGER) AS age_seconds
      FROM fx_cache WHERE currency_pair = 'USD_PKR'
    `).get();
    return row ? { rate: row.exchange_rate, ageSeconds: row.age_seconds } : null;
  }

  setCachedFx(rate: number): void {
    this.db.query(`
      INSERT INTO fx_cache (currency_pair, exchange_rate, last_updated)
      VALUES ('USD_PKR', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(currency_pair) DO UPDATE SET exchange_rate=excluded.exchange_rate, last_updated=CURRENT_TIMESTAMP
    `).run(rate);
  }
}
