import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { join } from "node:path";
import type { AppRPC, BrandTheme } from "../shared/contracts";
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
  throw new Error("BulkImg Studio 1.0.0-beta supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "1.0.0-beta",
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

const assetRoots = [
  join(process.cwd(), "assets"),
  join(process.cwd(), "..", "Resources", "app", "views", "assets"),
];

const dataDirectory = Utils.paths.userData;
const diagnosticLog = new DiagnosticLog(dataDirectory);
const cleanedFiles = cleanupStaleTemporaryFiles(dataDirectory);
void diagnosticLog.write("startup", { cleanedFiles, version: "1.0.0-beta" });
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

const rpc = BrowserView.defineRPC<AppRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getBootstrap: async () => ({
        brand,
        models,
        keyCount: keyVault.listSafe().filter((key) => key.isActive).length,
        platform: `${process.platform}-${process.arch}`,
        fxRate: await fxService.getUsdPkrRate(),
      }),
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
      listSessions: () => database.listSessions(),
      listHistory: () => historyService.list(),
      getHistoryImage: async ({ assetId }) => ({ dataUrl: await historyService.imageDataUrl(assetId) }),
      downloadHistoryAsset: ({ assetId }) => ({ filePath: historyService.download(assetId) }),
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
    // A one-pixel follow-up resize below makes Electrobun sync the webview to
    // the Windows client area instead of treating the outer frame as content.
    height: DEFAULT_WINDOW_HEIGHT - 1,
    x: 40,
    y: 16,
  },
});
batchEngine.startScheduler();

setTimeout(() => mainWindow.setSize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT), 1_500);

// Electrobun's native webview can become partially uncovered at very small
// Windows sizes. Keep the responsive utility inside its tested desktop range.
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
