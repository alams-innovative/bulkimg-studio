/**
 * Force-install the latest build/stable-win-x64 package into the Electrobun
 * user install path so dev changes are what the Start-menu launcher runs.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = resolve(import.meta.dir, "..");
const channel = Bun.argv[2] ?? "stable";
const buildDir = join(projectRoot, "build", `${channel}-win-x64`);
const zstdPath = join(projectRoot, "node_modules", "electrobun", "dist-win-x64", "zig-zstd.exe");
const installRoot = join(process.env.LOCALAPPDATA ?? "", "com.bulkimg.studio", channel);
const appDir = join(installRoot, "app");
const archive = readdirSync(buildDir).find((name) => name.includes("-Setup") && name.endsWith(".tar.zst"));
if (!archive) throw new Error(`No Setup.tar.zst in ${buildDir}`);
const archivePath = join(buildDir, archive);
if (!existsSync(zstdPath)) throw new Error(`Missing ${zstdPath}`);
if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is not set");

// Kill only the packaged app launcher — never kill system bun (this install script needs it).
Bun.spawnSync(["taskkill", "/F", "/IM", "launcher.exe"], { stdout: "ignore", stderr: "ignore" });
try {
  Bun.spawnSync([
    "powershell.exe",
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process | Where-Object {
      $_.ExecutablePath -and (
        $_.ExecutablePath -like '*\\com.bulkimg.studio\\*' -or
        $_.Name -eq 'launcher.exe'
      )
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ], { stdout: "ignore", stderr: "ignore" });
} catch { /* ignore */ }

await Bun.sleep(800);

const extractDir = join(tmpdir(), `bulkimg-install-${Date.now()}`);
mkdirSync(extractDir, { recursive: true });

const decompress = Bun.spawnSync([
  zstdPath,
  "decompress",
  "-i",
  archivePath,
  "-o",
  join(extractDir, "app.tar"),
  "--no-timing",
], {
  stdout: "inherit",
  stderr: "inherit",
});
if (decompress.exitCode !== 0) throw new Error("zstd decompress failed");

const untar = Bun.spawnSync(["tar.exe", "-xf", join(extractDir, "app.tar"), "-C", extractDir], {
  stdout: "inherit",
  stderr: "inherit",
});
if (untar.exitCode !== 0) throw new Error("tar extract failed");

// Archive contains a single bundle folder (e.g. BulkImgStudio).
const children = readdirSync(extractDir).filter((name) => name !== "app.tar");
const bundleChild = children.find((name) => {
  const path = join(extractDir, name);
  return existsSync(join(path, "bin")) || existsSync(join(path, "Resources"));
});
if (!bundleChild) throw new Error(`No app bundle in extract: ${children.join(", ")}`);
const payload = join(extractDir, bundleChild);

mkdirSync(installRoot, { recursive: true });
if (existsSync(appDir)) {
  rmSync(appDir, { recursive: true, force: true });
}
cpSync(payload, appDir, { recursive: true });

// Clean temp
rmSync(extractDir, { recursive: true, force: true });

const mainview = join(appDir, "Resources", "app", "views", "mainview", "index.js");
const bun = join(appDir, "Resources", "app", "bun", "index.js");
// Electrobun layout may vary slightly — search if needed
function findFile(root: string, parts: string[]): string | null {
  const direct = join(root, ...parts);
  if (existsSync(direct)) return direct;
  return null;
}
const mainPath = findFile(appDir, ["Resources", "app", "views", "mainview", "index.js"])
  ?? findFile(appDir, ["views", "mainview", "index.js"]);
const bunPath = findFile(appDir, ["Resources", "app", "bun", "index.js"])
  ?? findFile(appDir, ["bun", "index.js"]);

const mainText = mainPath ? await Bun.file(mainPath).text() : "";
const bunText = bunPath ? await Bun.file(bunPath).text() : "";
const markers = {
  installedTo: appDir,
  mainPath,
  bunPath,
  hasWriteDiagnostic: mainText.includes("writeDiagnosticLog"),
  hasPasteCsvOnly: mainText.includes("pasteCsvOnly") || mainText.includes("ui_paste_csv_start"),
  hasReadClipboardCsv: bunText.includes("readClipboardCsv"),
  hasOldPermissionToast: mainText.includes("Could not read the clipboard"),
};
console.log(JSON.stringify(markers, null, 2));
if (!markers.hasWriteDiagnostic || !markers.hasReadClipboardCsv || markers.hasOldPermissionToast) {
  throw new Error("Install completed but markers failed — package contents unexpected.");
}
console.log("OK: local stable install updated. Start:");
console.log(`  ${join(appDir, "bin", "launcher.exe")}`);
