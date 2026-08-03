import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { join } from "node:path";
import type { AppRPC, BrandTheme } from "../shared/contracts";
import { AppDatabase } from "./database";
import { BatchEngine } from "./services/batch-engine";
import { ExportService } from "./services/export-service";
import { FxService } from "./services/fx-service";
import { HistoryService } from "./services/history-service";
import { KeyVault } from "./services/key-vault";
import { parseCSV, parseManualPrompts } from "./services/prompt-parser";

if (process.platform !== "win32") {
  throw new Error("BulkImg Studio 2.0.0 supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "2.0.0",
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
const database = new AppDatabase(dataDirectory);
const keyVault = new KeyVault(database, dataDirectory);
const fxService = new FxService(database);
const historyService = new HistoryService(database, dataDirectory, Utils.paths.downloads);
const batchEngine = new BatchEngine(database, keyVault, fxService, historyService);
const exportService = new ExportService(database, dataDirectory);

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
      getBootstrap: () => ({
        brand,
        models,
        keyCount: keyVault.listSafe().filter((key) => key.isActive).length,
        platform: `${process.platform}-${process.arch}`,
      }),
      importCSV: ({ csvText, sourceName }) => parseCSV(csvText, sourceName),
      parseManualPrompts: ({ text }) => parseManualPrompts(text),
      submitBatchRun: (input) => batchEngine.submit(input),
      pollBatchStatus: ({ sessionId }) => batchEngine.poll(sessionId),
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
      exportSessionZip: async ({ sessionId }) => ({ filePath: await exportService.export(sessionId) }),
    },
    messages: {},
  },
});

const mainWindow = new BrowserWindow({
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

// Electrobun's native webview can become partially uncovered at very small
// Windows sizes. Keep the utility usable and let the responsive single-column
// layout take over before controls become cramped.
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
