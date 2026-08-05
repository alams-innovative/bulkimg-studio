# Architecture

Current product stage: **BulkImg Studio 1.0.3**.

## Process boundary

The WebView owns presentation and local selection state. It receives only safe configuration, prompt matrices, telemetry, and API-key labels. File access, SQLite, encryption, external API calls, FX lookup, and ZIP creation remain in the Bun main process.

```text
Windows WebView2 UI
  -> typed Electrobun RPC
  -> Bun main process
       -> prompt parser
       -> AES-GCM key vault
       -> key rotation / batch engine
       -> OpenAI Images + Batches APIs
       -> bun:sqlite
       -> FX cache
       -> ZIP exporter
```

## Source map

| Area | Path |
| --- | --- |
| Shared RPC and data contracts | `src/shared/contracts.ts` |
| Main-process composition | `src/bun/index.ts` |
| SQLite migrations/repository | `src/bun/database.ts` |
| API key encryption | `src/bun/services/key-vault.ts` |
| CSV and manual parsing | `src/bun/services/prompt-parser.ts` |
| OpenAI HTTP boundary and JSONL | `src/bun/services/openai-client.ts` |
| Key rotation and session orchestration | `src/bun/services/batch-engine.ts` |
| USD/PKR caching | `src/bun/services/fx-service.ts` |
| ZIP manifests | `src/bun/services/export-service.ts` |
| WebView UI | `src/mainview/` |

## Production milestones (1.0.0-beta status)

1. Persist base64/direct results and ingest completed Batch API output files into `generated_assets` — **done**; export ZIP includes images.
2. Reference-image upload once per session + image-edit routing — **done** (UI dock + `/v1/files` cache + edits endpoint).
3. Windows DPAPI wrapper for the device key (AES-GCM payloads unchanged) — **done** via `.key-vault.dpapi`.
4. Model-versioned pricing (`assets/config/pricing.json`) + USD/PKR estimates — **done**.
5. Native open/save dialogs, Windows balloon notifications, cancel/retry, crash recovery — **done**.
6. Branded `.ico` + build wiring — **done**; signed x64/ARM64 distribution still requires a code-signing cert (see `docs/RELEASE.md`).

## API compatibility notes

The batch JSONL supports any positive number of prompts, including one. The server submission uses `completion_window: "24h"` and `/v1/images/generations`, both supported by the current OpenAI Batch API. Legacy DALL-E entries remain visible but disabled because they are deprecated; enable them only after explicitly accepting their compatibility and pricing constraints.
