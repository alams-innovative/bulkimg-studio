/**
 * Canonical runtime release identity. Packaging metadata is checked against
 * this value by scripts/assert-version-surfaces.ts before every build.
 */
export const APP_VERSION = "1.1.2";
export const APP_CHANNEL = "stable" as const;
