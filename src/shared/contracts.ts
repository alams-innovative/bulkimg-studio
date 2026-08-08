import type { OutputFormatId } from "./output-formats";
import type { UpdateChannel, UpdateState } from "./update-contracts";

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

/**
 * The local, unsubmitted Generator workspace. References deliberately do not
 * live here: provider files have their own retry-safe lifecycle.
 */
export type GeneratorDraft = {
  matrix: PromptMatrix;
  selectedIds: string[];
  matrixPage: number;
  matrixView: "list" | "cards";
  mode: RunMode;
  model: string;
  format: OutputFormatId;
  quality: QualityTier;
  waveStrategy: "all" | "guided" | "parallel";
  waveSizes: number[];
  updatedAt: string;
};

export type GeneratorDraftInput = Omit<GeneratorDraft, "updatedAt">;
export type SessionStatus = "pending" | "processing" | "partial" | "completed" | "failed" | "cancelled";
export type PromptStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type RunPhase = "queued" | "generating" | "waiting_batch" | "downloading" | "saving" | "done" | "error";

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
  /** 0 = no split (single batch). Default from settings when omitted. */
  waveSize?: number;
  /** How split Batch work should be submitted. */
  waveStrategy?: "all" | "guided" | "parallel";
  /** The first guided batch. Later batches use waveSize. */
  firstWaveSize?: number;
  /** Exact prompt counts for each wave. Must cover every submitted prompt once. */
  waveSizes?: number[];
  parentRunId?: string;
  waveIndex?: number;
  waveCount?: number;
};

export type AppSettings = {
  waveSize: number;
  firstWaveSize: number;
};

export type RateLimitSnapshot = {
  model: string;
  maxImagesPerMinute: number | null;
  maxTokensPerMinute: number | null;
  maxRequestsPerMinute: number | null;
  batchDayMaxInputTokens: number | null;
  fetchedAt: string;
};

export type RateLimitHeaderProbe = {
  limitRequests: number | null;
  remainingRequests: number | null;
  limitTokens: number | null;
  remainingTokens: number | null;
  limitImages: number | null;
  remainingImages: number | null;
  resetRequests: string | null;
  resetTokens: string | null;
  limitProjectTokens: number | null;
  remainingProjectTokens: number | null;
  resetProjectTokens: string | null;
  capturedAt: string;
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
  parentRunId: string | null;
  waveIndex: number | null;
  waveCount: number | null;
  estimateUsd: number;
  etaMs: number | null;
  phase: RunPhase;
  durationMs?: {
    submit?: number | null;
    remote?: number | null;
    download?: number | null;
    persist?: number | null;
  };
};

export type CostEstimate = {
  costUsd: number;
  costPkr: number;
  fxRate: number;
  pricingVersion: string;
  isEstimate: true;
};

export type ImageTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  inputTextTokens: number;
  inputImageTokens: number;
  cachedTextInputTokens: number;
  cachedImageInputTokens: number;
  outputImageTokens: number;
  outputTextTokens: number;
};

export type PricingView = {
  version: string;
  source: string;
  batchDiscount: number;
  imageEstimatesUsd: Record<OutputFormatId, Record<QualityTier, number>>;
  referenceInputEstimateUsd: number;
  textInputTokenUsd: number;
  imageInputTokenUsd: number;
  cachedTextInputTokenUsd: number;
  cachedImageInputTokenUsd: number;
  imageOutputTokenUsd: number;
};

export type UsageTotals = {
  requestCount: number;
  completedCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costPkr: number;
};

export type UsageSummary = {
  scope: "this_app";
  range: {
    startAt: string | null;
    endAt: string;
  };
  generatedAt: string;
  total: UsageTotals;
  direct: UsageTotals;
  batch: UsageTotals;
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
  parentRunId: string | null;
  waveIndex: number | null;
  estimateUsd: number;
  elapsedMs: number;
};

export type RunSummary = {
  runId: string;
  status: SessionStatus;
  model: string;
  runMode: RunMode;
  totalPrompts: number;
  completedCount: number;
  costUsd: number;
  costPkr: number;
  estimateUsd: number;
  waveSize: number;
  waveCount: number;
  waveStrategy: "all" | "guided" | "parallel";
  startTime: string;
  message: string;
  format: OutputFormatId;
  quality: QualityTier;
  diagnosticId: string;
  sessions: SessionSummary[];
};

export type SessionPromptOutcome = {
  promptId: string;
  ordinal: number;
  promptText: string;
  status: PromptStatus;
  error: SanitizedProviderError | null;
  attempts: number;
  hasImage: boolean;
  durationMs: number | null;
  costUsd: number;
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

export type ConverterFormat = "png" | "jpg" | "webp" | "avif" | "tiff" | "bmp";
export type ConverterQuality = "smallest" | "balanced" | "best";
export type ConverterSourceKind = "session" | "upload" | "clipboard";
export type ConverterRule =
  | { id: string; type: "nth"; every: number; format: ConverterFormat }
  | { id: string; type: "odd" | "even"; format: ConverterFormat }
  | { id: string; type: "range"; start: number; end: number; format: ConverterFormat }
  | { id: string; type: "cycle"; formats: ConverterFormat[] };

export type ConverterOptions = {
  defaultFormat: ConverterFormat;
  quality: ConverterQuality;
  width: number | null;
  height: number | null;
  fit: "inside" | "cover" | "fill";
  stripMetadata: boolean;
  background: string;
  prefix: string;
  rules: ConverterRule[];
  overrides: Record<string, ConverterFormat>;
};

export type ConverterInput =
  | { clientId: string; sourceKind: "session"; assetId: string; name: string }
  | { clientId: string; sourceKind: "upload" | "clipboard"; name: string; dataBase64: string };

export type ConverterSourceImage = {
  assetId: string;
  sessionId: string;
  name: string;
  createdAt: string;
};

export type ConverterImageProperties = {
  name: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  channels: number | null;
  bitDepth: string | null;
  colorSpace: string | null;
  hasAlpha: boolean;
  density: number | null;
  orientation: number | null;
  pages: number | null;
  hasExif: boolean;
  hasIcc: boolean;
};

export type ConverterJobItem = {
  id: string;
  ordinal: number;
  sourceKind: ConverterSourceKind;
  sourceName: string;
  outputName: string | null;
  format: ConverterFormat;
  status: "completed" | "failed";
  error: string | null;
  properties: ConverterImageProperties | null;
};

export type ConverterJob = {
  id: string;
  createdAt: string;
  status: "completed" | "partial" | "failed";
  totalCount: number;
  completedCount: number;
  options: ConverterOptions;
  items: ConverterJobItem[];
};

export type HistoryItem = {
  promptId: string;
  assetId: string | null;
  sessionId: string;
  parentRunId: string | null;
  waveIndex: number | null;
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
  runMode: RunMode;
};

export type AdminConfigView = {
  configured: boolean;
  projectId: string | null;
  keyHint: string | null;
  rateLimits: RateLimitSnapshot | null;
  lastError: string | null;
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
  settings: AppSettings;
  admin: AdminConfigView;
  adminWarning: string | null;
  rateHeaderProbe: RateLimitHeaderProbe | null;
  pricing: PricingView;
  limits: {
    maxReferences: number;
    maxReferenceBytes: number;
    maxPromptChars: number;
    directPromptLimit: number;
    batchPromptLimit: number;
  };
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
      getSettings: { params: {}; response: AppSettings };
      setSettings: { params: Partial<AppSettings>; response: AppSettings };
      importCSV: { params: { csvText: string; sourceName: string }; response: PromptMatrix };
      parseManualPrompts: { params: { text: string }; response: PromptMatrix };
      getGeneratorDraft: { params: {}; response: GeneratorDraft | null };
      saveGeneratorDraft: { params: GeneratorDraftInput; response: GeneratorDraft };
      clearGeneratorDraft: { params: {}; response: { success: boolean } };
      getUpdateState: { params: {}; response: UpdateState };
      checkForUpdates: { params: {}; response: UpdateState };
      setUpdateChannel: { params: { channel: UpdateChannel }; response: UpdateState };
      downloadUpdate: { params: { version: string }; response: UpdateState };
      installUpdate: { params: { version: string }; response: { scheduled: true } };
      pickCsvFile: { params: {}; response: { csvText: string; sourceName: string } | null };
      submitBatchRun: { params: SubmitRunInput; response: SessionTelemetry };
      pollBatchStatus: { params: { sessionId: string }; response: SessionTelemetry };
      getSessionDetail: { params: { sessionId: string; refresh?: boolean }; response: SessionDetail };
      cancelBatchRun: { params: { sessionId: string }; response: SessionTelemetry };
      retryFailedPrompts: { params: { sessionId: string }; response: SessionTelemetry };
      resumeRun: { params: { runId?: string; sessionId?: string }; response: SessionTelemetry };
      continueRun: { params: { runId: string }; response: SessionTelemetry };
      cancelRemainingWaves: { params: { runId: string }; response: RunSummary };
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
      getUsageSummary: {
        params: { startAt?: string | null; endAt?: string | null };
        response: UsageSummary;
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
      setAdminKey: { params: { key: string; projectId?: string }; response: AdminConfigView };
      clearAdminKey: { params: {}; response: AdminConfigView };
      setAdminProjectId: { params: { projectId: string }; response: AdminConfigView };
      refreshRateLimits: { params: {}; response: AdminConfigView };
      listAdminProjects: { params: {}; response: Array<{ id: string; name: string }> };
      listSessions: { params: {}; response: SessionSummary[] };
      listRuns: { params: {}; response: RunSummary[] };
      getRunDetail: { params: { runId: string }; response: RunSummary };
      listHistory: { params: {}; response: HistoryItem[] };
      getHistoryImage: { params: { assetId: string }; response: { dataUrl: string } };
      downloadHistoryAsset: { params: { assetId: string }; response: { filePath: string } };
      revealHistoryAsset: { params: { assetId: string }; response: { filePath: string } };
      revealHistorySessionFolder: { params: { sessionId: string }; response: { directory: string } };
      deleteHistoryItem: { params: { promptId: string }; response: { success: boolean } };
      clearHistory: { params: {}; response: { deletedPrompts: number; deletedAssets: number } };
      listExports: { params: {}; response: ExportSummary[] };
      revealExportsFolder: { params: {}; response: { directory: string } };
      exportSessionZip: { params: { sessionId: string; pickPath?: boolean }; response: { filePath: string | null } };
      exportRunZip: { params: { runId: string; pickPath?: boolean }; response: { filePath: string | null } };
      exportSelectedHistoryZip: { params: { assetIds: string[]; pickPath?: boolean }; response: { filePath: string | null } };
      getDiagnosticLogs: {
        params: { limit?: number; query?: string; event?: string };
        response: DiagnosticLogView;
      };
      revealLogsFolder: { params: {}; response: { directory: string } };
      writeDiagnosticLog: {
        params: { event: string; fields?: Record<string, unknown> };
        response: { success: true };
      };
      readClipboardCsv: {
        params: {};
        response: { text: string | null; sourceName: string | null; error: string | null };
      };
      readClipboardImages: {
        params: { maxCount?: number };
        response: {
          images: Array<{ filename: string; mimeType: string; dataBase64: string }>;
          error: string | null;
        };
      };
      listConverterSessionImages: { params: {}; response: ConverterSourceImage[] };
      convertImages: {
        params: { inputs: ConverterInput[]; options: ConverterOptions };
        response: ConverterJob;
      };
      listConverterJobs: { params: {}; response: ConverterJob[] };
      getConverterOutput: { params: { jobId: string; itemId: string }; response: { dataUrl: string } };
      getConverterProperties: { params: { jobId: string; itemId: string }; response: ConverterImageProperties };
      getConverterSourceProperties: { params: { input: ConverterInput }; response: ConverterImageProperties };
      copyConverterOutput: { params: { jobId: string; itemId: string }; response: { success: true } };
      copyConverterFiles: { params: { jobId: string; itemIds: string[] }; response: { success: true } };
      saveConverterOutputs: { params: { jobId: string; itemIds: string[] }; response: { directory: string | null; saved: number } };
      deleteConverterJob: { params: { jobId: string }; response: { success: true } };
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

export const APP_LIMITS = {
  maxReferences: 16,
  maxReferenceBytes: 50 * 1024 * 1024,
  maxPromptChars: 32_000,
  directPromptLimit: 4,
  batchPromptLimit: 1_000,
  defaultWaveSize: 50,
} as const;
