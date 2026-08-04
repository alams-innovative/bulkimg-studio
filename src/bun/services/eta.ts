import type { RunMode, RunPhase, SessionStatus } from "../../shared/contracts";

const DIRECT_CONCURRENCY = 2;
const MIN_PER_REQUEST_MS = 8_000;
const MAX_PER_REQUEST_MS = 180_000;
const BATCH_SEED_MS = 45_000;
const DIRECT_SEED_MS = 35_000;

export type EtaInput = {
  status: SessionStatus;
  phase: RunPhase;
  runMode: RunMode;
  remaining: number;
  totalPrompts: number;
  completedCount: number;
  elapsedMs: number;
  avgDurationMs: number | null;
  /** Remote batch request_counts when still on OpenAI. */
  requestCounts?: { total: number; completed: number; failed: number } | null;
  /** Observed ms per saved image during download/persist. */
  recentSaveMs?: number | null;
};

/**
 * Soft ETA in ms. Always an estimate; UI should display with "~".
 * Returns null when terminal or nothing remains.
 */
export function estimateEtaMs(input: EtaInput): number | null {
  if (["completed", "failed", "cancelled"].includes(input.status)) return null;
  if (input.remaining <= 0 && input.phase !== "waiting_batch" && input.phase !== "queued") {
    // Still may be downloading/persisting with completedCount lagging
    if (!["downloading", "saving", "generating"].includes(input.phase)) return null;
  }

  const seed = input.runMode === "direct" ? DIRECT_SEED_MS : BATCH_SEED_MS;
  const avg = input.avgDurationMs != null && input.avgDurationMs > 0 ? input.avgDurationMs : seed;

  if (input.phase === "waiting_batch" || (input.runMode === "batch" && input.phase === "queued")) {
    const counts = input.requestCounts;
    if (counts && counts.total > 0) {
      const left = Math.max(0, counts.total - counts.completed - counts.failed);
      if (left === 0) return 5_000; // finalize / download about to start
      const finished = Math.max(1, counts.completed + counts.failed);
      const per = clamp(input.elapsedMs / finished, MIN_PER_REQUEST_MS, MAX_PER_REQUEST_MS);
      return Math.round(left * per);
    }
    // Soft elapsed heuristic: assume linear progress through total
    if (input.totalPrompts > 0 && input.completedCount > 0 && input.elapsedMs > 0) {
      const per = clamp(input.elapsedMs / input.completedCount, MIN_PER_REQUEST_MS, MAX_PER_REQUEST_MS);
      return Math.round(Math.max(1, input.remaining) * per);
    }
    return Math.round(Math.max(1, input.remaining || input.totalPrompts) * avg);
  }

  if (input.phase === "downloading" || input.phase === "saving") {
    const per = input.recentSaveMs != null && input.recentSaveMs > 0
      ? clamp(input.recentSaveMs, 200, 60_000)
      : clamp(avg * 0.15, 400, 20_000);
    const left = Math.max(1, input.remaining || Math.max(0, input.totalPrompts - input.completedCount));
    return Math.round(left * per);
  }

  if (input.runMode === "direct" || input.phase === "generating") {
    const remaining = Math.max(0, input.remaining);
    if (remaining === 0) return null;
    return Math.round(Math.ceil(remaining / DIRECT_CONCURRENCY) * avg);
  }

  const remaining = Math.max(0, input.remaining);
  if (remaining === 0) return null;
  return Math.round(remaining * avg);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
