import { describe, expect, test } from "bun:test";
import { estimateEtaMs } from "./eta";

describe("estimateEtaMs", () => {
  test("returns null for terminal statuses", () => {
    expect(estimateEtaMs({
      status: "completed", phase: "done", runMode: "batch", remaining: 0,
      totalPrompts: 10, completedCount: 10, elapsedMs: 1000, avgDurationMs: 30_000,
    })).toBeNull();
  });

  test("direct uses concurrency 2", () => {
    const eta = estimateEtaMs({
      status: "processing", phase: "generating", runMode: "direct", remaining: 4,
      totalPrompts: 4, completedCount: 0, elapsedMs: 0, avgDurationMs: 20_000,
    });
    expect(eta).toBe(40_000); // ceil(4/2)*20s
  });

  test("batch remote uses request_counts throughput", () => {
    const eta = estimateEtaMs({
      status: "processing", phase: "waiting_batch", runMode: "batch", remaining: 80,
      totalPrompts: 100, completedCount: 20, elapsedMs: 100_000,
      avgDurationMs: 45_000,
      requestCounts: { total: 100, completed: 20, failed: 0 },
    });
    // left 80 * (100_000/20) = 80 * 5000 but min clamp 8000 → 80*8000
    expect(eta).toBe(80 * 8_000);
  });

  test("download phase uses recent save rate", () => {
    const eta = estimateEtaMs({
      status: "processing", phase: "downloading", runMode: "batch", remaining: 10,
      totalPrompts: 50, completedCount: 40, elapsedMs: 200_000,
      avgDurationMs: 40_000, recentSaveMs: 1_000,
    });
    expect(eta).toBe(10_000);
  });

  test("seed when no averages", () => {
    const eta = estimateEtaMs({
      status: "processing", phase: "generating", runMode: "direct", remaining: 1,
      totalPrompts: 1, completedCount: 0, elapsedMs: 0, avgDurationMs: null,
    });
    expect(eta).toBe(35_000);
  });
});
