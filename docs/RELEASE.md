# BulkImg Studio 1.0.0-beta — Release Notes

## Versioning

| Surface | Value |
| --- | --- |
| Package / Electrobun build | `1.0.0-beta` |
| UI / brand display | `1.0.0-beta` |

## Build

```powershell
bun install
bun run check
bun test
bun run build          # stable channel installer
bun run build:canary   # canary channel installer
```

Windows icon for installers/shortcuts is configured in `electrobun.config.ts` as `build.win.icon` → `assets/brand/app_icon.ico`.

## Signing (required for production distribution)

1. Obtain a Windows code-signing certificate (EV preferred for SmartScreen).
2. Sign the built installer and app binaries with `signtool sign` after `bun run build`.
3. Keep certificates out of the repository; use CI secrets or a secure local store.
4. Smoke-test the signed installer on clean Windows 10 and Windows 11 VMs (x64, then ARM64).

Example (local machine with certificate installed):

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a .\path\to\BulkImgStudio-setup.exe
```

## Smoke checklist

- [ ] App launches and shows **BulkImg Studio 1.0.0-beta**
- [ ] CSV import (dropzone + Windows dialog) builds a matrix
- [ ] Manual prompts parse into cards
- [ ] API key add/pause/remove works (DPAPI-wrapped vault key)
- [ ] Direct run saves images to History
- [ ] Batch run polls to completion and saves images
- [ ] Cancel stops an in-flight direct/batch run
- [ ] Retry missing prompts creates a new run
- [ ] Est. cost and session cost show non-zero USD/PKR after FX load
- [ ] Export ZIP contains `images/`, `metadata.csv`, `prompt_mapping.txt`, `README.md`
- [ ] Reference image attach (click / drop / Ctrl+V) uploads once
- [ ] Windows notification appears on completed export/run

## Performance smoke

Record once per release candidate on a quiet Windows machine:

| Metric | Spec target | Measured (fill in) |
| --- | --- | --- |
| Idle working set | < 25 MB | |
| Cold start to first paint | < 50 ms (stretch) | |

Document results in the release PR. Optimize only if measured values are far outside targets.
