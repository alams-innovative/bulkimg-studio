import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ApiKeyStats, HistoryItem, OutputFormatId, PromptStatus, QualityTier, RunMode,
  SanitizedProviderError, SessionPromptOutcome, SessionStatus, SessionSummary, SessionTelemetry, SubmitRunInput,
} from "../shared/contracts";
import { isOutputFormatId, legacySizeToFormat, outputSize } from "../shared/output-formats";

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
    const backupPath = join(dataDirectory, "bulkimg-studio.pre-v3.backup.db");
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
  }

  private ensureColumn(table: "api_keys" | "batch_sessions" | "generated_assets" | "session_prompts" | "reference_files", column: string, definition: string): void {
    const columns = this.db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
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
      WHERE p.session_id = ? AND a.asset_id IS NULL AND p.status != 'cancelled'
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
  ): void {
    const transaction = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO batch_sessions
          (session_id, model_used, run_mode, total_prompts, status, status_message, fx_rate, quality,
           size_used, output_format, reference_file_id, diagnostic_id, estimate_usd, pricing_version)
        VALUES (?, ?, ?, ?, 'pending', 'Queued', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, input.model, input.mode, input.prompts.length, fxRate,
        input.quality, outputSize(input.format), input.format, input.referenceImageFileIds?.[0] ?? null,
        `BIS-${sessionId.replaceAll("-", "").slice(0, 8)}`, estimate.costUsd, estimate.pricingVersion,
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
    }, [string]>(`
      SELECT session_id, status, total_prompts, completed_count,
        CAST((julianday(COALESCE(end_time, CURRENT_TIMESTAMP)) - julianday(start_time)) * 86400000 AS INTEGER) AS elapsed_ms,
        input_tokens, output_tokens, cost_usd, cost_pkr, fx_rate, status_message,
        run_mode, output_format, size_used, quality, diagnostic_id, last_provider_error, next_poll_at,
        (SELECT COUNT(*) FROM session_prompts p WHERE p.session_id = batch_sessions.session_id
          AND p.status != 'completed') AS retryable_count
      FROM batch_sessions WHERE session_id = ?
    `).get(sessionId);
    if (!row) throw new Error(`Unknown session: ${sessionId}`);
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
    }, [string]>(`
      SELECT p.prompt_id, p.ordinal, p.prompt_text, p.status, p.error_message, p.attempts,
        EXISTS(SELECT 1 FROM generated_assets a WHERE a.prompt_id = p.prompt_id) AS has_image
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
    }));
  }

  markPromptProcessing(promptId: string): boolean {
    return this.db.query(`
      UPDATE session_prompts SET status = 'processing', error_message = NULL, attempts = attempts + 1
      WHERE prompt_id = ? AND status IN ('pending', 'failed')
    `).run(promptId).changes === 1;
  }

  completePrompt(promptId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }): void {
    this.db.query(`
      UPDATE session_prompts SET status = 'completed', error_message = NULL,
        input_tokens = ?, output_tokens = ?, cost_usd = ?
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
      this.db.query(`
      INSERT INTO generated_assets
        (asset_id, prompt_id, session_id, image_filename, prompt_text, schedule_date, week,
         theme_column, key_used_id, file_path, model_used, input_tokens, output_tokens, cost_usd, cost_pkr, source_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        file_path = excluded.file_path, input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens, cost_usd = excluded.cost_usd, cost_pkr = excluded.cost_pkr
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
      prompt_id: string; asset_id: string | null; session_id: string; prompt_text: string;
      week: string; schedule_date: string; theme_column: string; model_used: string;
      status: SessionStatus; start_time: string; image_filename: string | null; file_path: string | null;
      input_tokens: number; output_tokens: number; cost_usd: number; cost_pkr: number;
    }, []>(`
      SELECT p.prompt_id, a.asset_id, p.session_id, p.prompt_text,
        COALESCE(p.week, '') AS week, COALESCE(p.schedule_date, '') AS schedule_date,
        COALESCE(p.theme_column, '') AS theme_column, s.model_used, s.status, s.start_time,
        a.image_filename, a.file_path, COALESCE(a.input_tokens, 0) AS input_tokens,
        COALESCE(a.output_tokens, 0) AS output_tokens, COALESCE(a.cost_usd, 0) AS cost_usd,
        COALESCE(a.cost_pkr, 0) AS cost_pkr
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
      diagnostic_id: string; last_provider_error: string | null;
    }, []>(`
      SELECT s.session_id, s.status, s.model_used, s.run_mode, s.total_prompts,
        s.completed_count, s.cost_usd, s.cost_pkr, s.start_time, s.end_time,
        k.label AS key_label, s.output_format, s.size_used, s.quality, s.diagnostic_id,
        s.last_provider_error,
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
    }));
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
