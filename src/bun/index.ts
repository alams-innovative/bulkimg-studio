import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { join } from "node:path";
import type { AdminConfigView, AppRPC, BrandTheme, RateLimitHeaderProbe, RateLimitSnapshot } from "../shared/contracts";
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

if (process.platform !== "win32") {
  throw new Error("BulkImg Studio 1.0.3 supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "1.0.3",
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

const dataDirectory = Utils.paths.userData;
const diagnosticLog = new DiagnosticLog(dataDirectory);
const cleanedFiles = cleanupStaleTemporaryFiles(dataDirectory);
void diagnosticLog.write("startup", {
  cleanedFiles,
  version: "1.0.3",
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
const recovered = batchEngine.recoverOnStartup();
if (recovered > 0) {
  console.log(`Recovered ${recovered} session(s) after restart.`);
  void diagnosticLog.write("startup_recover", { recovered });
}

const brand = await readJson(assetRoots.map((root) => join(root, "brand", "theme.json")), fallbackBrand);
const models = await readJson(assetRoots.map((root) => join(root, "config", "models.json")), {
  defaultModel: "gpt-image-2",
  models: [{
    id: "gpt-image-2", label: "GPT Image 2", enabled: true,
    maxResolution: "2048x2048", ratios: ["1:1"], features: ["Image generation"],
  }],
});

const ADMIN_WARNING = "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works with your normal API keys.";

async function logged<T>(event: string, fields: Record<string, unknown>, work: () => T | Promise<T>): Promise<T> {
  try {
    const result = await work();
    void diagnosticLog.write(event, { ok: true, ...fields });
    return result;
  } catch (error) {
    void diagnosticLog.write(event, {
      ok: false,
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
      getSettings: () => database.getAppSettings(),
      setSettings: (partial) => logged("settings_update", { keys: Object.keys(partial) }, () => database.setAppSettings(partial)),
      importCSV: ({ csvText, sourceName }) => logged("import_csv", {
        sourceName,
        bytes: csvText.length,
      }, () => parseCSV(csvText, sourceName)),
      parseManualPrompts: ({ text }) => logged("parse_manual", {
        chars: text.length,
      }, () => parseManualPrompts(text)),
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
      estimateRunCost: async (input) => batchEngine.estimate(input, await fxService.getUsdPkrRate()),
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
        filePath: await exportService.export(sessionId, { pickPath: Boolean(pickPath) }),
      })),
      exportRunZip: async ({ runId, pickPath }) => logged("export_run", { runId }, async () => ({
        filePath: await exportService.exportRun(runId, { pickPath: Boolean(pickPath) }),
      })),
      getDiagnosticLogs: ({ limit, query, event }) => diagnosticLog.read({ limit, query, event }),
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
        const result = await readClipboardImages(maxCount ?? APP_LIMITS.maxReferences);
        await diagnosticLog.write("clipboard_images", {
          ok: result.images.length > 0 && !result.error,
          count: result.images.length,
          error: result.error,
        });
        return result;
      },
      listConverterSessionImages: () => converterService.listSessionImages(),
      convertImages: ({ inputs, options }) => logged("converter_convert", {
        count: inputs.length,
        defaultFormat: options.defaultFormat,
      }, () => converterService.convert(inputs, options)),
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

batchEngine.setProgressSink((telemetry) => {
  try {
    rpc.send.sessionProgress(telemetry);
  } catch {
    // Transport may not be ready during early startup.
  }
});

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 840;

const mainWindow = new BrowserWindow({
  title: `${brand.appName} ${brand.version}`,
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT - 1,
    x: 40,
    y: 16,
  },
});
batchEngine.startScheduler();

setTimeout(() => mainWindow.setSize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT), 1_500);

mainWindow.on("resize", (event: unknown) => {
  const size = (event as { data?: { width?: number; height?: number } }).data;
  if (typeof size?.width !== "number" || typeof size.height !== "number") return;

  const width = Math.max(900, Math.round(size.width));
  const height = Math.max(640, Math.round(size.height));
  if (width !== size.width || height !== size.height) {
    mainWindow.setSize(width, height);
  }
});

console.log(`${brand.appName} ${brand.version} started`);
console.log(`Data directory: ${dataDirectory}`);
