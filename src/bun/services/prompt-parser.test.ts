import { describe, expect, test } from "bun:test";
import { parseCSV, parseManualPrompts } from "./prompt-parser";

describe("prompt parser", () => {
  test("converts a weekly matrix and disables non-prompt cells", () => {
    const matrix = parseCSV(
      "Week #,Wednesday | Technology,Friday | Leadership\n1,Robots in a bright studio,NO IMAGE — Outside period",
      "calendar.csv",
    );
    expect(matrix.columns).toHaveLength(2);
    expect(matrix.cells).toHaveLength(2);
    expect(matrix.cells[0]?.disabled).toBe(false);
    expect(matrix.cells[1]?.disabled).toBe(true);
  });

  test("supports one prompt per line", () => {
    expect(parseManualPrompts("first\nsecond").cells.map((cell) => cell.promptText)).toEqual(["first", "second"]);
  });
});
