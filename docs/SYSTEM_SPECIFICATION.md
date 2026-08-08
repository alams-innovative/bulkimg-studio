# System Specification

BulkImg Studio is a Windows-first Electrobun desktop app for preparing high-volume AI image runs from CSV calendars or manual prompts.

## Product boundaries

- The WebView owns presentation, local selection, and safe status display.
- The Bun process owns SQLite, encrypted API keys, file access, OpenAI calls, FX lookup, generation recovery, conversion, and ZIP export.
- API keys are encrypted locally and never returned to the WebView.
- Generation supports direct and Batch API runs, guided waves, retry, cancellation, and restart recovery.
- Generated images, run metadata, converter jobs, and exports stay local to the device.

## Source of truth

| Concern | Source |
| --- | --- |
| Typed RPC and data models | `src/shared/contracts.ts` |
| Application composition and RPC handlers | `src/bun/index.ts` |
| SQLite schema and local persistence | `src/bun/database.ts` |
| Run orchestration | `src/bun/services/batch-engine.ts` |
| OpenAI boundary | `src/bun/services/openai-client.ts` |
| WebView UI | `src/mainview/` |
| Branding and model configuration | `assets/brand/theme.json`, `assets/config/` |

## Operational requirements

- Windows 10/11 with WebView2; Bun is required only for development/building.
- Versions use semantic versioning and must match package, build, and brand configuration.
- Stable and beta installs use separate local app-data paths.
- The complete installer ZIP, not the setup executable alone, is the distributable release unit.

See `ARCHITECTURE.md` for the process boundary, `RELEASE.md` for the release checklist, and `UPDATE_SYSTEM_PLAN.md` for planned self-updating.
