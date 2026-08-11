/**
 * Canonical runtime release identity. Packaging metadata is checked against
 * this value by scripts/assert-version-surfaces.ts before every build.
 */
export const APP_VERSION = "1.1.1-beta.0";
export const APP_CHANNEL = "beta" as const;
