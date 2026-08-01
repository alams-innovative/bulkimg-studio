export type BrandTheme = {
  appName: string;
  version: string;
  logoPath: string;
  iconPath: string;
  accentColor: string;
  accentSecondary: string;
  themeMode: string;
};

export type PromptCell = {
  id: string;
  week: string;
  scheduleDate: string;
  themeColumn: string;
  promptText: string;
  disabled: boolean;
  disabledReason?: string;
};

export type PromptMatrix = {
  sourceName: string;
  columns: string[];
  cells: PromptCell[];
  warnings: string[];
};

export type RunMode = "batch" | "direct";
export type SessionStatus = "pending" | "processing" | "completed" | "failed";

export type BatchPrompt = Pick<PromptCell, "promptText" | "week" | "scheduleDate" | "themeColumn">;

export type SubmitRunInput = {
  prompts: BatchPrompt[];
  model: string;
  mode: RunMode;
  size: string;
  quality: "low" | "medium" | "high";
  referenceImageFileId?: string;
};

export type SessionTelemetry = {
  sessionId: string;
  status: SessionStatus;
  totalPrompts: number;
  completedCount: number;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPkr: number;
  fxRate: number;
  message: string;
};

export type ApiKeyStats = {
  id: string;
  label: string;
  keyHint: string;
  provider: "OpenAI";
  isActive: boolean;
  isRateLimited: boolean;
  rateLimitedUntil: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  totalRequests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPkr: number;
  currentSessionId: string | null;
  currentModel: string | null;
  currentRunMode: RunMode | null;
  currentStatus: SessionStatus | null;
  currentPrompts: number;
  currentCompleted: number;
};

export type SessionSummary = {
  sessionId: string;
  status: SessionStatus;
  model: string;
  runMode: RunMode;
  totalPrompts: number;
  completedCount: number;
  costUsd: number;
  costPkr: number;
  startTime: string;
  endTime: string | null;
  keyLabel: string | null;
};

export type ExportSummary = {
  name: string;
  filePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type HistoryItem = {
  promptId: string;
  assetId: string | null;
  sessionId: string;
  promptText: string;
  week: string;
  scheduleDate: string;
  themeColumn: string;
  model: string;
  status: SessionStatus;
  createdAt: string;
  imageFilename: string | null;
  hasImage: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPkr: number;
};

export type AppBootstrap = {
  brand: BrandTheme;
  models: {
    defaultModel: string;
    models: Array<{
      id: string;
      label: string;
      enabled: boolean;
      maxResolution: string;
      ratios: string[];
      features: string[];
    }>;
  };
  keyCount: number;
  platform: string;
};

export type AppRPC = {
  bun: {
    requests: {
      getBootstrap: { params: {}; response: AppBootstrap };
      importCSV: { params: { csvText: string; sourceName: string }; response: PromptMatrix };
      parseManualPrompts: { params: { text: string }; response: PromptMatrix };
      submitBatchRun: { params: SubmitRunInput; response: SessionTelemetry };
      pollBatchStatus: { params: { sessionId: string }; response: SessionTelemetry };
      listApiKeys: { params: {}; response: ApiKeyStats[] };
      addApiKey: { params: { label: string; key: string }; response: { id: string; label: string; isActive: boolean } };
      setApiKeyActive: { params: { id: string; isActive: boolean }; response: { success: boolean } };
      deleteApiKey: { params: { id: string }; response: { success: boolean } };
      listSessions: { params: {}; response: SessionSummary[] };
      listHistory: { params: {}; response: HistoryItem[] };
      getHistoryImage: { params: { assetId: string }; response: { dataUrl: string } };
      downloadHistoryAsset: { params: { assetId: string }; response: { filePath: string } };
      deleteHistoryItem: { params: { promptId: string }; response: { success: boolean } };
      clearHistory: { params: {}; response: { deletedPrompts: number; deletedAssets: number } };
      listExports: { params: {}; response: ExportSummary[] };
      revealExportsFolder: { params: {}; response: { directory: string } };
      exportSessionZip: { params: { sessionId: string }; response: { filePath: string } };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      sessionProgress: SessionTelemetry;
    };
  };
};
