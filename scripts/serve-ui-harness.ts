import { extname, join, resolve } from "node:path";
import { parseCSV } from "../src/bun/services/prompt-parser";

const root = resolve(import.meta.dir, "..");
const build = await Bun.build({ entrypoints: [join(root, "src", "mainview", "index.ts")], target: "browser", write: false, minify: false });
if (!build.success || !build.outputs[0]) throw new Error("Could not build UI harness bundle.");
const bundle = await build.outputs[0].text();

const promptMatrix = (text: string) => {
  const prompts = text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const cells = prompts.map((promptText, index) => ({ id: `p-${index}`, promptText, week: "Manual", weekStartDate: "", dayLabel: "Manual", scheduleDate: "", themeColumn: "Manual", disabled: false }));
  return { sourceName: "Manual prompts", columns: ["Prompt"], warnings: [], cells, groups: cells.length ? [{ id: "manual", label: "Manual prompts", startDate: "", cellIds: cells.map((cell) => cell.id) }] : [] };
};

const mocks: Record<string, (params: any) => any> = {
  getBootstrap: () => ({ brand: { appName: "BulkImg Studio", version: "1.0.0-beta" }, models: { defaultModel: "gpt-image-2", models: [{ id: "gpt-image-2", label: "GPT Image 2", enabled: true }] }, keyCount: 1, platform: "win32-x64", fxRate: 278 }),
  parseManualPrompts: ({ text }: { text: string }) => promptMatrix(text),
  importCSV: ({ csvText, sourceName }: { csvText: string; sourceName: string }) => parseCSV(csvText, sourceName),
  estimateRunCost: ({ promptCount }: { promptCount: number }) => ({ costUsd: promptCount * 0.053, costPkr: promptCount * 0.053 * 278, fxRate: 278, pricingVersion: "test", isEstimate: true }),
  listApiKeys: () => [{ id: "key-1", label: "Test key", keyHint: "••••test", provider: "OpenAI", isActive: true, isRateLimited: false, rateLimitedUntil: null, createdAt: new Date().toISOString(), lastUsedAt: null, totalRequests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costPkr: 0, currentSessionId: null, currentModel: null, currentRunMode: null, currentStatus: null, currentPrompts: 0, currentCompleted: 0 }],
  submitBatchRun: ({ prompts, mode, format, quality }: any) => ({ sessionId: "session-test", status: "processing", totalPrompts: prompts.length, completedCount: 0, elapsedMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costPkr: 0, fxRate: 278, message: "Queued", runMode: mode, format, quality, retryableCount: prompts.length, diagnosticId: "BIS-test", lastError: null, nextPollAt: null }),
  pollBatchStatus: () => ({ sessionId: "session-test", status: "completed", totalPrompts: 1, completedCount: 1, elapsedMs: 300, inputTokens: 10, outputTokens: 20, costUsd: 0.001, costPkr: 0.278, fxRate: 278, message: "Saved 1 image.", runMode: "direct", format: "square", quality: "medium", retryableCount: 0, diagnosticId: "BIS-test", lastError: null, nextPollAt: null }),
  listSessions: () => [], listHistory: () => [], listExports: () => [],
  pickCsvFile: () => null,
  uploadReferenceImage: (() => { let index = 0; return () => ({ fileId: `file-test-${++index}` }); })(),
  removeReferenceImage: () => ({ success: true }),
};

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
