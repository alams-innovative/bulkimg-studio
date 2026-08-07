# BulkImg Studio 1.0.5 — Release Notes

## Versioning

| Surface | Value |
| --- | --- |
| Package / Electrobun build | `1.0.5` |
| UI / brand display | `1.0.5` |

## Build

```powershell
bun install
bun run check
bun test
bun run build          # stable channel package
bun run build:canary   # canary channel package
```

Windows icon for installers/shortcuts is configured in `electrobun.config.ts` as `build.win.icon` → `assets/brand/app_icon.ico`.

## Distribution

Signing is intentionally not part of this release flow. Windows may show an unknown-publisher or
SmartScreen warning for the unsigned package.

Distribute the generated package:

```powershell
Expand-Archive .\artifacts\stable-win-x64-BulkImgStudio-Setup.zip -DestinationPath .\BulkImgStudio-Setup
Start-Process .\BulkImgStudio-Setup\Install-BulkImgStudio.cmd
```

`Install-BulkImgStudio.cmd` runs the setup executable, waits for installation to complete, and starts the
installed launcher. It also stops an existing BulkImg Studio process first, so the same flow works for
upgrades. Run the `*-Setup.exe` directly for install-only behavior. Keep the `.installer` folder beside
the setup executable; it contains the metadata and compressed application payload required by the
Electrobun installer, so the setup executable must not be distributed by itself. Future launches use the
Start menu entry. For local build verification, `bun run install:stable` installs the current stable
build and starts the installed launcher, while `bun run open:stable` only opens an already-installed copy.

## Smoke checklist

- [ ] App launches and shows **BulkImg Studio 1.0.5**
- [ ] Setup ZIP contains `Install-BulkImgStudio.cmd`, its PowerShell helper, `INSTALL.txt`, and `.installer/`
- [ ] Setup installs without Bun present on a clean Windows machine
- [ ] Install-BulkImgStudio.cmd starts the app after a clean install
- [ ] Install-BulkImgStudio.cmd stops the old app and completes an upgrade
- [ ] Setup creates a Start-menu entry
- [ ] Local install-and-launch starts the installed app
- [ ] Stable and canary installs remain in separate app-data paths
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
