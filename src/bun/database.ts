import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ApiKeyStats, HistoryItem, SessionStatus, SessionSummary, SessionTelemetry, SubmitRunInput } from "../shared/contracts";

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
};

export type GeneratedAssetRecord = {
  asset_id: string;
  prompt_id: string | null;
  session_id: string;
  image_filename: string;
  file_path: string;
};

export class AppDatabase {
  readonly db: Database;

  constructor(dataDirectory: string) {
    mkdirSync(dataDirectory, { recursive: true });
    this.db = new Database(join(dataDirectory, "bulkimg-studio.db"), { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
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
    this.ensureColumn("generated_assets", "prompt_id", "TEXT");
  }

  private ensureColumn(table: "api_keys" | "batch_sessions" | "generated_assets", column: string, definition: string): void {
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

  createSession(sessionId: string, input: SubmitRunInput, fxRate: number): void {
    const transaction = this.db.transaction(() => {
      this.db.query(`
        INSERT INTO batch_sessions
          (session_id, model_used, run_mode, total_prompts, status, status_message, fx_rate)
        VALUES (?, ?, ?, ?, 'pending', 'Queued locally', ?)
      `).run(sessionId, input.model, input.mode, input.prompts.length, fxRate);

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
  }): void {
    const row = this.getTelemetry(sessionId);
    const costUsd = update.costUsd ?? row.costUsd;
    this.db.query(`
      UPDATE batch_sessions SET
        external_batch_id = COALESCE(?, external_batch_id),
        status = ?, status_message = ?, completed_count = ?,
        input_tokens = ?, output_tokens = ?, cost_usd = ?, cost_pkr = ?,
        end_time = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE end_time END
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
    }, [string]>(`
      SELECT session_id, status, total_prompts, completed_count,
        CAST((julianday(COALESCE(end_time, CURRENT_TIMESTAMP)) - julianday(start_time)) * 86400000 AS INTEGER) AS elapsed_ms,
        input_tokens, output_tokens, cost_usd, cost_pkr, fx_rate, status_message
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
    };
  }

  getExportRows(sessionId: string): Array<Record<string, string | number>> {
    return this.db.query<Record<string, string | number>, [string]>(`
      SELECT ordinal AS Ordinal, week AS Week, schedule_date AS Schedule_Date,
        theme_column AS Theme_Column, prompt_text AS Prompt_Text
      FROM session_prompts WHERE session_id = ? ORDER BY ordinal
    `).all(sessionId);
  }

  getSessionPrompts(sessionId: string): SessionPromptRecord[] {
    return this.db.query<SessionPromptRecord, [string]>(`
      SELECT prompt_id, ordinal, prompt_text, COALESCE(schedule_date, '') AS schedule_date,
        COALESCE(week, '') AS week, COALESCE(theme_column, '') AS theme_column
      FROM session_prompts WHERE session_id = ? ORDER BY ordinal
    `).all(sessionId);
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
  }): void {
    this.db.query(`
      INSERT INTO generated_assets
        (asset_id, prompt_id, session_id, image_filename, prompt_text, schedule_date, week,
         theme_column, key_used_id, file_path, model_used, input_tokens, output_tokens, cost_usd, cost_pkr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.assetId, asset.promptId, asset.sessionId, asset.imageFilename, asset.promptText,
      asset.scheduleDate, asset.week, asset.themeColumn, asset.keyUsedId, asset.filePath,
      asset.model, asset.inputTokens ?? 0, asset.outputTokens ?? 0,
      asset.costUsd ?? 0, asset.costPkr ?? 0,
    );
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
      session_id: string; status: SessionStatus; model_used: string; run_mode: "batch" | "direct";
      total_prompts: number; completed_count: number; cost_usd: number; cost_pkr: number;
      start_time: string; end_time: string | null; key_label: string | null;
    }, []>(`
      SELECT s.session_id, s.status, s.model_used, s.run_mode, s.total_prompts,
        s.completed_count, s.cost_usd, s.cost_pkr, s.start_time, s.end_time,
        k.label AS key_label
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
    }));
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
