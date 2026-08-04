import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { join } from "node:path";
import type { AdminConfigView, AppRPC, BrandTheme, RateLimitHeaderProbe, RateLimitSnapshot } from "../shared/contracts";
import { APP_LIMITS } from "../shared/contracts";
import { AppDatabase } from "./database";
import { BatchEngine } from "./services/batch-engine";
import { ExportService } from "./services/export-service";
import { FxService } from "./services/fx-service";
import { HistoryService } from "./services/history-service";
import { KeyVault } from "./services/key-vault";
import { PricingService } from "./services/pricing-service";
import { parseCSV, parseManualPrompts } from "./services/prompt-parser";
import { pickOpenFile } from "./services/windows-native";
import { cleanupStaleTemporaryFiles, DiagnosticLog } from "./services/diagnostics";

if (process.platform !== "win32") {
  throw new Error("BulkImg Studio 1.0.1-beta supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "1.0.1-beta",
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
void diagnosticLog.write("startup", { cleanedFiles, version: "1.0.1-beta" });
const database = new AppDatabase(dataDirectory);
const keyVault = new KeyVault(database, dataDirectory);
const fxService = new FxService(database);
const historyService = new HistoryService(database, dataDirectory, Utils.paths.downloads);
const pricingService = new PricingService(assetRoots);
await pricingService.load();
const batchEngine = new BatchEngine(database, keyVault, fxService, historyService, pricingService, dataDirectory, diagnosticLog);
const exportService = new ExportService(database, dataDirectory);
const recovered = batchEngine.recoverOnStartup();
if (recovered > 0) console.log(`Recovered ${recovered} session(s) after restart.`);

const brand = await readJson(assetRoots.map((root) => join(root, "brand", "theme.json")), fallbackBrand);
const models = await readJson(assetRoots.map((root) => join(root, "config", "models.json")), {
  defaultModel: "gpt-image-2",
  models: [{
    id: "gpt-image-2", label: "GPT Image 2", enabled: true,
    maxResolution: "2048x2048", ratios: ["1:1"], features: ["Image generation"],
  }],
});

const ADMIN_WARNING = "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works with your normal API keys.";

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getBootstrap: async () => {
        const admin = adminView(database);
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
          limits: {
            maxReferences: APP_LIMITS.maxReferences,
            maxReferenceBytes: APP_LIMITS.maxReferenceBytes,
            maxPromptChars: APP_LIMITS.maxPromptChars,
            directPromptLimit: APP_LIMITS.directPromptLimit,
            batchPromptLimit: APP_LIMITS.batchPromptLimit,
          },
        };
      },
      getSettings: () => database.getAppSettings(),
      setSettings: (partial) => database.setAppSettings(partial),
      importCSV: ({ csvText, sourceName }) => parseCSV(csvText, sourceName),
      parseManualPrompts: ({ text }) => parseManualPrompts(text),
      pickCsvFile: async () => {
        const path = await pickOpenFile({
          title: "Import weekly CSV calendar",
          filter: "*.csv",
          filterLabel: "CSV files",
        });
        if (!path) return null;
        const csvText = await Bun.file(path).text();
        const sourceName = path.split(/[/\\]/).pop() || "calendar.csv";
        return { csvText, sourceName };
      },
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
      uploadReferenceImage: async ({ dataBase64, filename, mimeType }) => {
        const bytes = Buffer.from(dataBase64, "base64");
        return batchEngine.uploadReference(new Uint8Array(bytes), filename, mimeType);
      },
      removeReferenceImage: ({ fileId }) => batchEngine.removeReference(fileId),
      listApiKeys: () => keyVault.listSafe(),
      addApiKey: ({ label, key }) => keyVault.add(label, key),
      setApiKeyActive: ({ id, isActive }) => {
        database.setKeyActive(id, isActive);
        keyVault.invalidateKey(id);
        return { success: true };
      },
      deleteApiKey: ({ id }) => {
        database.deleteKey(id);
        keyVault.invalidateKey(id);
        return { success: true };
      },
      setAdminKey: async ({ key, projectId }) => {
        await keyVault.setAdminKey(key, projectId);
        if (projectId || database.getAdminConfigRow().project_id) await keyVault.refreshAdminRateLimits();
        return adminView(database);
      },
      clearAdminKey: () => {
        keyVault.clearAdminKey();
        return adminView(database);
      },
      setAdminProjectId: async ({ projectId }) => {
        database.setAdminProjectId(projectId.trim());
        await keyVault.refreshAdminRateLimits();
        return adminView(database);
      },
      refreshRateLimits: async () => {
        await keyVault.refreshAdminRateLimits();
        return adminView(database);
      },
      listAdminProjects: () => keyVault.listAdminProjects(),
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
      deleteHistoryItem: ({ promptId }) => {
        historyService.deletePrompt(promptId);
        return { success: true };
      },
      clearHistory: () => historyService.clear(),
      listExports: () => exportService.list(),
      revealExportsFolder: () => ({ directory: exportService.revealFolder() }),
      exportSessionZip: async ({ sessionId, pickPath }) => ({
        filePath: await exportService.export(sessionId, { pickPath: Boolean(pickPath) }),
      }),
      exportRunZip: async ({ runId, pickPath }) => ({
        filePath: await exportService.exportRun(runId, { pickPath: Boolean(pickPath) }),
      }),
      getDiagnosticLogs: ({ limit, query, event }) => diagnosticLog.read({ limit, query, event }),
      revealLogsFolder: () => {
        const directory = diagnosticLog.logDirectory;
        Bun.spawn(["explorer.exe", directory], { stdout: "ignore", stderr: "ignore" });
        return { directory };
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
