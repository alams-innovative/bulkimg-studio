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

const mocks: Record<string, (params: any) => any> = {
  getBootstrap: () => ({
    brand: { appName: "BulkImg Studio", version: "1.0.1-beta" },
    models: { defaultModel: "gpt-image-2", models: [{ id: "gpt-image-2", label: "GPT Image 2", enabled: true }] },
    keyCount: 1,
    platform: "win32-x64",
    fxRate: 278,
    settings: { waveSize: APP_LIMITS.defaultWaveSize },
    admin: { configured: false, projectId: null, keyHint: null, rateLimits: null, lastError: null },
    adminWarning: "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works.",
    rateHeaderProbe: null,
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
  parseManualPrompts: ({ text }: { text: string }) => promptMatrix(text),
  importCSV: ({ csvText, sourceName }: { csvText: string; sourceName: string }) => parseCSV(csvText, sourceName),
  estimateRunCost: ({ promptCount }: { promptCount: number }) => ({ costUsd: promptCount * 0.053, costPkr: promptCount * 0.053 * 278, fxRate: 278, pricingVersion: "test", isEstimate: true }),
  listApiKeys: () => [{ id: "key-1", label: "Test key", keyHint: "••••test", provider: "OpenAI", isActive: true, isRateLimited: false, rateLimitedUntil: null, createdAt: new Date().toISOString(), lastUsedAt: null, totalRequests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costPkr: 0, currentSessionId: null, currentModel: null, currentRunMode: null, currentStatus: null, currentPrompts: 0, currentCompleted: 0 }],
  submitBatchRun: ({ prompts, mode, format, quality }: any) => ({
    ...telemetryBase,
    totalPrompts: prompts.length,
    runMode: mode,
    format,
    quality,
    estimateUsd: prompts.length * 0.05,
    retryableCount: prompts.length,
  }),
  pollBatchStatus: () => ({
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
  listSessions: () => [
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
  ],
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
      '{"ts":"2026-08-04T06:00:00.000Z","event":"startup","version":"1.0.1-beta"}',
      '{"ts":"2026-08-04T06:01:12.000Z","event":"session_created","sessionId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","mode":"batch"}',
      '{"ts":"2026-08-04T06:02:40.000Z","event":"batch_poll","status":"processing","completed":42,"total":100}',
      '{"ts":"2026-08-04T06:03:10.000Z","event":"batch_download_error","category":"timeout","message":"Download stalled; will retry"}',
    ],
    path: "C:\\\\Users\\\\demo\\\\AppData\\\\BulkImg Studio\\\\logs\\\\diagnostics.jsonl",
    events: ["startup", "session_created", "batch_poll", "batch_download_error"],
    total: 4,
  }),
  pickCsvFile: () => null,
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
      return Response.json(handler ? await handler(call.params) : null);
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
