import { BrowserView, BrowserWindow, Screen, Tray, Utils } from "electrobun/bun";
import { existsSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import type { AdminConfigView, AppRPC, BrandTheme, RateLimitHeaderProbe, RateLimitSnapshot } from "../shared/contracts";
import { APP_CHANNEL, APP_VERSION } from "../shared/build-info";
import type { UpdateConfig, UpdateState } from "../shared/update-contracts";
import { APP_LIMITS } from "../shared/contracts";
import { AppDatabase } from "./database";
import { BatchEngine } from "./services/batch-engine";
import { ExportService } from "./services/export-service";
import { ConverterService } from "./services/converter-service";
import { FxService } from "./services/fx-service";
import { HistoryService } from "./services/history-service";
import { KeyVault } from "./services/key-vault";
import { PricingService } from "./services/pricing-service";
import { parseCSV, parseManualPrompts } from "./services/prompt-parser";
import { pickOpenFile, readClipboardCsv, readClipboardImages } from "./services/windows-native";
import { cleanupStaleTemporaryFiles, DiagnosticLog } from "./services/diagnostics";
import { setNativeWindowDarkMode, setNativeWindowIcon } from "./services/window-icon";
import { UpdateService } from "./services/update-service";
import { getInitialWindowFrame } from "./window-layout";

if (process.platform !== "win32") {
  throw new Error(`BulkImg Studio ${APP_VERSION} supports Windows 10 and Windows 11 only.`);
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: APP_VERSION,
  logoPath: "views://assets/brand-pack/BulkImg_Studio_Brand_Pack/logos/bulkimg-studio-logo-dark-256.png",
  iconPath: "views://assets/brand/app_icon.ico",
  accentColor: "#D5DAE0",
  accentSecondary: "#B5BDC7",
  themeMode: "slatestack-dark",
};

async function readJson<T>(paths: string[], fallback: T): Promise<T> {
  for (const path of paths) {
    try {
      return await Bun.file(path).json() as T;
    } catch {
      // Try the next development or packaged resource location.
    }
  }
  return fallback;
}

function adminView(database: AppDatabase): AdminConfigView {
  const row = database.getAdminConfigRow();
  let rateLimits: RateLimitSnapshot | null = null;
  if (row.rate_limits_json) {
    try { rateLimits = JSON.parse(row.rate_limits_json) as RateLimitSnapshot; } catch { rateLimits = null; }
  }
  return {
    configured: Boolean(row.encrypted_key),
    projectId: row.project_id,
    keyHint: row.key_hint,
    rateLimits,
    lastError: row.last_error,
  };
}

function headerProbe(database: AppDatabase): RateLimitHeaderProbe | null {
  const row = database.getAdminConfigRow();
  if (!row.header_probe_json) return null;
  try { return JSON.parse(row.header_probe_json) as RateLimitHeaderProbe; } catch { return null; }
}

const assetRoots = [
  join(process.cwd(), "assets"),
  join(process.cwd(), "..", "Resources", "app", "views", "assets"),
];

// Electrobun keeps the backend alive after its only window is closed so Batch
// recovery and the tray can continue. A Windows named pipe makes a second
// Start-menu launch activate that existing backend instead of starting another
// scheduler against the same local database.
function pipeHash(value: string): string {
  let hash = 5381;
  for (const character of value) hash = ((hash * 33) ^ character.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

// Keep stable and beta installs independent while ensuring an updated build
// in the same install location activates its existing background scheduler.
const INSTANCE_PIPE = `\\\\.\\pipe\\bulkimg-studio-${(process.env["USERNAME"] || "user").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}-${pipeHash(`${process.execPath}|${process.cwd()}`.toLowerCase())}`;
let mainWindow: BrowserWindow | null = null;
let windowClosed = false;
let isQuitting = false;
let startupUiReady = false;
let startupRevealTimer: ReturnType<typeof setTimeout> | null = null;
let nativeWindowTitle = "";

function activateExistingInstance(): void {
  if (mainWindow) showMainWindow();
}

async function claimSingleInstance(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.once("data", () => activateExistingInstance());
      socket.end();
    });
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") {
        console.warn("Single-instance channel unavailable; continuing.", error.message);
        resolve(true);
        return;
      }
      const client = net.createConnection(INSTANCE_PIPE);
      let resolved = false;
      const finish = (primary: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(primary);
      };
      client.once("connect", () => {
        client.write("activate");
        client.end();
        finish(false);
      });
      client.once("error", () => {
        // A stale named-pipe endpoint is rare but can happen after a forced
        // termination. Retry claiming it once rather than launching blindly.
        setTimeout(() => {
          const retry = net.createServer((socket) => {
            socket.once("data", () => activateExistingInstance());
            socket.end();
          });
          retry.once("error", () => finish(false));
          retry.listen(INSTANCE_PIPE, () => finish(true));
        }, 80);
      });
    });
    server.listen(INSTANCE_PIPE, () => resolve(true));
  });
}

if (!await claimSingleInstance()) {
  Utils.quit();
  process.exit(0);
}

const dataDirectory = Utils.paths.userData;
const diagnosticLog = new DiagnosticLog(dataDirectory);
const cleanedFiles = cleanupStaleTemporaryFiles(dataDirectory);
void diagnosticLog.write("startup", {
  cleanedFiles,
  version: APP_VERSION,
  userData: dataDirectory,
  pid: process.pid,
});
const database = new AppDatabase(dataDirectory);
const keyVault = new KeyVault(database, dataDirectory);
const fxService = new FxService(database);
const historyService = new HistoryService(database, dataDirectory, Utils.paths.downloads);
const pricingService = new PricingService(assetRoots);
await pricingService.load();
const batchEngine = new BatchEngine(database, keyVault, fxService, historyService, pricingService, dataDirectory, diagnosticLog);
const exportService = new ExportService(database, dataDirectory);
const converterService = new ConverterService(database, dataDirectory);
const activeUpdateWork = new Set<string>();

async function withUpdateWork<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  activeUpdateWork.add(label);
  try {
    return await work();
  } finally {
    activeUpdateWork.delete(label);
  }
}
const recovered = batchEngine.recoverOnStartup();
if (recovered > 0) {
  console.log(`Recovered ${recovered} session(s) after restart.`);
  void diagnosticLog.write("startup_recover", { recovered });
}

const brand = { ...await readJson(assetRoots.map((root) => join(root, "brand", "theme.json")), fallbackBrand), version: APP_VERSION };
const nativeIconPath = assetRoots
  .map((root) => join(root, "brand", "app_icon.ico"))
  .find(existsSync);
const models = await readJson(assetRoots.map((root) => join(root, "config", "models.json")), {
  defaultModel: "gpt-image-2",
  models: [{
    id: "gpt-image-2", label: "GPT Image 2", enabled: true,
    maxResolution: "2048x2048", ratios: ["1:1"], features: ["Image generation"],
  }],
});
const updateConfig = await readJson<UpdateConfig>(assetRoots.map((root) => join(root, "config", "update.json")), {
  repository: "alams-innovative/bulkimg-studio",
  publicKeyPem: "",
});
const updateService = new UpdateService(database, dataDirectory, brand.version, updateConfig, process.arch === "arm64" ? "arm64" : "x64", diagnosticLog);
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
let updatePreparationInFlight: Promise<UpdateState> | null = null;
updateService.markHealthyStartup();
const recoveredUpdateFailure = updateService.recoverInstallerFailure();
if (recoveredUpdateFailure) void diagnosticLog.write("update_install_recovery", { ok: false, message: recoveredUpdateFailure });

const ADMIN_WARNING = "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works with your normal API keys.";

async function logged<T>(event: string, fields: Record<string, unknown>, work: () => T | Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await work();
    void diagnosticLog.write(event, { ok: true, durationMs: Math.round(performance.now() - startedAt), ...fields });
    return result;
  } catch (error) {
    void diagnosticLog.write(event, {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      ...fields,
      message: error instanceof Error ? error.message.slice(0, 240) : "error",
    });
    throw error;
  }
}

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      reportUiReady: ({ theme, viewportWidth, viewportHeight }) => {
        startupUiReady = true;
        syncNativeWebviewFrame();
        revealMainWindow();
        void diagnosticLog.write("ui_ready", { theme, viewportWidth, viewportHeight });
        return { accepted: true };
      },
      getBootstrap: async () => {
        const admin = adminView(database);
        void diagnosticLog.write("bootstrap", {
          keyCount: keyVault.listSafe().filter((key) => key.isActive).length,
          adminConfigured: admin.configured,
        });
        return {
          brand,
          models,
          keyCount: keyVault.listSafe().filter((key) => key.isActive).length,
          platform: `${process.platform}-${process.arch}`,
          fxRate: await fxService.getUsdPkrRate(),
          settings: database.getAppSettings(),
          admin,
          adminWarning: admin.configured ? null : ADMIN_WARNING,
          rateHeaderProbe: headerProbe(database),
          pricing: pricingService.getView(),
          limits: {
            maxReferences: APP_LIMITS.maxReferences,
            maxReferenceBytes: APP_LIMITS.maxReferenceBytes,
            maxPromptChars: APP_LIMITS.maxPromptChars,
            directPromptLimit: APP_LIMITS.directPromptLimit,
            batchPromptLimit: APP_LIMITS.batchPromptLimit,
          },
        };
      },
      getUsageSummary: ({ startAt, endAt }) => database.getUsageSummary({ startAt, endAt }),
      getFxRate: async () => {
        const rate = await fxService.getUsdPkrRate();
        return { rate, ...fxService.getState() };
      },
      getObservedCost: (input) => database.getObservedCost(input),
      getSettings: () => database.getAppSettings(),
      setSettings: (partial) => logged("settings_update", { keys: Object.keys(partial) }, () => database.setAppSettings(partial)),
      importCSV: ({ csvText, sourceName }) => logged("import_csv", {
        sourceName,
        bytes: csvText.length,
      }, () => parseCSV(csvText, sourceName)),
      parseManualPrompts: ({ text }) => logged("parse_manual", {
        chars: text.length,
      }, () => parseManualPrompts(text)),
      getGeneratorDraft: () => database.getGeneratorDraft(),
      saveGeneratorDraft: (draft) => logged("generator_draft_save", {
        sourceName: draft.matrix.sourceName.slice(0, 120),
        promptCount: draft.matrix.cells.length,
        selectedCount: draft.selectedIds.length,
      }, () => database.saveGeneratorDraft(draft)),
      clearGeneratorDraft: () => logged("generator_draft_clear", {}, () => {
        database.clearGeneratorDraft();
        return { success: true as const };
      }),
      getUpdateState: () => updateService.state(),
      checkForUpdates: () => logged("update_check", { source: "manual" }, () => checkAndPrepareUpdate()),
      setUpdateChannel: ({ channel }) => logged("update_channel", { channel }, () => updateService.setChannel(channel)),
      downloadUpdate: ({ version }) => logged("update_download", { version }, () => updateService.download(version)),
      installUpdate: ({ version }) => logged("update_install", { version }, async () => {
        const result = await updateService.scheduleInstall(version, () => {
          const hasActiveRun = database.listRuns().some((run) => run.status === "pending" || run.status === "processing");
          if (hasActiveRun) return "Finish or cancel the active image run before installing an update.";
          if (activeUpdateWork.size) {
            return `Wait for the active ${[...activeUpdateWork].join(" and ")} operation to finish before installing an update.`;
          }
          return null;
        });
        setTimeout(() => { isQuitting = true; Utils.quit(); }, 700);
        return result;
      }),
      pickCsvFile: async () => logged("pick_csv_file", {}, async () => {
        const path = await pickOpenFile({
          title: "Import weekly CSV calendar",
          filter: "*.csv",
          filterLabel: "CSV files",
        });
        if (!path) {
          void diagnosticLog.write("pick_csv_file", { ok: true, cancelled: true });
          return null;
        }
        const csvText = await Bun.file(path).text();
        const sourceName = path.split(/[/\\]/).pop() || "calendar.csv";
        return { csvText, sourceName };
      }),
      submitBatchRun: (input) => batchEngine.submit(input),
      pollBatchStatus: ({ sessionId }) => batchEngine.poll(sessionId),
      getSessionDetail: async ({ sessionId, refresh }) => {
        if (refresh) await batchEngine.poll(sessionId, true);
        return batchEngine.getDetail(sessionId);
      },
      cancelBatchRun: ({ sessionId }) => batchEngine.cancel(sessionId),
      retryFailedPrompts: ({ sessionId }) => batchEngine.retryFailed(sessionId),
      resumeRun: (params) => batchEngine.resumeRun(params),
      continueRun: ({ runId }) => batchEngine.continueRun(runId),
      cancelRemainingWaves: ({ runId }) => batchEngine.cancelRemainingWaves(runId),
      estimateRunCost: async (input) => logged("estimate_create", {
        promptCount: input.promptCount, mode: input.mode, format: input.format, quality: input.quality, referenceCount: input.referenceCount,
      }, async () => batchEngine.estimate(input, await fxService.getUsdPkrRate())),
      uploadReferenceImage: async ({ dataBase64, filename, mimeType }) => logged("reference_upload", {
        filename,
        mimeType,
        bytes: Math.floor((dataBase64.length * 3) / 4),
      }, async () => {
        const bytes = Buffer.from(dataBase64, "base64");
        return batchEngine.uploadReference(new Uint8Array(bytes), filename, mimeType);
      }),
      removeReferenceImage: ({ fileId }) => logged("reference_remove", { fileId }, () => batchEngine.removeReference(fileId)),
      listApiKeys: () => keyVault.listSafe(),
      addApiKey: ({ label, key }) => logged("api_key_add", { label: label.trim() || "OpenAI key" }, () => keyVault.add(label, key)),
      setApiKeyActive: ({ id, isActive }) => logged("api_key_toggle", { id, isActive }, () => {
        database.setKeyActive(id, isActive);
        keyVault.invalidateKey(id);
        return { success: true as const };
      }),
      deleteApiKey: ({ id }) => logged("api_key_delete", { id }, () => {
        database.deleteKey(id);
        keyVault.invalidateKey(id);
        return { success: true as const };
      }),
      setAdminKey: async ({ key, projectId }) => logged("admin_key_set", {
        hasKey: Boolean(key.trim()),
        hasProject: Boolean(projectId?.trim()),
      }, async () => {
        await keyVault.setAdminKey(key, projectId);
        const row = database.getAdminConfigRow();
        if (row.encrypted_key && row.project_id) await keyVault.refreshAdminRateLimits();
        return adminView(database);
      }),
      clearAdminKey: () => logged("admin_key_clear", {}, () => {
        keyVault.clearAdminKey();
        return adminView(database);
      }),
      setAdminProjectId: async ({ projectId }) => logged("admin_project_set", {
        projectId: projectId.slice(0, 40),
      }, async () => {
        database.setAdminProjectId(projectId.trim());
        await keyVault.refreshAdminRateLimits();
        return adminView(database);
      }),
      refreshRateLimits: async () => logged("admin_limits_refresh", {}, async () => {
        await keyVault.refreshAdminRateLimits();
        return adminView(database);
      }),
      listAdminProjects: () => logged("admin_projects_list", {}, () => keyVault.listAdminProjects()),
      listSessions: () => database.listSessions(),
      listRuns: () => database.listRuns(),
      getRunDetail: ({ runId }) => {
        const detail = database.getRunDetail(runId);
        if (!detail) throw new Error("Run was not found.");
        return detail;
      },
      listHistory: () => historyService.list(),
      getHistoryImage: async ({ assetId }) => ({ dataUrl: await historyService.imageDataUrl(assetId) }),
      downloadHistoryAsset: ({ assetId }) => ({ filePath: historyService.download(assetId) }),
      revealHistoryAsset: ({ assetId }) => ({ filePath: historyService.revealAsset(assetId) }),
      revealHistorySessionFolder: ({ sessionId }) => ({ directory: historyService.revealSessionFolder(sessionId) }),
      deleteHistoryItem: ({ promptId }) => logged("history_delete_item", { promptId }, () => {
        historyService.deletePrompt(promptId);
        return { success: true as const };
      }),
      clearHistory: () => logged("history_clear", {}, () => historyService.clear()),
      listExports: () => exportService.list(),
      revealExportsFolder: () => ({ directory: exportService.revealFolder() }),
      exportSessionZip: async ({ sessionId, pickPath }) => logged("export_session", { sessionId }, async () => ({
        filePath: await withUpdateWork("export", () => exportService.export(sessionId, { pickPath: Boolean(pickPath) })),
      })),
      exportRunZip: async ({ runId, pickPath }) => logged("export_run", { runId }, async () => ({
        filePath: await withUpdateWork("export", () => exportService.exportRun(runId, { pickPath: Boolean(pickPath) })),
      })),
      exportSelectedHistoryZip: async ({ assetIds, pickPath }) => logged("export_history_selected", { count: assetIds.length }, async () => ({
        filePath: await withUpdateWork("export", () => exportService.exportSelectedHistory(assetIds, { pickPath: Boolean(pickPath) })),
      })),
      getDiagnosticLogs: ({ limit, query, event }) => diagnosticLog.read({ limit, query, event }),
      exportDiagnostics: async () => logged("diagnostics_export_requested", { version: brand.version }, async () => ({
        filePath: await diagnosticLog.exportSupportBundle({
          version: brand.version,
          channel: APP_CHANNEL,
          platform: process.platform,
          architecture: process.arch,
        }),
      })),
      revealLogsFolder: () => {
        const directory = diagnosticLog.logDirectory;
        Bun.spawn(["explorer.exe", directory], { stdout: "ignore", stderr: "ignore" });
        return { directory };
      },
      writeDiagnosticLog: async ({ event, fields }) => {
        const safeEvent = (event || "ui_event").replace(/[^\w.-]/g, "_").slice(0, 64);
        await diagnosticLog.write(safeEvent, { ...(fields ?? {}), source: "ui" });
        return { success: true as const };
      },
      readClipboardCsv: async () => {
        const result = await readClipboardCsv();
        await diagnosticLog.write("clipboard_csv", {
          ok: Boolean(result.text) && !result.error,
          chars: result.text?.length ?? 0,
          sourceName: result.sourceName,
          error: result.error,
        });
        return result;
      },
      readClipboardImages: async ({ maxCount }) => {
        const startedAt = performance.now();
        const result = await readClipboardImages(maxCount ?? APP_LIMITS.maxReferences);
        await diagnosticLog.write("clipboard_images", {
          ok: result.images.length > 0 && !result.error,
          count: result.images.length,
          error: result.error,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return result;
      },
      listConverterSessionImages: () => converterService.listSessionImages(),
      convertImages: ({ inputs, options }) => logged("converter_convert", {
        count: inputs.length,
        defaultFormat: options.defaultFormat,
      }, () => withUpdateWork("conversion", () => converterService.convert(inputs, options))),
      listConverterJobs: () => converterService.listJobs(),
      getConverterOutput: async ({ jobId, itemId }) => ({ dataUrl: await converterService.outputDataUrl(jobId, itemId) }),
      getConverterProperties: ({ jobId, itemId }) => converterService.outputProperties(jobId, itemId),
      getConverterSourceProperties: ({ input }) => converterService.sourceProperties(input),
      copyConverterOutput: async ({ jobId, itemId }) => {
        await converterService.copyOutput(jobId, itemId);
        return { success: true as const };
      },
      copyConverterFiles: async ({ jobId, itemIds }) => {
        await converterService.copyFiles(jobId, itemIds);
        return { success: true as const };
      },
      saveConverterOutputs: ({ jobId, itemIds }) => converterService.saveOutputs(jobId, itemIds),
      deleteConverterJob: ({ jobId }) => {
        converterService.deleteJob(jobId);
        return { success: true as const };
      },
    },
    messages: {},
  },
});

function checkAndPrepareUpdate(): Promise<UpdateState> {
  if (updatePreparationInFlight) return updatePreparationInFlight;
  const work = (async (): Promise<UpdateState> => {
    const checked = await updateService.check();
    const available = checked.available;
    if (!available || checked.activity === "checking" || checked.activity === "downloading") return checked;
    if (checked.downloadedVersion === available.version) return checked;
    try {
      const ready = await updateService.download(available.version);
      void diagnosticLog.write("update_auto_download_ready", { version: available.version, channel: available.channel });
      try { rpc.send.updateReady(ready); } catch { /* The view may not be ready yet. */ }
      return ready;
    } catch (error) {
      void diagnosticLog.write("update_auto_download_failed", {
        version: available.version,
        message: error instanceof Error ? error.message.slice(0, 240) : "error",
      });
      return updateService.state();
    }
  })();
  updatePreparationInFlight = work;
  void work.finally(() => {
    if (updatePreparationInFlight === work) updatePreparationInFlight = null;
  });
  return work;
}

if (updateConfig.publicKeyPem.trim()) {
  void checkAndPrepareUpdate();
  setInterval(() => void checkAndPrepareUpdate(), UPDATE_CHECK_INTERVAL_MS);
}

batchEngine.setProgressSink((telemetry) => {
  updateTrayStatus(telemetry.status, telemetry.message);
  try {
    rpc.send.sessionProgress(telemetry);
  } catch {
    // Transport may not be ready during early startup.
  }
});

function createMainWindow(): BrowserWindow {
  startupUiReady = false;
  const frame = getInitialWindowFrame(Screen.getPrimaryDisplay().workArea);
  const windowTitle = `${brand.appName} ${brand.version}`;
  nativeWindowTitle = windowTitle;
  const window = new BrowserWindow({
    title: windowTitle,
    url: "views://mainview/index.html",
    rpc,
    titleBarStyle: "default",
    hidden: true,
    frame,
  });
  window.on("close", () => {
    windowClosed = true;
    mainWindow = null;
    nativeWindowTitle = "";
    if (startupRevealTimer) {
      clearTimeout(startupRevealTimer);
      startupRevealTimer = null;
    }
    if (isQuitting) return;
    Utils.showNotification({
      title: brand.appName,
      body: "BulkImg Studio is still running in the system tray. Select its tray icon to open it again.",
    });
  });
  // Configure native chrome while the window is still hidden. This avoids the
  // white first-frame title bar on a dark-first application.
  setTimeout(applyNativeWindowChrome, 40);
  // A broken or unexpectedly slow renderer must never leave a blank app
  // window forever. Normal startup reveals only after the WebView reports a
  // stable first layout.
  startupRevealTimer = setTimeout(() => {
    if (!startupUiReady) {
      console.warn("UI readiness timed out; revealing the app window.");
      revealMainWindow();
    }
  }, 2_500);
  return window;
}

mainWindow = createMainWindow();
const tray = new Tray({
  title: brand.appName,
  image: fallbackBrand.iconPath,
  template: false,
  width: 16,
  height: 16,
});

function showMainWindow(): void {
  if (windowClosed || !mainWindow) {
    mainWindow = createMainWindow();
    windowClosed = false;
    return;
  }
  revealMainWindow();
  mainWindow.maximize();
  mainWindow.activate();
}

function revealMainWindow(): void {
  if (!mainWindow || windowClosed) return;
  if (startupRevealTimer) {
    clearTimeout(startupRevealTimer);
    startupRevealTimer = null;
  }
  mainWindow.show();
  mainWindow.activate();
  setTimeout(applyNativeWindowChrome, 0);
}

function syncNativeWebviewFrame(): void {
  if (!mainWindow || windowClosed) return;
  try {
    const frame = mainWindow.getFrame();
    // Electrobun's Windows CEF view occasionally misses its first WM_SIZE.
    // Re-applying the hidden window's frame before it is revealed gives the
    // WebView the same native resize signal as a user drag, without a flash.
    mainWindow.setFrame(frame.x, frame.y, frame.width, frame.height + 1);
    mainWindow.setFrame(frame.x, frame.y, frame.width, frame.height);
    void diagnosticLog.write("native_webview_frame_sync", { width: frame.width, height: frame.height });
  } catch (error) {
    void diagnosticLog.write("native_webview_frame_sync", { ok: false, message: error instanceof Error ? error.message.slice(0, 160) : "error" });
  }
}

function applyNativeWindowChrome(): void {
  if (!nativeWindowTitle) return;
  if (!setNativeWindowDarkMode(nativeWindowTitle, true)) {
    console.warn("Could not apply native dark window chrome.");
  }
  if (nativeIconPath && !setNativeWindowIcon(nativeWindowTitle, nativeIconPath)) {
    console.warn("Could not apply the native window icon.");
  }
}

function updateTrayStatus(status: string, message = ""): void {
  const active = status === "processing" || status === "pending";
  const attention = status === "failed" || status === "partial" || status === "cancelled";
  const label = active ? "Working" : attention ? "Needs attention" : status === "completed" ? "Completed" : "Ready";
  tray.setTitle(`${brand.appName} — ${label}`);
  tray.setMenu([
    { type: "normal", label: `${label}${message ? `: ${message.slice(0, 72)}` : ""}`, action: "open" },
    { type: "separator" },
    { type: "normal", label: "Open BulkImg Studio", action: "open" },
    { type: "normal", label: "Exit", action: "exit" },
  ]);
}

updateTrayStatus("ready");
tray.on("tray-clicked", (event: unknown) => {
  const action = (event as { data?: { action?: string } }).data?.action;
  if (action === "exit") {
    const hasActiveBatch = database.listRuns().some((run) => run.status === "pending" || run.status === "processing");
    if (hasActiveBatch) {
      showMainWindow();
      Utils.showNotification({
        title: brand.appName,
        body: "A batch is still running. Stop it first if you want to exit; saved results remain available when you reopen the app.",
      });
      return;
    }
    isQuitting = true;
    Utils.quit();
    return;
  }
  showMainWindow();
});
batchEngine.startScheduler();

console.log(`${brand.appName} ${brand.version} started`);
console.log(`Data directory: ${dataDirectory}`);
