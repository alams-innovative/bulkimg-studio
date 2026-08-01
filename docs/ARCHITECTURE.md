# Architecture

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

## Production milestones

1. Persist base64/direct results and ingest completed Batch API output files into `generated_assets`.
2. Implement reference-image upload once per session and use the image-edit batch route when a reference is attached.
3. Replace the portable AES-GCM vault with a Windows DPAPI/Credential Manager adapter while retaining the current interface.
4. Add model-versioned pricing configuration and reconcile token/image usage from API responses.
5. Add native save/open dialogs, Windows notifications, cancellation, retry queues, and crash recovery.
6. Add signed x64 and ARM64 release targets, a branded `.ico`, update hosting, and installer smoke tests.

## API compatibility notes

The batch JSONL supports any positive number of prompts, including one. The server submission uses `completion_window: "24h"` and `/v1/images/generations`, both supported by the current OpenAI Batch API. Legacy DALL-E entries remain visible but disabled because they are deprecated; enable them only after explicitly accepting their compatibility and pricing constraints.
