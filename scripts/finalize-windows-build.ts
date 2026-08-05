import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const channel = Bun.argv[2] ?? "stable";
if (channel !== "stable" && channel !== "canary") {
  throw new Error(`Unsupported release channel: ${channel}. Use stable or canary.`);
}
const projectRoot = resolve(import.meta.dir, "..");
const platformName = `${channel}-win-x64`;
const buildDir = join(projectRoot, "build", platformName);
const artifactsDir = join(projectRoot, "artifacts");
const iconPath = join(projectRoot, "assets", "brand", "app_icon.ico");
const zstdPath = join(projectRoot, "node_modules", "electrobun", "dist-win-x64", "zig-zstd.exe");
const rceditPath = join(projectRoot, "node_modules", "rcedit", "bin", "rcedit-x64.exe");

function run(command: string, args: string[]): void {
  const result = Bun.spawnSync([command, ...args], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${basename(command)} exited with code ${result.exitCode}`);
  }
}

function findOne(directory: string, predicate: (name: string) => boolean): string {
  const match = readdirSync(directory).find(predicate);
  if (!match) throw new Error(`Required build output was not found in ${directory}`);
  return join(directory, match);
}

function setWindowsGuiSubsystem(filePath: string): void {
  const bytes = readFileSync(filePath);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error(`${filePath} is not a Windows PE executable`);
  }

  const peOffset = bytes.readUInt32LE(0x3c);
  const subsystemOffset = peOffset + 24 + 0x44;
  if (bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error(`${filePath} has an invalid PE signature`);
  }

  // IMAGE_SUBSYSTEM_WINDOWS_GUI prevents Windows from allocating a console.
  bytes.writeUInt16LE(2, subsystemOffset);
  writeFileSync(filePath, bytes);
}

function brandExecutable(filePath: string): void {
  run(rceditPath, [filePath, "--set-icon", iconPath]);
  setWindowsGuiSubsystem(filePath);
}

if (process.platform !== "win32") {
  console.log("Skipping Windows build finalization on a non-Windows host.");
  process.exit(0);
}

for (const required of [buildDir, iconPath, zstdPath, rceditPath]) {
  if (!existsSync(required)) throw new Error(`Required path is missing: ${required}`);
}

const setupExe = findOne(buildDir, (name) => name.includes("-Setup") && name.endsWith(".exe"));
const setupMetadata = findOne(buildDir, (name) => name.includes("-Setup") && name.endsWith(".metadata.json"));
const setupArchive = findOne(buildDir, (name) => name.includes("-Setup") && name.endsWith(".tar.zst"));
const bundleDir = readdirSync(buildDir)
  .map((name) => join(buildDir, name))
  .find((path) => existsSync(join(path, "Resources")) && existsSync(join(path, "bin")));
if (!bundleDir) throw new Error(`Application bundle was not found in ${buildDir}`);

const embeddedArchive = findOne(join(bundleDir, "Resources"), (name) => name.endsWith(".tar.zst"));
const bundleLauncher = findOne(join(bundleDir, "bin"), (name) => name === "launcher" || name === "launcher.exe");
const scratch = mkdtempSync(join(tmpdir(), "bulkimg-windows-build-"));

try {
  const tarPath = join(scratch, "app.tar");
  const extractedDir = join(scratch, "extracted");
  const rebuiltTar = join(scratch, "rebuilt.tar");
  const rebuiltArchive = join(scratch, "rebuilt.tar.zst");
  mkdirSync(extractedDir);

  run(zstdPath, ["decompress", "-i", setupArchive, "-o", tarPath, "--no-timing"]);
  run("tar.exe", ["-xf", tarPath, "-C", extractedDir]);

  const extractedBundle = readdirSync(extractedDir)
    .map((name) => join(extractedDir, name))
    .find((path) => existsSync(join(path, "bin")));
  if (!extractedBundle) throw new Error("The installer archive did not contain an application bundle");

  brandExecutable(join(extractedBundle, "bin", "launcher.exe"));
  brandExecutable(join(extractedBundle, "bin", "bun.exe"));
  run("tar.exe", ["-cf", rebuiltTar, "-C", extractedDir, basename(extractedBundle)]);
  run(zstdPath, ["compress", "-i", rebuiltTar, "-o", rebuiltArchive, "-l", "19", "--no-timing"]);

  brandExecutable(setupExe);
  brandExecutable(bundleLauncher);
  copyFileSync(rebuiltArchive, setupArchive);
  copyFileSync(rebuiltArchive, embeddedArchive);

  const zipStaging = join(scratch, "installer-zip");
  const zipInstallerDir = join(zipStaging, ".installer");
  mkdirSync(zipInstallerDir, { recursive: true });
  copyFileSync(setupExe, join(zipStaging, basename(setupExe)));
  copyFileSync(setupMetadata, join(zipInstallerDir, basename(setupMetadata)));
  copyFileSync(setupArchive, join(zipInstallerDir, basename(setupArchive)));
  writeFileSync(
    join(zipStaging, "INSTALL.txt"),
    [
      "BulkImg Studio Windows Installer",
      "",
      "1. Keep this folder together.",
      "2. Run Install-BulkImgStudio.cmd to install and open the app automatically.",
      `3. To install without opening the app, run ${basename(setupExe)} instead.`,
      "4. The installer places BulkImg Studio in your user application directory.",
      "5. Future launches use the Start menu entry.",
      "",
      "The .installer folder is required by the Electrobun setup program.",
      "Do not distribute the setup executable without that folder.",
      "",
    ].join("\r\n"),
  );
  writeFileSync(
    join(zipStaging, "Install-BulkImgStudio.ps1"),
    [
      "$ErrorActionPreference = 'Stop'",
      `$channel = '${channel}'`,
      "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
      "$setup = Get-ChildItem -LiteralPath $root -Filter '*-Setup.exe' | Select-Object -First 1",
      "if (-not $setup) { throw 'The Electrobun setup executable was not found.' }",
      "$processFilter = \"*\\com.bulkimg.studio\\$channel\\*\"",
      "Get-CimInstance Win32_Process | Where-Object {",
      "  $_.ExecutablePath -and $_.ExecutablePath -like $processFilter",
      "} | ForEach-Object {",
      "  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue",
      "}",
      "Start-Sleep -Milliseconds 800",
      "$result = Start-Process -FilePath $setup.FullName -WorkingDirectory $root -Wait -PassThru",
      "if ($result.ExitCode -ne 0) { throw \"Installer exited with code $($result.ExitCode).\" }",
      "$appDir = Join-Path $env:LOCALAPPDATA \"com.bulkimg.studio\\$channel\\app\"",
      "$launcher = Join-Path $appDir 'bin\\launcher.exe'",
      "for ($attempt = 0; $attempt -lt 60; $attempt++) {",
      "  if (Test-Path -LiteralPath $launcher) {",
      "    Start-Process -FilePath $launcher -WorkingDirectory (Split-Path -Parent $launcher)",
      "    exit 0",
      "  }",
      "  Start-Sleep -Milliseconds 500",
      "}",
      "throw \"Installation completed, but the app launcher was not found at $launcher.\"",
      "",
    ].join("\r\n"),
  );
  writeFileSync(
    join(zipStaging, "Install-BulkImgStudio.cmd"),
    [
      "@echo off",
      "setlocal",
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-BulkImgStudio.ps1"`,
      "exit /b %ERRORLEVEL%",
      "",
    ].join("\r\n"),
  );

  const buildZip = join(buildDir, `${basename(setupExe, ".exe").replaceAll(" ", "")}.zip`);
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${zipStaging}\\*' -DestinationPath '${buildZip}' -Force`,
  ]);

  mkdirSync(artifactsDir, { recursive: true });
  copyFileSync(buildZip, join(artifactsDir, `${platformName}-BulkImgStudio-Setup.zip`));
  copyFileSync(rebuiltArchive, join(artifactsDir, `${platformName}-BulkImgStudio.tar.zst`));

  console.log(`Finalized GUI-subsystem installer package: ${buildZip}`);
  console.log("Install by extracting the ZIP and running Install-BulkImgStudio.cmd.");
  console.log(`Installer package size: ${(statSync(buildZip).size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
