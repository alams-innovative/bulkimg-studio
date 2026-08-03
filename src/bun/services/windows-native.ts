import { mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

function powershell(script: string): Promise<{ stdout: string; exitCode: number }> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const proc = Bun.spawn([
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded,
  ], { stdout: "pipe", stderr: "pipe" });
  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, , exitCode]) => ({ stdout: stdout.trim(), exitCode }));
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
