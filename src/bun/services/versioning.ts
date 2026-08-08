import type { UpdateChannel } from "../../shared/update-contracts";

type ParsedVersion = { major: number; minor: number; patch: number; prerelease: string | null };

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(value.trim().replace(/^v/, ""));
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Versions must use semantic versioning.");
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export function isEligibleForChannel(channel: UpdateChannel, releaseChannel: UpdateChannel): boolean {
  return channel === "beta" || releaseChannel === "stable";
}

export function isAtLeast(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}
