# Release Guide

Current version: `1.1.0-beta.2`.

## Build and verify

```powershell
bun run check
bun test
bun run test:ui
bun run build:release
```

The stable package is written to `artifacts/stable-win-x64-BulkImgStudio-Setup.zip`.

## Install or upgrade

Extract the ZIP without separating its contents, then run `Install-BulkImgStudio.cmd`. It stops the existing stable app, starts the setup executable, confirms the expected installed version, and starts the installed launcher. It does not wait on the setup process itself, because Windows can treat the running app as that process's descendant.

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
