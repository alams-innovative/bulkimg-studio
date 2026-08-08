import { extname, join, resolve } from "node:path";
import { parseCSV } from "../src/bun/services/prompt-parser";
import { APP_LIMITS } from "../src/shared/contracts";

const root = resolve(import.meta.dir, "..");
const build = await Bun.build({ entrypoints: [join(root, "src", "mainview", "index.ts")], target: "browser", write: false, minify: false });
if (!build.success || !build.outputs[0]) throw new Error("Could not build UI harness bundle.");
const bundle = await build.outputs[0].text();

const promptMatrix = (text: string) => {
  const prompts = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const cells = prompts.map((promptText, index) => ({ id: `p-${index}`, promptText, week: "Manual", weekStartDate: "", dayLabel: "Manual", scheduleDate: "", themeColumn: "Manual", disabled: false }));
  return { sourceName: "Manual prompts", columns: ["Prompt"], warnings: [], cells, groups: cells.length ? [{ id: "manual", label: "Manual prompts", startDate: "", cellIds: cells.map((cell) => cell.id) }] : [] };
};

const clipboardPixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const telemetryBase = {
  sessionId: "session-test",
  status: "processing" as const,
  totalPrompts: 1,
  completedCount: 0,
  elapsedMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  costPkr: 0,
  fxRate: 278,
  message: "Queued",
  runMode: "direct" as const,
  format: "square" as const,
  quality: "medium" as const,
  retryableCount: 0,
  diagnosticId: "BIS-test",
  lastError: null,
  nextPollAt: null,
  parentRunId: null,
  waveIndex: null,
  waveCount: null,
  estimateUsd: 0.05,
  etaMs: 12_000,
  phase: "generating" as const,
};

type HarnessState = {
  guidedWaveStarted: boolean;
  guidedWaveCancelled: boolean;
  updateChannel: "stable" | "beta";
  downloadedUpdateVersion: string | null;
};

const harnessStates = new Map<string, HarnessState>();

function stateFor(request?: Request): HarnessState {
  const referer = request?.headers.get("referer") ?? "";
  const id = new URL(referer || "http://127.0.0.1/").searchParams.get("test-run") ?? "default";
  const existing = harnessStates.get(id);
  if (existing) return existing;
  const state: HarnessState = { guidedWaveStarted: false, guidedWaveCancelled: false, updateChannel: "stable", downloadedUpdateVersion: null };
  harnessStates.set(id, state);
  return state;
}
const updateReleases = [
  { version: "1.0.8", tag: "v1.0.8", channel: "stable", publishedAt: "2026-08-08T00:00:00.000Z", releaseNotesUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/tag/v1.0.8", minimumSupportedVersion: "1.0.0", architectures: ["x64"], schemaVersion: 7, available: true, unavailableReason: null, isCurrent: false },
  { version: "1.0.5", tag: "v1.0.5", channel: "stable", publishedAt: "2026-08-01T00:00:00.000Z", releaseNotesUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/tag/v1.0.5", minimumSupportedVersion: "1.0.0", architectures: ["x64"], schemaVersion: 7, available: true, unavailableReason: null, isCurrent: false },
  { version: "1.1.0-beta.1", tag: "v1.1.0-beta.1", channel: "beta", publishedAt: "2026-08-09T00:00:00.000Z", releaseNotesUrl: "https://github.com/alams-innovative/bulkimg-studio/releases/tag/v1.1.0-beta.1", minimumSupportedVersion: "1.0.0", architectures: ["x64"], schemaVersion: 7, available: false, unavailableReason: "Enable beta updates to install this release.", isCurrent: false },
];
const updateState = (state: HarnessState) => ({
  configured: true, currentVersion: "1.0.7", channel: state.updateChannel, lastCheckedAt: new Date().toISOString(), lastError: null,
  activity: state.downloadedUpdateVersion ? "ready" as const : "idle" as const, progress: null,
  available: updateReleases.find((release) => release.version === "1.0.8") ?? null,
  releases: updateReleases.map((release) => release.channel === "beta" ? { ...release, available: state.updateChannel === "beta", unavailableReason: state.updateChannel === "beta" ? null : release.unavailableReason } : release),
  downloadedVersion: state.downloadedUpdateVersion, fallbackStableVersions: ["1.0.5"],
});

const mocks: Record<string, (params: any) => any> = {
  getBootstrap: () => ({
    brand: { appName: "BulkImg Studio", version: "1.0.7" },
    models: { defaultModel: "gpt-image-2", models: [{ id: "gpt-image-2", label: "GPT Image 2", enabled: true }] },
    keyCount: 1,
    platform: "win32-x64",
    fxRate: 278,
    settings: { waveSize: APP_LIMITS.defaultWaveSize },
    admin: { configured: false, projectId: null, keyHint: null, rateLimits: null, lastError: null },
    adminWarning: "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works.",
    rateHeaderProbe: null,
    pricing: {
      version: "gpt-image-2-2026-08-03",
      source: "OpenAI API pricing categories; image estimates from the GPT Image calculator",
      batchDiscount: 0.5,
      imageEstimatesUsd: {
        square: { low: 0.006, medium: 0.053, high: 0.211 },
        portrait: { low: 0.005, medium: 0.041, high: 0.165 },
        landscape: { low: 0.005, medium: 0.041, high: 0.165 },
        story: { low: 0.005, medium: 0.041, high: 0.165 },
      },
      referenceInputEstimateUsd: 0.002,
      textInputTokenUsd: 0.000005,
      imageInputTokenUsd: 0.000008,
      cachedTextInputTokenUsd: 0.00000125,
      cachedImageInputTokenUsd: 0.000002,
      imageOutputTokenUsd: 0.00003,
    },
    limits: {
      maxReferences: APP_LIMITS.maxReferences,
      maxReferenceBytes: APP_LIMITS.maxReferenceBytes,
      maxPromptChars: APP_LIMITS.maxPromptChars,
      directPromptLimit: APP_LIMITS.directPromptLimit,
      batchPromptLimit: APP_LIMITS.batchPromptLimit,
    },
  }),
  getSettings: () => ({ waveSize: APP_LIMITS.defaultWaveSize }),
  setSettings: (partial: { waveSize?: number }) => ({ waveSize: partial.waveSize ?? APP_LIMITS.defaultWaveSize }),
  getGeneratorDraft: () => null,
  saveGeneratorDraft: (draft: any) => ({ ...draft, updatedAt: new Date().toISOString() }),
  clearGeneratorDraft: () => ({ success: true }),
  getUpdateState: (_params: unknown, request?: Request) => updateState(stateFor(request)),
  checkForUpdates: (_params: unknown, request?: Request) => updateState(stateFor(request)),
  setUpdateChannel: ({ channel }: { channel: "stable" | "beta" }, request?: Request) => { const state = stateFor(request); state.updateChannel = channel; return updateState(state); },
  downloadUpdate: ({ version }: { version: string }, request?: Request) => { const state = stateFor(request); state.downloadedUpdateVersion = version; return updateState(state); },
  installUpdate: () => ({ scheduled: true }),
  parseManualPrompts: ({ text }: { text: string }) => promptMatrix(text),
  importCSV: ({ csvText, sourceName }: { csvText: string; sourceName: string }) => parseCSV(csvText, sourceName),
  estimateRunCost: ({ promptCount }: { promptCount: number }) => ({ costUsd: promptCount * 0.053, costPkr: promptCount * 0.053 * 278, fxRate: 278, pricingVersion: "test", isEstimate: true }),
  getUsageSummary: () => ({
    scope: "this_app",
    range: { startAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), endAt: new Date().toISOString() },
    generatedAt: new Date().toISOString(),
    total: { requestCount: 48, completedCount: 42, failedCount: 6, inputTokens: 4_800, outputTokens: 52_000, costUsd: 1.12, costPkr: 311.36 },
    direct: { requestCount: 8, completedCount: 7, failedCount: 1, inputTokens: 800, outputTokens: 9_000, costUsd: 0.34, costPkr: 94.52 },
    batch: { requestCount: 40, completedCount: 35, failedCount: 5, inputTokens: 4_000, outputTokens: 43_000, costUsd: 0.78, costPkr: 216.84 },
  }),
  listApiKeys: () => [{ id: "key-1", label: "Test key", keyHint: "••••test", provider: "OpenAI", isActive: true, isRateLimited: false, rateLimitedUntil: null, createdAt: new Date().toISOString(), lastUsedAt: null, totalRequests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costPkr: 0, currentSessionId: null, currentModel: null, currentRunMode: null, currentStatus: null, currentPrompts: 0, currentCompleted: 0 }],
  submitBatchRun: ({ prompts, mode, format, quality }: any, request?: Request) => {
    const state = stateFor(request);
    if (mode === "batch" && prompts.length > 1) {
      state.guidedWaveStarted = false;
      state.guidedWaveCancelled = false;
      return {
      ...telemetryBase,
      sessionId: "wave-one",
      status: "completed" as const,
      totalPrompts: Math.ceil(prompts.length / 2),
      completedCount: Math.ceil(prompts.length / 2),
      runMode: mode,
      format,
      quality,
      message: "Saved the first batch.",
      parentRunId: "run-guided-test",
      waveIndex: 0,
      waveCount: 2,
      phase: "done" as const,
      etaMs: null,
      estimateUsd: prompts.length * 0.05,
      };
    }
    return {
      ...telemetryBase,
      totalPrompts: prompts.length,
      runMode: mode,
      format,
      quality,
      estimateUsd: prompts.length * 0.05,
      retryableCount: prompts.length,
    };
  },
  getRunDetail: (_params: unknown, request?: Request) => {
    const state = stateFor(request);
    return ({
    runId: "run-guided-test",
    status: state.guidedWaveCancelled ? "cancelled" as const : "processing" as const,
    model: "gpt-image-2",
    runMode: "batch" as const,
    totalPrompts: 3,
    completedCount: state.guidedWaveStarted ? 2 : 2,
    costUsd: 0.1,
    costPkr: 27.8,
    estimateUsd: 0.15,
    waveSize: 2,
    waveCount: 2,
    waveStrategy: "guided" as const,
    startTime: new Date().toISOString(),
    message: state.guidedWaveCancelled ? "Stopped after saving 2 images." : state.guidedWaveStarted ? "Batch 2 is running." : "Batch 2 is ready to run.",
    format: "square" as const,
    quality: "medium" as const,
    diagnosticId: "BIS-guided",
    sessions: [
      {
        sessionId: "wave-one", status: "completed" as const, model: "gpt-image-2", runMode: "batch" as const,
        totalPrompts: 2, completedCount: 2, costUsd: 0.1, costPkr: 27.8, startTime: new Date().toISOString(), endTime: new Date().toISOString(), keyLabel: "Test key",
        format: "square" as const, quality: "medium" as const, retryableCount: 0, diagnosticId: "BIS-guided-1", lastError: null,
        parentRunId: "run-guided-test", waveIndex: 0, estimateUsd: 0.1, elapsedMs: 1_000,
      },
      {
        sessionId: "wave-two", status: state.guidedWaveCancelled ? "cancelled" as const : state.guidedWaveStarted ? "processing" as const : "pending" as const, model: "gpt-image-2", runMode: "batch" as const,
        totalPrompts: 1, completedCount: 0, costUsd: 0, costPkr: 0, startTime: new Date().toISOString(), endTime: null, keyLabel: "Test key",
        format: "square" as const, quality: "medium" as const, retryableCount: 1, diagnosticId: "BIS-guided-2", lastError: null,
        parentRunId: "run-guided-test", waveIndex: 1, estimateUsd: 0.05, elapsedMs: 0,
      },
    ],
    });
  },
  cancelRemainingWaves: (_params: unknown, request?: Request) => {
    const state = stateFor(request);
    state.guidedWaveCancelled = true;
    return {
      runId: "run-guided-test", status: "cancelled" as const, model: "gpt-image-2", runMode: "batch" as const,
      totalPrompts: 3, completedCount: 2, costUsd: 0.1, costPkr: 27.8, estimateUsd: 0.15,
      waveSize: 2, waveCount: 2, waveStrategy: "guided" as const, startTime: new Date().toISOString(),
      message: "Stopped after saving 2 images.", format: "square" as const, quality: "medium" as const,
      diagnosticId: "BIS-guided", sessions: [],
    };
  },
  pollBatchStatus: ({ sessionId }: { sessionId?: string } = {}) => sessionId === "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" ? ({
    ...telemetryBase,
    sessionId,
    status: "processing" as const,
    totalPrompts: 100,
    completedCount: 42,
    elapsedMs: 180_000,
    message: "Restored active batch.",
    runMode: "batch" as const,
    parentRunId: "run-demo-parent",
    waveIndex: 0,
    waveCount: 2,
    estimateUsd: 2.4,
  }) : ({
    ...telemetryBase,
    status: "completed",
    completedCount: 1,
    elapsedMs: 300,
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.001,
    costPkr: 0.278,
    message: "Saved 1 image.",
    phase: "done",
    etaMs: null,
    estimateUsd: 0.001,
  }),
  listSessions: (_params: unknown, request?: Request) => {
    const restoring = request?.headers.get("referer")?.includes("restore-active") ?? false;
    return [
    {
      sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      status: restoring ? "processing" : "completed",
      model: "gpt-image-2",
      runMode: "batch",
      totalPrompts: 100,
      completedCount: 42,
      costUsd: 1.12,
      costPkr: 311.36,
      startTime: new Date().toISOString(),
      endTime: restoring ? null : new Date().toISOString(),
      keyLabel: "Test key",
      format: "square",
      quality: "medium",
      retryableCount: 58,
      diagnosticId: "BIS-demo01",
      lastError: null,
      parentRunId: "run-demo-parent",
      waveIndex: 0,
      estimateUsd: 2.4,
      elapsedMs: 180_000,
    },
    ];
  },
  listRuns: () => [
    {
      runId: "run-demo-parent",
      status: "processing",
      model: "gpt-image-2",
      runMode: "batch",
      totalPrompts: 165,
      completedCount: 42,
      costUsd: 1.12,
      costPkr: 311.36,
      estimateUsd: 4.2,
      waveSize: 100,
      waveCount: 2,
      startTime: new Date().toISOString(),
      message: "Wave 1 of 2 processing",
      format: "square",
      quality: "medium",
      diagnosticId: "BIS-run01",
      sessions: [
        {
          sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          status: "processing",
          model: "gpt-image-2",
          runMode: "batch",
          totalPrompts: 100,
          completedCount: 42,
          costUsd: 1.12,
          costPkr: 311.36,
          startTime: new Date().toISOString(),
          endTime: null,
          keyLabel: "Test key",
          format: "square",
          quality: "medium",
          retryableCount: 58,
          diagnosticId: "BIS-demo01",
          lastError: null,
          parentRunId: "run-demo-parent",
          waveIndex: 0,
          estimateUsd: 2.4,
          elapsedMs: 180_000,
        },
        {
          sessionId: "ffffffff-1111-2222-3333-444444444444",
          status: "pending",
          model: "gpt-image-2",
          runMode: "batch",
          totalPrompts: 65,
          completedCount: 0,
          costUsd: 0,
          costPkr: 0,
          startTime: new Date().toISOString(),
          endTime: null,
          keyLabel: "Test key",
          format: "square",
          quality: "medium",
          retryableCount: 65,
          diagnosticId: "BIS-demo02",
          lastError: null,
          parentRunId: "run-demo-parent",
          waveIndex: 1,
          estimateUsd: 1.8,
          elapsedMs: 0,
        },
      ],
    },
  ],
  listHistory: () => [
    {
      promptId: "hist-1",
      assetId: "asset-1",
      sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      parentRunId: "run-demo-parent",
      waveIndex: 0,
      promptText: "A geometric blue bird on a muted slate studio backdrop, soft side light.",
      week: "Week 1",
      scheduleDate: "2026-08-05",
      themeColumn: "Brand",
      model: "gpt-image-2",
      status: "completed",
      createdAt: new Date().toISOString(),
      imageFilename: "001_blue-bird.png",
      hasImage: true,
      inputTokens: 120,
      outputTokens: 1400,
      costUsd: 0.042,
      costPkr: 11.68,
      runMode: "batch",
    },
    {
      promptId: "hist-2",
      assetId: "asset-2",
      sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      parentRunId: "run-demo-parent",
      waveIndex: 0,
      promptText: "Portrait product shot of a ceramic mug, clean desk, morning window light.",
      week: "Week 1",
      scheduleDate: "2026-08-06",
      themeColumn: "Product",
      model: "gpt-image-2",
      status: "completed",
      createdAt: new Date().toISOString(),
      imageFilename: "002_mug.png",
      hasImage: true,
      inputTokens: 90,
      outputTokens: 1100,
      costUsd: 0.038,
      costPkr: 10.56,
      runMode: "batch",
    },
    {
      promptId: "hist-3",
      assetId: null,
      sessionId: "session-direct-1",
      parentRunId: null,
      waveIndex: null,
      promptText: "Failed draft: neon kanji alley at night (no image saved).",
      week: "Manual",
      scheduleDate: "",
      themeColumn: "Manual",
      model: "gpt-image-2",
      status: "failed",
      createdAt: new Date().toISOString(),
      imageFilename: null,
      hasImage: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costPkr: 0,
      runMode: "direct",
    },
  ],
  // Tiny vivid 1x1 — browser scales placeholder; enough to show image chrome.
  getHistoryImage: () => ({
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAABaElEQVR4nO3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAN1+AAB1nZq5AAAAABJRU5ErkJggg==",
  }),
  listConverterSessionImages: () => [],
  listExports: () => [
    {
      name: "run-demo-parent.zip",
      filePath: "C:\\\\Users\\\\demo\\\\AppData\\\\BulkImg Studio\\\\exports\\\\run-demo-parent.zip",
      sizeBytes: 48_120_000,
      modifiedAt: new Date().toISOString(),
    },
  ],
  getDiagnosticLogs: () => ({
    lines: [
      '{"ts":"2026-08-04T06:00:00.000Z","event":"startup","version":"1.0.7"}',
      '{"ts":"2026-08-04T06:01:12.000Z","event":"session_created","sessionId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","mode":"batch"}',
      '{"ts":"2026-08-04T06:02:40.000Z","event":"batch_poll","status":"processing","completed":42,"total":100}',
      '{"ts":"2026-08-04T06:03:10.000Z","event":"batch_download_error","category":"timeout","message":"Download stalled; will retry"}',
    ],
    path: "C:\\\\Users\\\\demo\\\\AppData\\\\BulkImg Studio\\\\logs\\\\diagnostics.jsonl",
    events: ["startup", "session_created", "batch_poll", "batch_download_error"],
    total: 4,
  }),
  pickCsvFile: () => null,
  readClipboardImages: ({ maxCount }: { maxCount?: number }) => ({
    images: [
      { filename: "clipboard-one.png", mimeType: "image/png", dataBase64: clipboardPixelBase64 },
      { filename: "clipboard-two.png", mimeType: "image/png", dataBase64: clipboardPixelBase64 },
    ].slice(0, maxCount ?? APP_LIMITS.maxReferences),
    error: null,
  }),
  uploadReferenceImage: (() => { let index = 0; return () => ({ fileId: `file-test-${++index}` }); })(),
  removeReferenceImage: () => ({ success: true }),
  setAdminKey: () => ({ configured: true, projectId: null, keyHint: "••••admn", rateLimits: null, lastError: null }),
  clearAdminKey: () => ({ configured: false, projectId: null, keyHint: null, rateLimits: null, lastError: null }),
  setAdminProjectId: ({ projectId }: { projectId: string }) => ({ configured: true, projectId, keyHint: "••••admn", rateLimits: null, lastError: null }),
  refreshRateLimits: () => ({
    configured: true,
    projectId: "proj_test",
    keyHint: "••••admn",
    rateLimits: {
      model: "gpt-image-2",
      maxImagesPerMinute: 20,
      maxTokensPerMinute: 250_000,
      maxRequestsPerMinute: null,
      batchDayMaxInputTokens: null,
      fetchedAt: new Date().toISOString(),
    },
    lastError: null,
  }),
  listAdminProjects: () => [],
  resumeRun: () => ({ ...telemetryBase, status: "processing", message: "Resume batch submitted." }),
  continueRun: (_params: unknown, request?: Request) => {
    stateFor(request).guidedWaveStarted = true;
    return {
      ...telemetryBase,
      sessionId: "wave-two",
      status: "processing" as const,
      totalPrompts: 1,
      runMode: "batch" as const,
      message: "Batch 2 is running.",
      parentRunId: "run-guided-test",
      waveIndex: 1,
      waveCount: 2,
    };
  },
  windowControl: () => ({ maximized: true }),
  revealHistoryAsset: () => ({ filePath: "C:\\\\temp\\\\image.png" }),
  revealHistorySessionFolder: () => ({ directory: "C:\\\\temp\\\\history" }),
};

void extname;

const mockScript = `
window.__electrobun = {};
window.__electrobunBunBridge = { postMessage(raw) {
  const request = JSON.parse(raw);
  if (request.type !== "request") return;
  fetch("/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }).then(response => response.json()).then(payload => {
    window.__electrobun.receiveMessageFromBun({ type: "response", id: request.id, success: true, payload });
  }).catch(error => window.__electrobun.receiveMessageFromBun({ type: "response", id: request.id, success: false, error: String(error.message || error) }));
}};`;

const server = Bun.serve({
  port: Number(Bun.env["UI_HARNESS_PORT"] ?? 4177),
  routes: {
    "/mock-rpc.js": new Response(mockScript, { headers: { "content-type": "text/javascript" } }),
    "/index.js": new Response(bundle, { headers: { "content-type": "text/javascript" } }),
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (url.pathname === "/") {
      const html = (await Bun.file(join(root, "src", "mainview", "index.html")).text())
        .replace("<script type=\"module\" src=\"index.js\"></script>", "<script src=\"/mock-rpc.js\"></script><script type=\"module\" src=\"/index.js\"></script>")
        .replaceAll("views://assets/", "/assets/");
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/index.css") {
      return new Response((await Bun.file(join(root, "src", "mainview", "index.css")).text()).replaceAll("views://assets/", "/assets/"), { headers: { "content-type": "text/css" } });
    }
    if (url.pathname === "/rpc" && request.method === "POST") {
      const call = await request.json() as { method: string; params: any };
      const handler = mocks[call.method];
      return Response.json(handler ? await handler(call.params, request) : null);
    }
    if (url.pathname.startsWith("/assets/")) {
      const path = resolve(root, url.pathname.slice(1));
      if (!path.toLowerCase().startsWith(resolve(root, "assets").toLowerCase())) return new Response("Forbidden", { status: 403 });
      return new Response(Bun.file(path));
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`UI harness listening on ${server.url}`);
