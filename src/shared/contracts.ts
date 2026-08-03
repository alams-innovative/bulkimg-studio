import type { OutputFormatId } from "./output-formats";

export type { OutputFormatId } from "./output-formats";

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
  weekStartDate: string;
  dayLabel: string;
  scheduleDate: string;
  themeColumn: string;
  promptText: string;
  disabled: boolean;
  disabledReason?: string;
};

export type PromptGroup = {
  id: string;
  label: string;
  startDate: string;
  cellIds: string[];
};

export type PromptMatrix = {
  sourceName: string;
  columns: string[];
  cells: PromptCell[];
  groups: PromptGroup[];
  warnings: string[];
};

export type RunMode = "batch" | "direct";
export type QualityTier = "low" | "medium" | "high";
export type SessionStatus = "pending" | "processing" | "partial" | "completed" | "failed" | "cancelled";
export type PromptStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type FailureCategory = "auth" | "rate_limit" | "validation" | "timeout" | "cancelled" | "provider" | "network" | "unknown";

export type SanitizedProviderError = {
  message: string;
  category: FailureCategory;
  httpStatus: number | null;
  requestId: string | null;
  retryAt: string | null;
};

export type BatchPrompt = Pick<PromptCell, "promptText" | "week" | "scheduleDate" | "themeColumn">;

export type SubmitRunInput = {
  prompts: BatchPrompt[];
  model: string;
  mode: RunMode;
  format: OutputFormatId;
  quality: QualityTier;
  referenceImageFileIds?: string[];
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
  runMode: RunMode;
  format: OutputFormatId;
  quality: QualityTier;
  retryableCount: number;
  diagnosticId: string;
  lastError: SanitizedProviderError | null;
  nextPollAt: string | null;
};

export type CostEstimate = {
  costUsd: number;
  costPkr: number;
  fxRate: number;
  pricingVersion: string;
  isEstimate: true;
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
  format: OutputFormatId;
  quality: QualityTier;
  retryableCount: number;
  diagnosticId: string;
  lastError: SanitizedProviderError | null;
};

export type SessionPromptOutcome = {
  promptId: string;
  ordinal: number;
  promptText: string;
  status: PromptStatus;
  error: SanitizedProviderError | null;
  attempts: number;
  hasImage: boolean;
};

export type SessionDetail = {
  telemetry: SessionTelemetry;
  prompts: SessionPromptOutcome[];
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
  fxRate: number;
};

export type DiagnosticLogView = {
  lines: string[];
  path: string;
  events: string[];
  total: number;
};

export type AppRPC = {
  bun: {
    requests: {
      getBootstrap: { params: {}; response: AppBootstrap };
      importCSV: { params: { csvText: string; sourceName: string }; response: PromptMatrix };
      parseManualPrompts: { params: { text: string }; response: PromptMatrix };
      pickCsvFile: { params: {}; response: { csvText: string; sourceName: string } | null };
      submitBatchRun: { params: SubmitRunInput; response: SessionTelemetry };
      pollBatchStatus: { params: { sessionId: string }; response: SessionTelemetry };
      getSessionDetail: { params: { sessionId: string; refresh?: boolean }; response: SessionDetail };
      cancelBatchRun: { params: { sessionId: string }; response: SessionTelemetry };
      retryFailedPrompts: { params: { sessionId: string }; response: SessionTelemetry };
      estimateRunCost: {
        params: {
          model: string;
          promptCount: number;
          mode: RunMode;
          quality: QualityTier;
          format: OutputFormatId;
          referenceCount: number;
        };
        response: CostEstimate;
      };
      uploadReferenceImage: {
        params: { dataBase64: string; filename: string; mimeType: string };
        response: { fileId: string };
      };
      removeReferenceImage: { params: { fileId: string }; response: { success: boolean } };
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
      exportSessionZip: { params: { sessionId: string; pickPath?: boolean }; response: { filePath: string | null } };
      getDiagnosticLogs: {
        params: { limit?: number; query?: string; event?: string };
        response: DiagnosticLogView;
      };
      revealLogsFolder: { params: {}; response: { directory: string } };
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
