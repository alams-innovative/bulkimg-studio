# Release Guide

Current version: `1.0.8`.

## Build and verify

```powershell
bun run check
bun test
bun run test:ui
bun run build:release
```

The stable package is written to `artifacts/stable-win-x64-BulkImgStudio-Setup.zip`.

## Install or upgrade

Extract the ZIP without separating its contents, then run `Install-BulkImgStudio.cmd`. It stops the existing stable app, runs the setup executable, waits for installation, and starts the installed launcher.

For local release verification:

```powershell
bun run install:stable
```

Use `bun run open:stable` only to open an already-installed app without rebuilding or reinstalling.

## Release gate

- All four build/QA commands pass.
- ZIP contains `Install-BulkImgStudio.cmd` and `.installer/`.
- Clean install and upgrade both launch successfully on Windows.
- Smoke-test prompt import, direct and batch generation, history, conversion, export, and encrypted API-key management.
- Confirm package, Electrobun, brand, and release versions match.

Installers are currently unsigned, so Windows may show an unknown-publisher or SmartScreen warning.
