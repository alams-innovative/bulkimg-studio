import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import { join } from "node:path";
import type { AppRPC, BrandTheme } from "../shared/contracts";
import { AppDatabase } from "./database";
import { BatchEngine } from "./services/batch-engine";
import { ExportService } from "./services/export-service";
import { FxService } from "./services/fx-service";
import { KeyVault } from "./services/key-vault";
import { parseCSV, parseManualPrompts } from "./services/prompt-parser";

if (process.platform !== "win32") {
  throw new Error("BulkImg Studio 2.0.0 supports Windows 10 and Windows 11 only.");
}

const fallbackBrand: BrandTheme = {
  appName: "BulkImg Studio",
  version: "2.0.0",
  logoPath: "/assets/brand/logo.svg",
  iconPath: "/assets/brand/app_icon.ico",
  accentColor: "#38bdf8",
  accentSecondary: "#34d399",
  themeMode: "liquid-glass-dark",
};

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return await Bun.file(path).json() as T;
  } catch {
    return fallback;
  }
}

const dataDirectory = Utils.paths.userData;
const database = new AppDatabase(dataDirectory);
const keyVault = new KeyVault(database, dataDirectory);
const fxService = new FxService(database);
const batchEngine = new BatchEngine(database, keyVault, fxService);
const exportService = new ExportService(database, dataDirectory);

const brand = await readJson(join(process.cwd(), "assets", "brand", "theme.json"), fallbackBrand);
const models = await readJson(join(process.cwd(), "assets", "config", "models.json"), {
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
      exportSessionZip: async ({ sessionId }) => ({ filePath: await exportService.export(sessionId) }),
    },
    messages: {},
  },
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
