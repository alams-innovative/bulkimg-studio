import { describe, expect, test } from "bun:test";
import { getInitialWindowFrame } from "./window-layout";

describe("initial desktop window layout", () => {
  test("centers a comfortable restored window on a large display", () => {
    expect(getInitialWindowFrame({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      x: 320,
      y: 120,
      width: 1280,
      height: 800,
    });
  });

  test("fits a laptop work area without extending behind the taskbar", () => {
    expect(getInitialWindowFrame({ x: 0, y: 0, width: 1366, height: 728 })).toEqual({
      x: 55,
      y: 37,
      width: 1256,
      height: 655,
    });
  });

  test("respects the position and bounds of a smaller secondary display", () => {
    expect(getInitialWindowFrame({ x: -1024, y: 40, width: 1024, height: 600 })).toEqual({
      x: -983,
      y: 70,
      width: 942,
      height: 540,
    });
  });

  test("uses a safe fallback when display information is unavailable", () => {
    expect(getInitialWindowFrame({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: 40,
      y: 24,
      width: 1280,
      height: 760,
    });
  });
});
