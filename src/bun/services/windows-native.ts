import { mkdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

function powershell(script: string): Promise<{ stdout: string; exitCode: number; stderr: string }> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  // -STA is required for System.Windows.Forms.Clipboard (and open/save dialogs).
  const proc = Bun.spawn([
    "powershell.exe",
    "-STA",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded,
  ], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, exitCode]) => ({
    stdout: stdout.replace(/^\uFEFF/, "").trim(),
    stderr: stderr.trim(),
    exitCode,
  }));
}

export async function pickOpenFile(options: {
  title: string;
  filter: string;
  filterLabel: string;
}): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = ${JSON.stringify(options.title)}
$dialog.Filter = ${JSON.stringify(`${options.filterLabel}|${options.filter}`)}
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;
  const result = await powershell(script);
  return result.exitCode === 0 && result.stdout ? result.stdout.split(/\r?\n/)[0] ?? null : null;
}

export async function pickOpenFiles(options: {
  title: string;
  filter: string;
  filterLabel: string;
}): Promise<string[]> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = ${JSON.stringify(options.title)}
$dialog.Filter = ${JSON.stringify(`${options.filterLabel}|${options.filter}`)}
$dialog.Multiselect = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  $dialog.FileNames | ForEach-Object { Write-Output $_ }
}
`;
  const result = await powershell(script);
  return result.exitCode === 0 && result.stdout
    ? result.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean)
    : [];
}

export async function pickFolder(title: string): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = ${JSON.stringify(title)}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
  const result = await powershell(script);
  return result.exitCode === 0 && result.stdout ? result.stdout.split(/\r?\n/)[0] ?? null : null;
}

export async function copyImageToClipboard(filePath: string): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile(${JSON.stringify(filePath)})
try { [System.Windows.Forms.Clipboard]::SetImage($image) } finally { $image.Dispose() }
`;
  const result = await powershell(script);
  if (result.exitCode !== 0) throw new Error(result.stderr || "Could not copy image to the Windows clipboard.");
}

export async function copyFilesToClipboard(filePaths: string[]): Promise<void> {
  if (!filePaths.length) throw new Error("Choose at least one converted image to copy.");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object System.Collections.Specialized.StringCollection
${filePaths.map((filePath) => `$files.Add(${JSON.stringify(filePath)}) | Out-Null`).join("\n")}
[System.Windows.Forms.Clipboard]::SetFileDropList($files)
`;
  const result = await powershell(script);
  if (result.exitCode !== 0) throw new Error(result.stderr || "Could not copy files to the Windows clipboard.");
}

export async function pickSaveFile(options: {
  title: string;
  defaultName: string;
  filter: string;
  filterLabel: string;
}): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = ${JSON.stringify(options.title)}
$dialog.FileName = ${JSON.stringify(options.defaultName)}
$dialog.Filter = ${JSON.stringify(`${options.filterLabel}|${options.filter}`)}
$dialog.AddExtension = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;
  const result = await powershell(script);
  return result.exitCode === 0 && result.stdout ? result.stdout.split(/\r?\n/)[0] ?? null : null;
}

export async function showNotification(title: string, body: string): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Visible = $true
$notify.BalloonTipTitle = ${JSON.stringify(title)}
$notify.BalloonTipText = ${JSON.stringify(body)}
$notify.ShowBalloonTip(4000)
Start-Sleep -Milliseconds 4500
$notify.Dispose()
`;
  await powershell(script);
}

export type ClipboardCsvResult = {
  text: string | null;
  sourceName: string | null;
  error: string | null;
};

export type ClipboardImageResult = {
  images: Array<{ filename: string; mimeType: string; dataBase64: string }>;
  error: string | null;
};

/** Read Windows clipboard text/CSV via Win32 OpenClipboard (retries). Never uses browser clipboard APIs. */
export async function readClipboardCsv(): Promise<ClipboardCsvResult> {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class BulkimgClip {
  [DllImport("user32.dll", SetLastError=true)] static extern bool OpenClipboard(IntPtr hWndNewOwner);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseClipboard();
  [DllImport("user32.dll", SetLastError=true)] static extern bool IsClipboardFormatAvailable(uint format);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr GetClipboardData(uint uFormat);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr GlobalLock(IntPtr hMem);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GlobalUnlock(IntPtr hMem);
  const uint CF_UNICODETEXT = 13;
  public static string GetUnicodeText() {
    for (int attempt = 0; attempt < 15; attempt++) {
      if (!OpenClipboard(IntPtr.Zero)) {
        System.Threading.Thread.Sleep(40 + attempt * 15);
        continue;
      }
      try {
        if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) return "";
        IntPtr handle = GetClipboardData(CF_UNICODETEXT);
        if (handle == IntPtr.Zero) return "";
        IntPtr pointer = GlobalLock(handle);
        if (pointer == IntPtr.Zero) return "";
        try { return Marshal.PtrToStringUni(pointer) ?? ""; }
        finally { GlobalUnlock(handle); }
      } finally { CloseClipboard(); }
    }
    throw new Exception("Clipboard is locked by another program. Close other clipboard tools and try again.");
  }
}
"@
try {
  try {
    $files = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue
    if ($files) {
      foreach ($f in @($files)) {
        $path = [string]$f
        if ($path -and $path.ToLower().EndsWith('.csv') -and (Test-Path -LiteralPath $path)) {
          $info = Get-Item -LiteralPath $path
          if ($info.Length -le 0) { continue }
          if ($info.Length -gt 10MB) {
            Write-Output "ERROR|CSV file is larger than 10 MB."
            exit 1
          }
          $text = [System.IO.File]::ReadAllText($path)
          $name = [System.IO.Path]::GetFileName($path)
          Write-Output ("FILE|" + $name)
          Write-Output $text
          exit 0
        }
      }
    }
  } catch {}

  $asString = [BulkimgClip]::GetUnicodeText()
  if (-not $asString) {
    try {
      $fallback = Get-Clipboard -Raw -ErrorAction SilentlyContinue
      if ($fallback -is [System.Array]) { $fallback = ($fallback | ForEach-Object { "$_" }) -join [Environment]::NewLine }
      $asString = [string]$fallback
    } catch {}
  }
  if ($asString -and $asString.Trim().Length -gt 0) {
    Write-Output "TEXT|clipboard.csv"
    Write-Output $asString
    exit 0
  }
  Write-Output "EMPTY|"
  exit 2
} catch {
  Write-Output ("ERROR|" + $_.Exception.Message)
  exit 1
}
`;
  let result = await powershell(script);
  if (
    result.exitCode !== 0
    && !result.stdout.startsWith("TEXT|")
    && !result.stdout.startsWith("FILE|")
    && !result.stdout.startsWith("EMPTY|")
  ) {
    await new Promise((r) => setTimeout(r, 150));
    result = await powershell(script);
  }
  const lines = result.stdout.split(/\r?\n/);
  const header = lines[0] ?? "";
  const body = lines.slice(1).join("\n");

  if (header.startsWith("ERROR|")) {
    return {
      text: null,
      sourceName: null,
      error: `Could not read clipboard: ${header.slice(6) || "unknown"}`,
    };
  }
  if (header.startsWith("EMPTY|") || result.exitCode === 2) {
    return {
      text: null,
      sourceName: null,
      error: "Clipboard has no CSV text or .csv file. Copy spreadsheet cells or a CSV file first.",
    };
  }
  if (header.startsWith("FILE|") || header.startsWith("TEXT|")) {
    const sourceName = header.split("|")[1] || "clipboard.csv";
    if (!body.trim()) {
      return { text: null, sourceName: null, error: "Clipboard text is empty." };
    }
    return { text: body, sourceName, error: null };
  }
  if (result.stdout.trim()) {
    return { text: result.stdout, sourceName: "clipboard.csv", error: null };
  }
  const detail = (result.stderr || "").slice(0, 160);
  return {
    text: null,
    sourceName: null,
    error: `Could not read clipboard (exit ${result.exitCode})${detail ? `: ${detail}` : "."}`,
  };
}

/** Read Windows clipboard images / image files and return base64 PNG/JPEG/WebP payloads. */
export async function readClipboardImages(maxCount = 16): Promise<ClipboardImageResult> {
  const outDir = join(tmpdir(), `bulkimg-clip-${crypto.randomUUID()}`);
  mkdirSync(outDir, { recursive: true });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$outDir = ${JSON.stringify(outDir)}
$max = ${Math.max(1, Math.min(16, maxCount))}
$written = New-Object System.Collections.Generic.List[string]
try {
  if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
    $files = @([System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { "$_" })
    foreach ($f in $files) {
      if ($written.Count -ge $max) { break }
      if (-not (Test-Path -LiteralPath $f)) { continue }
      $ext = [System.IO.Path]::GetExtension($f).ToLowerInvariant()
      if ($ext -notin @('.png','.jpg','.jpeg','.webp')) { continue }
      $info = Get-Item -LiteralPath $f
      if ($info.Length -le 0) { continue }
      $dest = Join-Path $outDir ([System.IO.Path]::GetFileName($f))
      Copy-Item -LiteralPath $f -Destination $dest -Force
      $written.Add($dest) | Out-Null
    }
  }
  if ($written.Count -eq 0 -and [System.Windows.Forms.Clipboard]::ContainsImage()) {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -ne $img) {
      $dest = Join-Path $outDir ("clipboard-" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".png")
      $img.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
      $img.Dispose()
      if ((Test-Path -LiteralPath $dest) -and ((Get-Item -LiteralPath $dest).Length -gt 0)) {
        $written.Add($dest) | Out-Null
      }
    }
  }
  if ($written.Count -eq 0) {
    Write-Output "EMPTY"
    exit 2
  }
  foreach ($path in $written) { Write-Output $path }
  exit 0
} catch {
  Write-Output ("ERROR|" + $_.Exception.Message)
  exit 1
}
`;
  const cleanup = (paths: string[]) => {
    for (const path of paths) {
      try { unlinkSync(path); } catch { /* ignore */ }
    }
    try { rmdirSync(outDir); } catch { /* ignore */ }
  };

  try {
    const result = await powershell(script);
    if (result.stdout.startsWith("ERROR|")) {
      cleanup([]);
      return { images: [], error: result.stdout.slice(6) || "Could not read image from clipboard." };
    }
    if (result.exitCode === 2 || result.stdout.startsWith("EMPTY")) {
      cleanup([]);
      return {
        images: [],
        error: "Clipboard has no image. Copy a PNG/JPEG/WebP (or image files in Explorer), then click Paste again.",
      };
    }
    const paths = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .filter((line) => !line.startsWith("ERROR") && line !== "EMPTY");
    const images: ClipboardImageResult["images"] = [];
    for (const path of paths) {
      try {
        const file = Bun.file(path);
        const size = file.size;
        if (!size || size <= 0) continue;
        if (size > 50 * 1024 * 1024) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength === 0) continue;
        const lower = path.toLowerCase();
        const mimeType = lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            ? "image/jpeg"
            : "image/png";
        const filename = path.split(/[/\\]/).pop() || "clipboard.png";
        images.push({
          filename,
          mimeType,
          dataBase64: Buffer.from(bytes).toString("base64"),
        });
      } catch {
        // skip bad file
      }
    }
    cleanup(paths);
    if (!images.length) {
      return {
        images: [],
        error: "Clipboard image was empty or unsupported. Copy a real PNG/JPEG/WebP and try again.",
      };
    }
    return { images, error: null };
  } catch (error) {
    cleanup([]);
    return {
      images: [],
      error: error instanceof Error ? error.message : "Could not read Windows clipboard image.",
    };
  }
}

export async function protectWithDpapi(plain: Uint8Array): Promise<Uint8Array> {
  const input = join(tmpdir(), `bulkimg-dpapi-in-${crypto.randomUUID()}.bin`);
  const output = join(tmpdir(), `bulkimg-dpapi-out-${crypto.randomUUID()}.bin`);
  await Bun.write(input, plain);
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes(${JSON.stringify(input)})
$protected = [System.Security.Cryptography.ProtectedData]::Protect(
  $bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes(${JSON.stringify(output)}, $protected)
`;
  const result = await powershell(script);
  try {
    if (result.exitCode !== 0) throw new Error("DPAPI protect failed");
    return new Uint8Array(await Bun.file(output).arrayBuffer());
  } finally {
    try { unlinkSync(input); } catch { /* ignore */ }
    try { unlinkSync(output); } catch { /* ignore */ }
  }
}

export async function unprotectWithDpapi(cipher: Uint8Array): Promise<Uint8Array> {
  const input = join(tmpdir(), `bulkimg-dpapi-in-${crypto.randomUUID()}.bin`);
  const output = join(tmpdir(), `bulkimg-dpapi-out-${crypto.randomUUID()}.bin`);
  await Bun.write(input, cipher);
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [System.IO.File]::ReadAllBytes(${JSON.stringify(input)})
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes(${JSON.stringify(output)}, $plain)
`;
  const result = await powershell(script);
  try {
    if (result.exitCode !== 0) throw new Error("DPAPI unprotect failed");
    return new Uint8Array(await Bun.file(output).arrayBuffer());
  } finally {
    try { unlinkSync(input); } catch { /* ignore */ }
    try { unlinkSync(output); } catch { /* ignore */ }
  }
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
