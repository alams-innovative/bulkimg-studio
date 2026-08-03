# BulkImg Studio

BulkImg Studio 1.0.0-beta is a Windows-first Electrobun application for preparing and submitting high-volume AI image generation runs from weekly CSV calendars or manual prompts.

## What is included

- Electrobun 1.18.1 with Bun 1.3.14 and the Windows system WebView (`bundleCEF: false`)
- Liquid Glass Dark desktop interface with configuration-driven branding
- CSV calendar parsing, manual prompt parsing, disabled-cell detection, and granular prompt selection
- Typed WebView-to-Bun RPC contracts
- `bun:sqlite` schema for keys, sessions, prompts, generated assets, and FX caching
- AES-GCM encrypted local API-key vault with round-robin selection and HTTP 429 cooldown
- OpenAI direct image generation and `/v1/batches` JSONL submission using `/v1/images/generations`
- USD/PKR exchange-rate caching with a one-hour TTL and a configured fallback
- Session telemetry and structured ZIP manifest export
- Type checks and unit tests for prompt parsing and one-item image batches

## Requirements

- Windows 10 or Windows 11, x64 or ARM64
- Bun 1.3.14 or newer. On CPUs without AVX2, install the official baseline build:

  ```powershell
  winget install --id Oven-sh.Bun.Baseline --exact
  ```

- Microsoft Edge WebView2 Runtime (normally included with supported Windows versions)

## Development

```powershell
bun install
bun run check
bun test
bun run dev
```

Create a stable Windows installer with:

```powershell
bun run build
```

## Security and configuration

Do not place OpenAI keys in `.env`. Add keys through the app so they are encrypted by the Bun process and never returned to the webview. The device encryption key and SQLite database live in Electrobun's per-user application-data directory.

Brand text, colors, and asset paths are in `assets/brand/theme.json`; the model registry is in `assets/config/models.json`. Replace the SVG logo and add a production `assets/brand/app_icon.ico` before a signed release.

## Documentation

- `docs/SYSTEM_SPECIFICATION.md` — full product/spec target
- `docs/ARCHITECTURE.md` — process boundary and source map
- `docs/RELEASE.md` — 1.0.0-beta build, signing, and smoke checklist

Brand assets live in `assets/brand/` (`theme.json`, `logo.svg`, `app_icon.ico`). Model and pricing registries are in `assets/config/`.
