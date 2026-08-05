import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const channel = Bun.argv[2] ?? "stable";
if (channel !== "stable" && channel !== "canary") {
  throw new Error(`Unsupported release channel: ${channel}. Use stable or canary.`);
}

if (process.platform !== "win32") {
  throw new Error("The installed-app opener is only available on Windows.");
}

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  throw new Error("LOCALAPPDATA is not set.");
}

const appDir = join(localAppData, "com.bulkimg.studio", channel, "app");
const launcher = [
  join(appDir, "bin", "launcher.exe"),
  join(appDir, "bin", "launcher"),
].find(existsSync);

if (!launcher) {
  throw new Error(
    `BulkImg Studio is not installed for the ${channel} channel. Run the installer first.`,
  );
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const result = Bun.spawnSync([
  "powershell.exe",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  `Start-Process -FilePath ${quotePowerShell(launcher)} -WorkingDirectory ${quotePowerShell(dirname(launcher))}`,
], {
  stdout: "inherit",
  stderr: "inherit",
});

if (result.exitCode !== 0) {
  throw new Error(`Could not launch ${launcher}`);
}

console.log(`Started BulkImg Studio (${channel}).`);
