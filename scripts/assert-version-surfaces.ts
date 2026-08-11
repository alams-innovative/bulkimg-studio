import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_VERSION } from "../src/shared/build-info";

const root = resolve(import.meta.dir, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const packageVersion = readJson<{ version?: unknown }>(join(root, "package.json")).version;
const themeVersion = readJson<{ version?: unknown }>(join(root, "assets", "brand", "theme.json")).version;
const releaseGuide = readFileSync(join(root, "docs", "RELEASE.md"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const architecture = readFileSync(join(root, "docs", "ARCHITECTURE.md"), "utf8");
const expectedGuideLine = `Current version: \`${APP_VERSION}\`.`;

for (const [surface, value] of [["package.json", packageVersion], ["assets/brand/theme.json", themeVersion]]) {
  if (value !== APP_VERSION) throw new Error(`${surface} version ${String(value)} does not match ${APP_VERSION}.`);
}
if (!releaseGuide.includes(expectedGuideLine)) throw new Error(`docs/RELEASE.md must contain ${expectedGuideLine}`);
if (!readme.includes(`BulkImg Studio ${APP_VERSION}`)) throw new Error(`README.md must identify ${APP_VERSION}.`);
if (!architecture.includes(`BulkImg Studio ${APP_VERSION}`)) throw new Error(`docs/ARCHITECTURE.md must identify ${APP_VERSION}.`);
console.log(`Version surfaces match ${APP_VERSION}.`);
