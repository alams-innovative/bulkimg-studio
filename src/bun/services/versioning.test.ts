import { expect, test } from "bun:test";
import { compareVersions, isEligibleForChannel, parseVersion } from "./versioning";

test("semantic version comparison keeps stable ahead of its prerelease", () => {
  expect(compareVersions("1.2.0", "1.2.0-beta.2")).toBeGreaterThan(0);
  expect(compareVersions("1.2.1", "1.2.0")).toBeGreaterThan(0);
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  expect(parseVersion("v1.0.0-beta.1")?.prerelease).toBe("beta.1");
});

test("stable channel never receives beta releases", () => {
  expect(isEligibleForChannel("stable", "stable")).toBe(true);
  expect(isEligibleForChannel("stable", "beta")).toBe(false);
  expect(isEligibleForChannel("beta", "stable")).toBe(true);
  expect(isEligibleForChannel("beta", "beta")).toBe(true);
});
