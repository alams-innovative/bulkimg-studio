import { describe, expect, test } from "bun:test";
import { parseCSV, parseManualPrompts } from "./prompt-parser";

describe("prompt parser", () => {
  test("converts a weekly matrix, preserves groups, and disables non-prompt cells", () => {
    const matrix = parseCSV(
      "Week #,Week Start Date,Wednesday | Technology,Friday | Leadership\nWeek 1,05 Aug 2026,05 AUG 2026 — Robots in a bright studio,NO IMAGE — Outside period",
      "calendar.csv",
    );
    expect(matrix.columns).toHaveLength(2);
    expect(matrix.cells).toHaveLength(2);
    expect(matrix.groups).toEqual([{ id: "week-1", label: "Week 1", startDate: "05 Aug 2026", cellIds: ["cell-1-1", "cell-1-2"] }]);
    expect(matrix.cells[0]).toMatchObject({ disabled: false, dayLabel: "Wednesday", themeColumn: "Technology", scheduleDate: "05 Aug 2026" });
    expect(matrix.cells[1]).toMatchObject({ disabled: true, dayLabel: "Friday", themeColumn: "Leadership", scheduleDate: "07 Aug 2026" });
  });

  test("supports one prompt per line", () => {
    const matrix = parseManualPrompts("first\nsecond");
    expect(matrix.cells.map((cell) => cell.promptText)).toEqual(["first", "second"]);
    expect(matrix.groups[0]?.cellIds).toEqual(["cell-1-1", "cell-2-1"]);
  });
});
