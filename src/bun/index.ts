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

if (process.platform !== "win32") {
  throw new Error("BulkImg Studio 1.0.0 beta supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "1.0.0 beta",
  logoPath: "views://assets/brand/logo.svg",
  iconPath: "/assets/brand/app_icon.ico",
  accentColor: "#38bdf8",
  accentSecondary: "#34d399",
  themeMode: "liquid-glass-dark",
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
const database = new AppDatabase(dataDirectory);
const keyVault = new KeyVault(database, dataDirectory);
const fxService = new FxService(database);
const historyService = new HistoryService(database, dataDirectory, Utils.paths.downloads);
const pricingService = new PricingService(assetRoots);
await pricingService.load();
const batchEngine = new BatchEngine(database, keyVault, fxService, historyService, pricingService, dataDirectory);
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
      cancelBatchRun: ({ sessionId }) => batchEngine.cancel(sessionId),
      retryFailedPrompts: ({ sessionId }) => batchEngine.retryFailed(sessionId),
      estimateRunCost: async (input) => batchEngine.estimate(input, await fxService.getUsdPkrRate()),
      uploadReferenceImage: async ({ dataBase64, filename, mimeType }) => {
        const bytes = Buffer.from(dataBase64, "base64");
        return batchEngine.uploadReference(new Uint8Array(bytes), filename, mimeType);
      },
      listApiKeys: () => keyVault.listSafe(),
      addApiKey: ({ label, key }) => keyVault.add(label, key),
      setApiKeyActive: ({ id, isActive }) => {
        database.setKeyActive(id, isActive);
        return { success: true };
      },
      deleteApiKey: ({ id }) => {
        database.deleteKey(id);
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

new BrowserWindow({
  title: `${brand.appName} ${brand.version}`,
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 1440,
    height: 900,
    x: 80,
    y: 50,
  },
});

console.log(`${brand.appName} ${brand.version} started`);
console.log(`Data directory: ${dataDirectory}`);
