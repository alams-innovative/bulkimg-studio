# BulkImg Studio Agent Guide

## Read first

Before changing code, read the files that own the affected behavior and their direct contracts, tests, and documentation. Do not guess from a filename alone.

- UI: `src/mainview/index.html`, `src/mainview/index.css`, `src/mainview/index.ts`
- Main process and RPC: `src/bun/index.ts`, `src/shared/contracts.ts`
- Persistence: `src/bun/database.ts`
- Generation and recovery: `src/bun/services/batch-engine.ts`, `src/bun/services/openai-client.ts`
- Conversion, history, exports, and keys: the matching files in `src/bun/services/`
- Build and installation: `electrobun.config.ts`, `scripts/finalize-windows-build.ts`, `scripts/install-and-launch.ts`

Read the relevant existing tests before altering behavior. Keep the WebView-to-Bun boundary typed through `src/shared/contracts.ts`; never expose API keys or filesystem access to the WebView.

## Working rules

- Preserve existing behavior unless the user explicitly asks to change it.
- Keep changes scoped. Do not perform framework migrations or unrelated redesigns.
- Use the existing Windows-first Electrobun and Bun stack; do not add dependencies without a concrete need.
- Store OpenAI keys only through the encrypted local vault. Never put them in `.env`, UI state, logs, tests, or documentation.
- Treat generated installers as a complete package: the setup executable requires its adjacent `.installer/` directory.
- Keep version surfaces aligned: `package.json`, `electrobun.config.ts`, `assets/brand/theme.json`, and release documentation.

## Required QA after changes

First read the files changed and their direct callers/consumers. Then run the smallest relevant checks, followed by the full release checks for any production-impacting change:

```powershell
bun run check
bun test
bun run test:ui
bun run build:release
```

`bun run test:ui` is the complete browser regression suite. It uses two safe,
isolated workers and includes functional, accessibility, keyboard, browser-error,
visual, desktop, and laptop coverage.

If a command cannot run, report the exact blocker and do not claim it passed. For UI work, also inspect the affected screen and keep the Playwright coverage current. For build/install work, verify the produced ZIP contains `Install-BulkImgStudio.cmd` and `.installer/`.

## Stable / production app requests

When the user asks to open the stable or production app, run this release path in order:

```powershell
bun run build:release
bun run install:stable
```

`install:stable` installs the stable build and launches it. Do not substitute `open:stable` unless the user specifically asks to open an already-installed copy without rebuilding.

## Update-system direction

The current installer can replace an existing local installation, but the app has no release discovery or download capability. Follow `docs/UPDATE_SYSTEM_PLAN.md` for updater work. Do not add an updater that executes downloaded files without a signed versioned manifest, SHA-256 verification, user confirmation, and a separate helper process.

When the user asks to add, continue, or change app updates, first read that plan together with the installer scripts and the typed RPC contracts. Be explicit that an installed build cannot yet self-update until the planned implementation is complete.
