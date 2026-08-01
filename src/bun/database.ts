import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SessionStatus, SessionTelemetry, SubmitRunInput } from "../shared/contracts";

export type ApiKeyRecord = {
  id: string;
  key_value: string;
  label: string;
  is_active: number;
  rate_limited_until: string | null;
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
  }

  listKeys(): ApiKeyRecord[] {
    return this.db.query<ApiKeyRecord, []>(
      "SELECT id, key_value, COALESCE(label, 'OpenAI key') AS label, is_active, rate_limited_until FROM api_keys ORDER BY created_at",
    ).all();
  }

  insertKey(record: { id: string; encryptedKey: string; label: string }): void {
    this.db.query("INSERT INTO api_keys (id, key_value, label) VALUES (?, ?, ?)")
      .run(record.id, record.encryptedKey, record.label);
  }

  markRateLimited(id: string, until: string): void {
    this.db.query("UPDATE api_keys SET rate_limited_until = ? WHERE id = ?").run(until, id);
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
