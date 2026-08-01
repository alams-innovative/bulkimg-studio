# BulkImg Studio - System Architecture & Development Specification

**Target Version:** 1.0.0 beta  

**Target OS:** Windows 10 & Windows 11 (x64 / ARM64)  
**Framework:** Electrobun (Bun Native Process + Windows Native WebView2)  
**Primary AI Model:** OpenAI GPT-Image-2

---

## 1. PROJECT OVERVIEW

BulkImg Studio is an enterprise-grade, high-throughput Windows desktop application designed for batch generating AI images from CSV schedules or manual prompt input.

### Key Architectural Highlights

- **Framework:** Electrobun (Bun JavaScript runtime + Windows WebView2 native shell).
- **Memory & Performance Target:** < 25 MB RAM on idle, < 50 ms startup latency.
- **Async Batch Execution:** Prominently uses OpenAI's Batch API (`/v1/batches`) to provide 50% cost reductions, supported even for single-prompt runs.
- **Dynamic Branding:** Logos, app titles, window icons, and primary theme colors are dynamically loaded from external configuration files (`/assets/brand/theme.json`).
- **Dual Currency Tracking:** Live telemetry tracking time elapsed, token usage, and costs in both USD ($) and PKR (Rs.).

---

## 2. OS & RUNTIME CONSTRAINTS

- **Platform Constraint:** WINDOWS 10 / WINDOWS 11 ONLY. Do not write Linux/macOS specific code, scripts, or path handlers.
- **Windows Webview:** Uses Windows WebView2. Web context uses standard web APIs, CSS backdrops, and modern ESM bundle targets.
- **Main Process:** Bun runtime. Local database engine is `bun:sqlite`. File operations use native Bun streaming APIs (`Bun.file`, `Bun.write`).
- **Versioning Standard:** Strict Semantic Versioning MAJOR.MINOR.PATCH with an optional prerelease label. Build/package version uses `1.0.0-beta.0`; UI display uses `1.0.0 beta`. Do not use floating tags like `latest` in release targets.

---

## 3. CORE FEATURES & IMPLEMENTATION LOGIC

### 3.1 DYNAMIC BRANDING ENGINE

Brand configuration file located at `/assets/brand/theme.json`:

```json
{
  "appName": "BulkImg Studio",
  "version": "1.0.0 beta",
  "logoPath": "/assets/brand/logo.svg",
  "iconPath": "/assets/brand/app_icon.ico",
  "accentColor": "#38bdf8",
  "accentSecondary": "#34d399",
  "themeMode": "liquid-glass-dark"
}
```

- UI reads CSS variables injected dynamically at startup (`var(--brand-primary)`).
- Windows `.exe` build step injects `app_icon.ico` from the brand folder.

### 3.2 FLEXIBLE PROMPT ENTRY MODES

**a) Visual CSV Matrix Importer**

- Parses multi-column weekly social media calendar spreadsheets.
- Converts columns (e.g., Week #, Wednesday | Technology, Friday | Leadership) into an interactive card matrix.
- Auto-filters non-prompt cells (e.g., "NO IMAGE — Outside period").
- Granular Selection: User can select 1 prompt, 2 prompts, an entire week row, a theme column, or the whole matrix.
- Provides quick-selection action buttons: "Pick First 1", "Pick First 2".

**b) Direct Manual Prompt Pad**

- Text area for pasting or typing single/multiple prompts directly without loading a CSV file.

### 3.3 MODEL GENERATOR SELECTOR ARCHITECTURE

Modular configuration driven by `/assets/config/models.json`:

- **GPT-Image-2 (Default)**
  - Max Resolution: 2048x2048
  - Supported Ratios: 1:1, 4:5, 16:9, 9:16
  - Features: Ultra-high photorealism, exact prompt adherence, identity continuity.
- **DALL-E 3 (Optional)**
  - Max Resolution: 1024x1792
  - Features: Stylized art, graphic designs.
- **DALL-E 2 (Optional Legacy)**
  - Max Resolution: 1024x1024
  - Features: Low-cost rapid prototyping.

### 3.4 BATCH ASYNC ENGINE & SINGLE-PROMPT SUPPORT

**Supported Modes:**

1. **Batch Async API (Recommended / Default):** Submits requests to OpenAI `/v1/batches` for a 50% API price discount. WORKS FOR ANY COUNT (1 prompt, 2 prompts, or 1000 prompts).
2. **Standard Direct API:** Real-time generation for instant single-image testing.

**Global Reference Image Docking:**

- Drag-and-drop or clipboard paste (`Ctrl+V`) for identity/reference photos.
- Image is uploaded ONCE to OpenAI `/v1/files`.
- The returned `file_id` is cached and attached across batch requests to drastically reduce input token payload costs.

### 3.5 MULTI-KEY ROTATION POOL

- Encrypted key management stored in `bun:sqlite`.
- Distributes batch workload round-robin across active API keys.
- Automatic failover and rotation if an `HTTP 429 Rate Limit` is encountered.

### 3.6 EXPORT & ZIP PACKAGING ENGINE

When exporting a session, the Bun backend compresses outputs into a clean `.zip` archive structured as follows:

```text
BulkImg_Export_[TIMESTAMP]/
├── images/
│   ├── 01_[DATE]_[THEME_SLUG].png
│   └── ...
├── metadata.csv
├── prompt_mapping.txt
└── README.md
```

**Contents of Archive Files:**

- **`prompt_mapping.txt`:** Human-readable text manifest linking each image filename to its exact full prompt, scheduled date, seed value, API key used, and week/theme column.
- **`metadata.csv`:** Structured CSV dataset tracking Image_Filename, Week, Schedule_Date, Theme_Column, Prompt_Text, Model_Used, Seed, Input_Tokens, Output_Tokens, Cost_USD, Cost_PKR.
- **`README.md`:** Markdown summary detailing export date, total image count, file index, and total session execution expenses.

### 3.7 REAL-TIME TELEMETRY & DUAL CURRENCY TRACKER

- **Live Session Stopwatch:** Tracks real-time batch execution duration.
- **Token Counter:** Tracks cumulative Input Tokens and Output Tokens.
- **Dual Currency Conversion Engine:**
  - Calculates API costs in parallel: USD ($) and PKR (Rs.).
  - Primary API: Queries `https://open.er-api.com/v6/latest/USD`.
  - Fallback API: Web search query for "USD to PKR exchange rate" (~276.61 PKR/USD).
  - Caches rate in `bun:sqlite` with a 1-hour Time-To-Live (TTL).

---

## 4. DATA STRUCTURES & SCHEMAS

### 4.1 SQLite Database Schema (`bun:sqlite`)

```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_value TEXT NOT NULL,
    label TEXT,
    is_active INTEGER DEFAULT 1,
    rate_limited_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_sessions (
    session_id TEXT PRIMARY KEY,
    model_used TEXT NOT NULL,
    total_prompts INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    cost_pkr REAL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS generated_assets (
    asset_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    image_filename TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    schedule_date TEXT,
    theme_column TEXT,
    seed_value TEXT,
    key_used_id TEXT,
    file_path TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES batch_sessions(session_id)
);

CREATE TABLE IF NOT EXISTS fx_cache (
    currency_pair TEXT PRIMARY KEY, -- e.g., 'USD_PKR'
    exchange_rate REAL NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 IPC RPC Communication Protocol

Typed postMessage bridge between WebView2 UI and Bun Main Process:

**Types of IPC Messages:**

- `importCSV(filePath)` → Returns parsed matrix with auto-disabled cells filtered.
- `submitBatchRun(payload)` → Payload: `{ prompts: [...], model: 'gpt-image-2', isBatch: true, referenceImageFileId: '...' }`
- `pollBatchStatus(sessionId)` → Returns live duration, completed count, input/output tokens, costs (USD/PKR).
- `exportSessionZip(sessionId)` → Generates structured ZIP package on Windows file system.

---

## 5. DESIGN SYSTEM & UI TOKENS (Liquid Glass Dark)

- **Background:** Translucent dark overlays `rgba(15, 23, 42, 0.75)` with `backdrop-filter: blur(24px)`.
- **Borders:** Specular highlight borders `1px solid rgba(255, 255, 255, 0.15)`.
- **Interactive Cards:** Glass cards for CSV prompt matrix with state-dependent border colors:
  - **Selected:** Emerald glow (`rgba(52, 211, 153, 0.8)`)
  - **Muted/Unselected:** Slate border (`rgba(148, 163, 184, 0.2)`)
  - **Auto-Disabled:** Gray hatch pattern with strikethrough text (`rgba(239, 68, 68, 0.2)`).

---

*End of System Specification*
