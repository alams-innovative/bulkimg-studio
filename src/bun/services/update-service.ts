import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AppDatabase } from "../database";
import type { DiagnosticLog } from "./diagnostics";
import type { UpdateChannel, UpdateConfig, UpdateManifest, UpdateRelease, UpdateState } from "../../shared/update-contracts";
import { compareVersions, isAtLeast, isEligibleForChannel, parseVersion } from "./versioning";

type GitHubAsset = { name: string; browser_download_url: string; size: number };
type GitHubRelease = { tag_name: string; prerelease: boolean; draft: boolean; published_at: string; html_url: string; assets: GitHubAsset[] };
type ResolvedRelease = { manifest: UpdateManifest; zipPath: string | null };

const SETTINGS = {
  channel: "update_channel",
  lastCheckedAt: "update_last_checked_at",
  lastError: "update_last_error",
  downloadedVersion: "update_downloaded_version",
  downloadedPath: "update_downloaded_path",
  previousWorkingVersion: "update_previous_working_version",
} as const;

const GITHUB_API = "https://api.github.com";

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Update check failed.";
}

function isSafeGitHubAssetUrl(value: string, repository: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith(`/${repository}/releases/download/`);
  } catch { return false; }
}

function releaseView(manifest: UpdateManifest, currentVersion: string, available: boolean, unavailableReason: string | null): UpdateRelease {
  return {
    version: manifest.version,
    tag: manifest.tag,
    channel: manifest.channel,
    publishedAt: manifest.publishedAt,
    releaseNotesUrl: manifest.releaseNotesUrl,
    minimumSupportedVersion: manifest.minimumSupportedVersion,
    architectures: manifest.architectures,
    schemaVersion: manifest.schemaVersion,
    available,
    unavailableReason,
    isCurrent: compareVersions(manifest.version, currentVersion) === 0,
  };
}

export function verifySignedUpdateManifest(manifestText: string, signatureText: string, config: UpdateConfig): UpdateManifest {
  const signature = Buffer.from(signatureText.trim(), "base64");
  const publicKey = createPublicKey(config.publicKeyPem);
  if (!verify(null, Buffer.from(manifestText), publicKey, signature)) throw new Error("Update manifest signature is invalid.");
  let manifest: UpdateManifest;
  try { manifest = JSON.parse(manifestText) as UpdateManifest; } catch { throw new Error("Update manifest is not valid JSON."); }
  if (!parseVersion(manifest.version) || manifest.tag !== `v${manifest.version}`) throw new Error("Update manifest version and tag do not match.");
  if (manifest.channel !== "stable" && manifest.channel !== "beta") throw new Error("Update manifest channel is invalid.");
  if (!parseVersion(manifest.minimumSupportedVersion)) throw new Error("Update manifest minimum version is invalid.");
  if (!Number.isSafeInteger(manifest.zipBytes) || manifest.zipBytes < 1) throw new Error("Update manifest file size is invalid.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.zipSha256)) throw new Error("Update manifest SHA-256 is invalid.");
  if (!Array.isArray(manifest.architectures) || !manifest.architectures.every((architecture) => architecture === "x64" || architecture === "arm64")) throw new Error("Update manifest architectures are invalid.");
  if (!isSafeGitHubAssetUrl(manifest.zipUrl, config.repository)) throw new Error("Update ZIP URL is not an approved GitHub release asset.");
  const notesHost = new URL(manifest.releaseNotesUrl).hostname;
  if (notesHost !== "github.com" && notesHost !== "www.github.com") throw new Error("Update notes URL is not approved.");
  return manifest;
}

export class UpdateService {
  private readonly updateDirectory: string;
  private readonly releases = new Map<string, ResolvedRelease>();
  private checking = false;
  private downloading = false;
  private activity: UpdateState["activity"] = "idle";
  private progress: UpdateState["progress"] = null;

  constructor(
    private readonly database: AppDatabase,
    private readonly dataDirectory: string,
    private readonly currentVersion: string,
    private readonly config: UpdateConfig,
    private readonly architecture: "x64" | "arm64",
    private readonly diagnostics?: DiagnosticLog,
  ) {
    this.updateDirectory = join(dataDirectory, "updates");
    mkdirSync(this.updateDirectory, { recursive: true });
  }

  private get channel(): UpdateChannel {
    return this.database.getSetting(SETTINGS.channel, "stable") === "beta" ? "beta" : "stable";
  }

  private configured(): boolean {
    return this.config.repository === "alams-innovative/bulkimg-studio" && this.config.publicKeyPem.trim().includes("BEGIN PUBLIC KEY");
  }

  markHealthyStartup(): void {
    const healthDirectory = join(this.updateDirectory, "health");
    mkdirSync(healthDirectory, { recursive: true });
    writeFileSync(join(healthDirectory, `${this.currentVersion}.ok`), new Date().toISOString());
  }

  private record(event: string, fields: Record<string, unknown> = {}): void {
    void this.diagnostics?.write(event, fields);
  }

  recoverInstallerFailure(): string | null {
    try {
      const helperLogs = readdirSync(this.updateDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(this.updateDirectory, entry.name, "update-helper.log"))
        .filter(existsSync)
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
      const latestLog = helperLogs[0];
      if (!latestLog) return null;
      const failure = readFileSync(latestLog, "utf8").match(/Updater helper failed:\s*(.+)/)?.[1]?.trim();
      if (!failure) return null;
      const message = `Update did not finish: ${failure} Your current app was kept unchanged. Try again from About & updates.`;
      this.database.setSetting(SETTINGS.lastError, message);
      return message;
    } catch {
      return null;
    }
  }

  private stableFallbackFor(target: ResolvedRelease): ResolvedRelease | null {
    return [...this.releases.values()]
      .filter((candidate) => candidate.manifest.channel === "stable")
      .filter((candidate) => candidate.manifest.schemaVersion === target.manifest.schemaVersion)
      .filter((candidate) => this.toView(candidate.manifest).available)
      .sort((left, right) => compareVersions(right.manifest.version, left.manifest.version))[0] ?? null;
  }

  private async cacheFallback(release: ResolvedRelease): Promise<string> {
    if (release.zipPath && existsSync(release.zipPath)) {
      const hash = createHash("sha256").update(readFileSync(release.zipPath)).digest("hex");
      if (hash === release.manifest.zipSha256.toLowerCase()) return release.zipPath;
    }
    const directory = join(this.updateDirectory, `${release.manifest.version}-recovery`);
    const path = join(directory, "BulkImgStudio-Setup.zip");
    mkdirSync(directory, { recursive: true });
    const response = await fetch(release.manifest.zipUrl, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!response.ok) throw new Error(`Could not download the Stable recovery release (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== release.manifest.zipBytes) throw new Error("Stable recovery release size does not match its signed manifest.");
    if (createHash("sha256").update(bytes).digest("hex") !== release.manifest.zipSha256.toLowerCase()) {
      throw new Error("Stable recovery release checksum does not match its signed manifest.");
    }
    writeFileSync(path, bytes);
    release.zipPath = path;
    return path;
  }

  state(): UpdateState {
    const releases = [...this.releases.values()]
      .map(({ manifest }) => this.toView(manifest))
      .sort((left, right) => compareVersions(right.version, left.version));
    const available = releases.find((release) => release.available && !release.isCurrent && compareVersions(release.version, this.currentVersion) > 0) ?? null;
    const stableFallbacks = releases
      .filter((release) => release.channel === "stable" && release.available && compareVersions(release.version, this.currentVersion) !== 0)
      .map((release) => release.version)
      .slice(0, 2);
    return {
      configured: this.configured(),
      currentVersion: this.currentVersion,
      channel: this.channel,
      lastCheckedAt: this.database.getSetting(SETTINGS.lastCheckedAt) || null,
      lastError: this.database.getSetting(SETTINGS.lastError) || null,
      activity: this.activity,
      progress: this.progress,
      available,
      releases,
      downloadedVersion: this.database.getSetting(SETTINGS.downloadedVersion) || null,
      fallbackStableVersions: stableFallbacks,
    };
  }

  setChannel(channel: UpdateChannel): UpdateState {
    this.database.setSetting(SETTINGS.channel, channel);
    return this.state();
  }

  private toView(manifest: UpdateManifest): UpdateRelease {
    const eligible = isEligibleForChannel(this.channel, manifest.channel);
    const architectureMatches = manifest.architectures.includes(this.architecture);
    const minimumMatches = isAtLeast(this.currentVersion, manifest.minimumSupportedVersion);
    const isRollback = compareVersions(manifest.version, this.currentVersion) < 0;
    const schemaCompatible = !isRollback || manifest.schemaVersion === this.database.schemaVersion();
    const available = eligible && architectureMatches && minimumMatches && schemaCompatible;
    const unavailableReason = !eligible ? "Enable beta updates to install this release."
      : !architectureMatches ? `This release does not support Windows ${this.architecture}.`
      : !minimumMatches ? `Requires BulkImg Studio ${manifest.minimumSupportedVersion} or newer.`
      : !schemaCompatible ? "This older version cannot safely open the current local database."
      : null;
    return releaseView(manifest, this.currentVersion, available, unavailableReason);
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "BulkImg-Studio-Updater" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
    return response.text();
  }

  async check(): Promise<UpdateState> {
    if (!this.configured()) {
      this.database.setSetting(SETTINGS.lastError, "Update verification is not configured in this build.");
      return this.state();
    }
    if (this.checking) return this.state();
    this.checking = true;
    this.activity = "checking";
    this.record("update_check_started", { channel: this.channel, currentVersion: this.currentVersion, architecture: this.architecture });
    try {
      const response = await fetch(`${GITHUB_API}/repos/${this.config.repository}/releases?per_page=40`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "BulkImg-Studio-Updater" }, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`GitHub returned ${response.status} while listing releases.`);
      const releases = await response.json() as GitHubRelease[];
      this.releases.clear();
      for (const release of releases.filter((candidate) => !candidate.draft)) {
        const manifestAsset = release.assets.find((asset) => asset.name === "bulkimg-update.json");
        const signatureAsset = release.assets.find((asset) => asset.name === "bulkimg-update.json.sig");
        if (!manifestAsset || !signatureAsset) continue;
        try {
          const [manifestText, signatureText] = await Promise.all([this.fetchText(manifestAsset.browser_download_url), this.fetchText(signatureAsset.browser_download_url)]);
          const manifest = verifySignedUpdateManifest(manifestText, signatureText, this.config);
          const zipAsset = release.assets.find((asset) => asset.browser_download_url === manifest.zipUrl);
          if (!zipAsset || zipAsset.size !== manifest.zipBytes || release.tag_name !== manifest.tag || release.prerelease !== (manifest.channel === "beta")) continue;
          this.releases.set(manifest.version, { manifest, zipPath: null });
        } catch {
          // A malformed historical release is unavailable, not a reason to hide valid releases.
        }
      }
      this.database.setSetting(SETTINGS.lastCheckedAt, new Date().toISOString());
      this.record("update_check_complete", { channel: this.channel, publishedReleaseCount: releases.length, compatibleReleaseCount: this.releases.size });
    } catch (error) {
      this.database.setSetting(SETTINGS.lastError, asErrorMessage(error));
      this.activity = "error";
      return this.state();
    } finally {
      this.checking = false;
      if (this.activity === "checking") this.activity = "idle";
    }
    return this.state();
  }

  async download(version: string): Promise<UpdateState> {
    if (this.downloading) throw new Error("An update download is already in progress.");
    const release = this.releases.get(version);
    if (!release || !this.toView(release.manifest).available) throw new Error("That update is unavailable for this installation.");
    this.downloading = true;
    this.activity = "downloading";
    this.progress = { receivedBytes: 0, totalBytes: release.manifest.zipBytes };
    this.record("update_download_started", { version, expectedBytes: release.manifest.zipBytes, channel: release.manifest.channel });
    const directory = join(this.updateDirectory, `${release.manifest.version}-${crypto.randomUUID()}`);
    const temporaryPath = join(directory, "download.part");
    const finalPath = join(directory, "BulkImgStudio-Setup.zip");
    mkdirSync(directory, { recursive: true });
    try {
      const response = await fetch(release.manifest.zipUrl, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!response.ok || !response.body) throw new Error(`Update ZIP download failed with ${response.status}.`);
      const writer = Bun.file(temporaryPath).writer();
      const reader = response.body.getReader();
      const hash = createHash("sha256");
      let receivedBytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        hash.update(part.value);
        writer.write(part.value);
        receivedBytes += part.value.byteLength;
        this.progress = { receivedBytes, totalBytes: release.manifest.zipBytes };
      }
      await writer.end();
      if (receivedBytes !== release.manifest.zipBytes || statSync(temporaryPath).size !== release.manifest.zipBytes) throw new Error("Downloaded update size does not match the signed manifest.");
      if (hash.digest("hex") !== release.manifest.zipSha256.toLowerCase()) throw new Error("Downloaded update checksum does not match the signed manifest.");
      renameSync(temporaryPath, finalPath);
      release.zipPath = finalPath;
      this.database.setSetting(SETTINGS.downloadedVersion, version);
      this.database.setSetting(SETTINGS.downloadedPath, finalPath);
      this.database.setSetting(SETTINGS.lastError, "");
      this.activity = "ready";
      this.record("update_download_verified", { version, bytes: receivedBytes, sha256: release.manifest.zipSha256.slice(0, 12) });
    } catch (error) {
      rmSync(directory, { recursive: true, force: true });
      this.database.setSetting(SETTINGS.lastError, asErrorMessage(error));
      this.activity = "error";
      throw error;
    } finally {
      this.downloading = false;
      this.progress = null;
    }
    return this.state();
  }

  async scheduleInstall(version: string, canInstall: () => string | null): Promise<{ scheduled: true }> {
    const blockReason = canInstall();
    if (blockReason) throw new Error(blockReason);
    const release = this.releases.get(version);
    const zipPath = release?.zipPath ?? (this.database.getSetting(SETTINGS.downloadedVersion) === version ? this.database.getSetting(SETTINGS.downloadedPath) : "");
    if (!release || !zipPath || !existsSync(zipPath)) throw new Error("Download this update again before installing it.");
    const actualHash = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
    if (actualHash !== release.manifest.zipSha256.toLowerCase()) throw new Error("The downloaded update no longer matches its signed checksum.");
    if (compareVersions(version, this.currentVersion) < 0) {
      const backupPath = join(this.dataDirectory, "updates", "backups", `bulkimg-studio-before-${this.currentVersion}-${Date.now()}.db`);
      this.database.createUpdateBackup(backupPath);
    }
    const helperPath = join(resolve(zipPath, ".."), "install-update.ps1");
    const helperLogPath = join(resolve(zipPath, ".."), "update-helper.log");
    const helperStartedPath = join(resolve(zipPath, ".."), "update-helper-started");
    const healthPath = join(this.updateDirectory, "health", `${version}.ok`);
    rmSync(healthPath, { force: true });
    rmSync(helperStartedPath, { force: true });
    const fallback = release.manifest.channel === "beta" ? this.stableFallbackFor(release) : null;
    if (release.manifest.channel === "beta" && !fallback) {
      throw new Error("This beta update has no compatible signed Stable recovery release yet.");
    }
    const fallbackZipPath = fallback ? await this.cacheFallback(fallback) : "";
    this.record("update_install_prepared", { version, channel: release.manifest.channel, zipBytes: statSync(zipPath).size, hasFallback: Boolean(fallbackZipPath) });
    const escapedZip = zipPath.replaceAll("'", "''");
    const escapedDirectory = resolve(zipPath, "..").replaceAll("'", "''");
    const escapedLogPath = helperLogPath.replaceAll("'", "''");
    const escapedStartedPath = helperStartedPath.replaceAll("'", "''");
    const escapedHealthPath = healthPath.replaceAll("'", "''");
    const escapedFallbackZipPath = fallbackZipPath.replaceAll("'", "''");
    writeFileSync(helperPath, [
      "$ErrorActionPreference = 'Stop'",
      "$zip = '" + escapedZip + "'",
      "$root = '" + escapedDirectory + "'",
      "$logPath = '" + escapedLogPath + "'",
      "$startedPath = '" + escapedStartedPath + "'",
      "$healthPath = '" + escapedHealthPath + "'",
      "$fallbackZip = '" + escapedFallbackZipPath + "'",
      "function Write-UpdateLog([string]$message) {",
      "  Add-Content -LiteralPath $logPath -Value \"$([DateTime]::UtcNow.ToString('o')) $message\"",
      "}",
      "Set-Content -LiteralPath $startedPath -Value $PID -NoNewline",
      "Write-UpdateLog 'Updater helper started.'",
      "try {",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "function Install-VerifiedArchive([string]$archive, [string]$name) {",
      "  $extract = Join-Path $root (\"installer-\" + $name)",
      "  if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
      "  [System.IO.Compression.ZipFile]::ExtractToDirectory($archive, $extract)",
      "  $installer = Join-Path $extract 'Install-BulkImgStudio.cmd'",
      "  if (-not (Test-Path -LiteralPath $installer)) { throw 'The verified update ZIP does not contain Install-BulkImgStudio.cmd.' }",
      "  $commandProcessor = [Environment]::GetEnvironmentVariable('ComSpec')",
      "  if (-not $commandProcessor -or -not (Test-Path -LiteralPath $commandProcessor)) { throw 'Windows Command Prompt (ComSpec) is unavailable.' }",
      "  Write-UpdateLog (\"Running Install-BulkImgStudio.cmd for \" + $name + \".\")",
      // Invoke Command Prompt directly so PowerShell waits for the installer
      // command, but not for the app process that the installer relaunches.
      // Start-Process -Wait follows that child process tree on Windows, which
      // made the helper wait indefinitely after a successful installation.
      "  & $commandProcessor /d /c $installer",
      "  if ($LASTEXITCODE -ne 0) { throw \"Installer exited with code $LASTEXITCODE.\" }",
      "  Write-UpdateLog (\"Install-BulkImgStudio.cmd completed for \" + $name + \".\")",
      "}",
      "Install-VerifiedArchive $zip 'target'",
      "Write-UpdateLog 'Target installer completed; waiting for app startup health signal.'",
      "for ($attempt = 0; $attempt -lt 60; $attempt++) {",
      "  if (Test-Path -LiteralPath $healthPath) { Write-UpdateLog 'Target app startup confirmed.'; exit 0 }",
      "  Start-Sleep -Milliseconds 500",
      "}",
      "if ($fallbackZip) {",
      "  Write-UpdateLog 'Target did not report healthy startup; installing the cached Stable recovery release.'",
      "  Install-VerifiedArchive $fallbackZip 'stable-recovery'",
      "  Write-UpdateLog 'Stable recovery installer completed.'",
      "  exit 1",
      "}",
      "throw 'Updated app did not report a healthy startup before the timeout.'",
      "} catch {",
      "  Write-UpdateLog (\"Updater helper failed: \" + $_.Exception.Message)",
      "  exit 1",
      "}",
    ].join("\r\n"));
    this.database.setSetting(SETTINGS.previousWorkingVersion, this.currentVersion);
    this.activity = "installing";
    const escapedHelperPath = helperPath.replaceAll("'", "''");
    const launcherCommand = [
      "$helperArguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '" + escapedHelperPath + "')",
      "Start-Process -FilePath 'powershell.exe' -ArgumentList $helperArguments -WorkingDirectory '" + escapedDirectory + "' -WindowStyle Hidden",
    ].join("; ");
    const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", launcherCommand], {
      stdout: "ignore", stderr: "ignore",
    });
    const launcherExitCode = await child.exited;
    if (launcherExitCode !== 0) {
      this.activity = "error";
      this.record("update_helper_start_failed", { version, launcherExitCode });
      throw new Error("Windows could not launch the installer helper. Your verified update is still ready; try Install again.");
    }
    const deadline = Date.now() + 5_000;
    while (!existsSync(helperStartedPath) && Date.now() < deadline) await Bun.sleep(25);
    if (!existsSync(helperStartedPath)) {
      this.activity = "error";
      this.record("update_helper_start_failed", { version, timeoutMs: 5_000 });
      throw new Error("The installer did not start. Your verified update is still ready. Try Install again; if it keeps failing, open Logs and share the updater error.");
    }
    this.record("update_helper_started", { version, launcherPid: child.pid });
    return { scheduled: true };
  }
}
