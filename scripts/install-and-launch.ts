import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const channel = Bun.argv[2] ?? "stable";
if (channel !== "stable" && channel !== "beta") {
  throw new Error(`Unsupported release channel: ${channel}. Use stable or beta.`);
}

if (process.platform !== "win32") {
  throw new Error("The installer launcher is only available on Windows.");
}

const projectRoot = resolve(import.meta.dir, "..");
const buildDir = join(projectRoot, "build", `${channel}-win-x64`);
if (!existsSync(buildDir)) {
  throw new Error(
    `The ${channel} build directory does not exist. Run bun run build${channel === "beta" ? ":beta" : ""} first.`,
  );
}
const setupExeName = readdirSync(buildDir).find(
  (name) => name.includes("-Setup") && name.endsWith(".exe"),
);
const setupMetadataName = readdirSync(buildDir).find(
  (name) => name.includes("-Setup") && name.endsWith(".metadata.json"),
);
const setupArchiveName = readdirSync(buildDir).find(
  (name) => name.includes("-Setup") && name.endsWith(".tar.zst"),
);

if (!setupExeName || !setupMetadataName || !setupArchiveName) {
  throw new Error(
    `The ${channel} build is incomplete. Run bun run build${channel === "beta" ? ":beta" : ""} first.`,
  );
}

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  throw new Error("LOCALAPPDATA is not set.");
}

const appDir = join(localAppData, "com.bulkimg.studio", channel, "app");
const stagingDir = mkdtempSync(join(tmpdir(), `bulkimg-${channel}-installer-`));
const installerDataDir = join(stagingDir, ".installer");
const stagedSetup = join(stagingDir, setupExeName);
const launcherCandidates = [
  join(appDir, "bin", "launcher.exe"),
  join(appDir, "bin", "launcher"),
];

const processFilter = `*\\com.bulkimg.studio\\${channel}\\*`;
const stopInstalled = Bun.spawnSync([
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  `Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath -like '${processFilter}'
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }`,
], {
  stdout: "ignore",
  stderr: "ignore",
});
if (stopInstalled.exitCode !== 0) {
  throw new Error(`Could not stop the existing ${channel} installation before updating it.`);
}
await Bun.sleep(800);

mkdirSync(installerDataDir, { recursive: true });
copyFileSync(join(buildDir, setupExeName), stagedSetup);
copyFileSync(join(buildDir, setupMetadataName), join(installerDataDir, setupMetadataName));
copyFileSync(join(buildDir, setupArchiveName), join(installerDataDir, setupArchiveName));

try {
  console.log(`Running ${setupExeName}...`);
  // Launch through Windows rather than Bun's direct process spawn. The setup
  // program is a GUI executable and Windows can deny Bun's direct uv_spawn
  // from a temporary directory even when the same installer is valid.
  const escapedSetup = stagedSetup.replaceAll("'", "''");
  const escapedStagingDirectory = stagingDir.replaceAll("'", "''");
  const setup = Bun.spawnSync([
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$process = Start-Process -FilePath '${escapedSetup}' -WorkingDirectory '${escapedStagingDirectory}' -Wait -PassThru; exit $process.ExitCode`,
  ], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (setup.exitCode !== 0) {
    throw new Error(`Installer exited with code ${setup.exitCode}.`);
  }

  let launcher: string | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    launcher = launcherCandidates.find(existsSync);
    if (launcher) break;
    await Bun.sleep(500);
  }

  if (!launcher) {
    throw new Error(`Installation finished, but no ${channel} launcher was found in ${appDir}.`);
  }

  const escapedLauncher = launcher.replaceAll("'", "''");
  const escapedWorkingDirectory = join(appDir, "bin").replaceAll("'", "''");
  const launch = Bun.spawnSync([
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Start-Process -FilePath '${escapedLauncher}' -WorkingDirectory '${escapedWorkingDirectory}'`,
  ], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (launch.exitCode !== 0) {
    throw new Error(`Installed app could not be started: ${launcher}`);
  }

  console.log(`Installed and started BulkImg Studio (${channel}).`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
