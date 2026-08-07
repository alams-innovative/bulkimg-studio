import Electrobun, { Electroview } from "electrobun/view";
import { animate } from "motion/mini";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock3,
  Copy,
  createIcons,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  ImagePlus,
  Image,
  Images,
  Info,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Moon,
  MoreHorizontal,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Repeat2,
  Rows3,
  ScrollText,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from "lucide";
import type {
  AdminConfigView,
  ApiKeyStats,
  AppBootstrap,
  AppRPC,
  ConverterFormat,
  ConverterInput,
  ConverterJob,
  ConverterOptions,
  ConverterRule,
  ConverterSourceImage,
  ExportSummary,
  HistoryItem,
  PromptCell,
  PromptGroup,
  PromptMatrix,
  PricingView,
  RunMode,
  RunSummary,
  SessionDetail,
  SessionPromptOutcome,
  SessionSummary,
  SessionTelemetry,
  UsageSummary,
  UsageTotals,
} from "../shared/contracts";
import { APP_LIMITS } from "../shared/contracts";
import { OUTPUT_FORMATS, type OutputFormatId } from "../shared/output-formats";

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {},
    messages: {
      sessionProgress: (telemetry) => {
        renderTelemetry(telemetry);
      },
    },
  },
});
const app = new Electrobun.Electroview({ rpc });

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const elements = {
  brandName: byId("brand-name"),
  brandVersion: byId("brand-version"),
  platform: byId("platform"),
  keyCount: byId("key-count"),
  themeToggle: byId<HTMLButtonElement>("theme-toggle"),
  themeLabel: byId("theme-label"),
  pageTitle: byId("page-title"),
  headerStats: byId("header-stats"),
  generatorView: byId("generator-view"),
  sessionsView: byId("sessions-view"),
  usageView: byId("usage-view"),
  historyView: byId("history-view"),
  exportsView: byId("exports-view"),
  logsView: byId("logs-view"),
  converterView: byId("converter-view"),
  converterTabWorkspace: byId<HTMLButtonElement>("converter-tab-workspace"),
  converterTabHistory: byId<HTMLButtonElement>("converter-tab-history"),
  converterWorkspace: byId("converter-workspace"),
  converterHistory: byId("converter-history"),
  converterGrid: byId("converter-grid"),
  converterControls: byId("converter-controls"),
  converterQueueTitle: byId("converter-queue-title"),
  converterQueueSubtitle: byId("converter-queue-subtitle"),
  converterSessionSources: byId("converter-session-sources"),
  converterSessionCards: byId<HTMLButtonElement>("converter-session-cards"),
  converterSessionListMode: byId<HTMLButtonElement>("converter-session-list-mode"),
  converterSessionSelection: byId("converter-session-selection"),
  converterSessionAddInline: byId<HTMLButtonElement>("converter-session-add-inline"),
  converterDropzone: byId("converter-dropzone"),
  converterFile: byId<HTMLInputElement>("converter-file"),
  converterFromSession: byId<HTMLButtonElement>("converter-from-session"),
  converterBrowse: byId<HTMLButtonElement>("converter-browse"),
  converterPaste: byId<HTMLButtonElement>("converter-paste"),
  converterQueue: byId("converter-queue"),
  converterQueueColumns: byId("converter-queue-columns"),
  converterFormats: byId("converter-formats"),
  converterRulesToggle: byId<HTMLButtonElement>("converter-rules-toggle"),
  converterRules: byId("converter-rules"),
  converterRuleType: byId<HTMLSelectElement>("converter-rule-type"),
  converterRuleValue: byId<HTMLInputElement>("converter-rule-value"),
  converterRuleFormat: byId<HTMLSelectElement>("converter-rule-format"),
  converterAddRule: byId<HTMLButtonElement>("converter-add-rule"),
  converterRuleList: byId("converter-rule-list"),
  converterOptionsToggle: byId<HTMLButtonElement>("converter-options-toggle"),
  converterOptions: byId("converter-options"),
  converterQuality: byId<HTMLSelectElement>("converter-quality"),
  converterWidth: byId<HTMLInputElement>("converter-width"),
  converterHeight: byId<HTMLInputElement>("converter-height"),
  converterFit: byId<HTMLSelectElement>("converter-fit"),
  converterBackground: byId<HTMLInputElement>("converter-background"),
  converterPrefix: byId<HTMLInputElement>("converter-prefix"),
  converterStripMetadata: byId<HTMLInputElement>("converter-strip-metadata"),
  converterRun: byId<HTMLButtonElement>("converter-run"),
  converterResult: byId("converter-result"),
  converterSessionDialog: byId<HTMLDialogElement>("converter-session-dialog"),
  converterSessionList: byId("converter-session-list"),
  converterSessionAdd: byId<HTMLButtonElement>("converter-session-add"),
  converterPropertiesDialog: byId<HTMLDialogElement>("converter-properties-dialog"),
  converterPropertiesSubtitle: byId("converter-properties-subtitle"),
  converterPropertiesList: byId("converter-properties-list"),
  refreshLogs: byId<HTMLButtonElement>("refresh-logs"),
  copyLogs: byId<HTMLButtonElement>("copy-logs"),
  openLogsFolder: byId<HTMLButtonElement>("open-logs-folder"),
  logsEvent: byId<HTMLSelectElement>("logs-event"),
  logsSearch: byId<HTMLInputElement>("logs-search"),
  logsCount: byId("logs-count"),
  logsList: byId("logs-list"),
  logsPath: byId("logs-path"),
  selectedCount: byId("selected-count"),
  selectedChip: byId("selected-chip"),
  estimatedCost: byId("estimated-cost"),
  estimateBox: byId("estimate-box"),
  fxRate: byId("fx-rate"),
  appShell: byId("app-shell"),
  sidebar: byId("sidebar"),
  sidebarToggle: byId<HTMLButtonElement>("sidebar-toggle"),
  waveSizeField: byId("wave-size-field"),
  toastMessage: byId("toast-message"),
  toastTimerLabel: byId("toast-timer"),
  toastClose: byId<HTMLButtonElement>("toast-close"),
  toastProgress: byId("toast-progress"),
  csvTab: byId<HTMLButtonElement>("csv-tab"),
  manualTab: byId<HTMLButtonElement>("manual-tab"),
  csvPanel: byId("csv-panel"),
  manualPanel: byId("manual-panel"),
  csvFile: byId<HTMLInputElement>("csv-file"),
  pickCsvNative: byId<HTMLButtonElement>("pick-csv-native"),
  manualPrompts: byId<HTMLTextAreaElement>("manual-prompts"),
  parseManual: byId<HTMLButtonElement>("parse-manual"),
  deleteSelectedPrompts: byId<HTMLButtonElement>("delete-selected-prompts"),
  clearImportedPrompts: byId<HTMLButtonElement>("clear-imported-prompts"),
  sourceName: byId("source-name"),
  sourceSummary: byId("source-summary"),
  warnings: byId("warnings"),
  matrix: byId("prompt-matrix"),
  model: byId<HTMLSelectElement>("model"),
  size: byId<HTMLSelectElement>("size"),
  quality: byId<HTMLSelectElement>("quality"),
  referenceControl: byId("reference-control"),
  referenceDock: byId<HTMLButtonElement>("reference-dock"),
  referenceFile: byId<HTMLInputElement>("reference-file"),
  referenceTitle: byId("reference-title"),
  referenceHint: byId("reference-hint"),
  referenceBadge: byId("reference-badge"),
  referenceList: byId("reference-list"),
  referenceStatus: byId("reference-status"),
  runButton: byId<HTMLButtonElement>("run-button"),
  cancelButton: byId<HTMLButtonElement>("cancel-button"),
  resumeButton: byId<HTMLButtonElement>("resume-button"),
  manageKeys: byId<HTMLButtonElement>("manage-keys"),
  keysDialog: byId<HTMLDialogElement>("keys-dialog"),
  refreshKeys: byId<HTMLButtonElement>("refresh-keys"),
  keyList: byId("key-list"),
  activeKeyTotal: byId("active-key-total"),
  keyRequestTotal: byId("key-request-total"),
  keyTokenTotal: byId("key-token-total"),
  keySpendTotal: byId("key-spend-total"),
  keyForm: byId<HTMLFormElement>("key-form"),
  keyLabel: byId<HTMLInputElement>("key-label"),
  apiKey: byId<HTMLInputElement>("api-key"),
  keyError: byId("key-error"),
  keyPanelGeneration: byId("key-panel-generation"),
  keyPanelAdmin: byId("key-panel-admin"),
  keyTypeGeneration: byId<HTMLButtonElement>("key-type-generation"),
  keyTypeAdmin: byId<HTMLButtonElement>("key-type-admin"),
  adminForm: byId<HTMLFormElement>("admin-form"),
  adminManageForm: byId<HTMLFormElement>("admin-manage-form"),
  adminKey: byId<HTMLInputElement>("admin-key"),
  adminProject: byId<HTMLInputElement>("admin-project"),
  adminProjectNew: byId<HTMLInputElement>("admin-project-new"),
  adminProjectList: byId<HTMLDataListElement>("admin-project-list"),
  adminStatus: byId("admin-status"),
  adminLimitsPreview: byId("admin-limits-preview"),
  adminConfigured: byId("admin-configured"),
  adminEdit: byId("admin-edit"),
  adminSavedHint: byId("admin-saved-hint"),
  adminSavedMeta: byId("admin-saved-meta"),
  adminSaveLabel: byId("admin-save-label"),
  genTabCount: byId("gen-tab-count"),
  adminTabBadge: byId("admin-tab-badge"),
  loadAdminProjects: byId<HTMLButtonElement>("load-admin-projects"),
  refreshLimits: byId<HTMLButtonElement>("refresh-limits"),
  clearAdmin: byId<HTMLButtonElement>("clear-admin"),
  editAdminKey: byId<HTMLButtonElement>("edit-admin-key"),
  cancelAdminEdit: byId<HTMLButtonElement>("cancel-admin-edit"),
  pasteCsv: byId<HTMLButtonElement>("paste-csv"),
  pasteReference: byId<HTMLButtonElement>("paste-reference"),
  pickReference: byId<HTMLButtonElement>("pick-reference"),
  sessionStatus: byId("session-status"),
  sessionMessage: byId("session-message"),
  elapsed: byId("elapsed"),
  eta: byId("eta"),
  progress: byId("progress"),
  progressBar: byId("progress-bar"),
  sessionCost: byId("session-cost"),
  exportButton: byId<HTMLButtonElement>("export-button"),
  previewSession: byId<HTMLButtonElement>("preview-session"),
  retryButton: byId<HTMLButtonElement>("retry-button"),
  refreshSessions: byId<HTMLButtonElement>("refresh-sessions"),
  sessionList: byId("session-list"),
  usageRange: byId<HTMLSelectElement>("usage-range"),
  refreshUsage: byId<HTMLButtonElement>("refresh-usage"),
  usageStatus: byId("usage-status"),
  usageSummaryGrid: byId("usage-summary-grid"),
  usageModeComparison: byId("usage-mode-comparison"),
  usageBatchDiscount: byId("usage-batch-discount"),
  usageLimits: byId("usage-limits"),
  usageRefreshLimits: byId<HTMLButtonElement>("usage-refresh-limits"),
  usageOpenKeys: byId<HTMLButtonElement>("usage-open-keys"),
  usagePricingMeta: byId("usage-pricing-meta"),
  usagePricing: byId("usage-pricing"),
  refreshHistory: byId<HTMLButtonElement>("refresh-history"),
  clearHistory: byId<HTMLButtonElement>("clear-history"),
  libraryDownloadSelected: byId<HTMLButtonElement>("library-download-selected"),
  libraryDeleteSelected: byId<HTMLButtonElement>("library-delete-selected"),
  librarySelection: byId("library-selection"),
  historySearch: byId<HTMLInputElement>("history-search"),
  historyFilter: byId<HTMLSelectElement>("history-filter"),
  historyCount: byId("history-count"),
  historyList: byId("history-list"),
  lightbox: byId("lightbox"),
  lightboxImage: byId<HTMLImageElement>("lightbox-image"),
  lightboxCount: byId("lightbox-count"),
  lightboxCaption: byId("lightbox-caption"),
  lightboxPromptToggle: byId<HTMLButtonElement>("lightbox-prompt-toggle"),
  lightboxDetails: byId("lightbox-details"),
  lightboxClose: byId<HTMLButtonElement>("lightbox-close"),
  lightboxPrev: byId<HTMLButtonElement>("lightbox-prev"),
  lightboxNext: byId<HTMLButtonElement>("lightbox-next"),
  refreshExports: byId<HTMLButtonElement>("refresh-exports"),
  openExportsFolder: byId<HTMLButtonElement>("open-exports-folder"),
  exportList: byId("export-list"),
  matrixPrev: byId<HTMLButtonElement>("matrix-prev"),
  matrixNext: byId<HTMLButtonElement>("matrix-next"),
  matrixScrollUp: byId<HTMLButtonElement>("matrix-scroll-up"),
  matrixScrollDown: byId<HTMLButtonElement>("matrix-scroll-down"),
  matrixScrollPosition: byId("matrix-scroll-position"),
  matrixViewList: byId<HTMLButtonElement>("matrix-view-list"),
  matrixViewCards: byId<HTMLButtonElement>("matrix-view-cards"),
  matrixPage: byId("matrix-page"),
  railEstimate: byId("rail-estimate"),
  railPkr: byId("rail-pkr"),
  waveControls: byId("wave-controls"),
  waveStrategy: byId<HTMLSelectElement>("wave-strategy"),
  waveList: byId("wave-list"),
  addWave: byId<HTMLButtonElement>("add-wave"),
  waveMath: byId("wave-math"),
  rateLimitsLine: byId("rate-limits-line"),
  keySummary: byId("key-summary"),
  waveQueue: byId("wave-queue"),
  waveQueueSummary: byId("wave-queue-summary"),
  waveQueueList: byId("wave-queue-list"),
  toast: byId("toast"),
  checkIconTemplate: byId("check-icon-template"),
};

const dropzone = document.querySelector<HTMLElement>(".dropzone");
let matrix: PromptMatrix | null = null;
let selected = new Set<string>();
let session: SessionTelemetry | null = null;
let pollTimer: number | null = null;
let elapsedTimer: number | null = null;
let elapsedAnchor: { wallMs: number; elapsedMs: number } | null = null;
let toastTimer: number | null = null;
let toastTickTimer: number | null = null;
let toastEndsAt = 0;
let adminEditingKey = false;
let adminConfiguredState = false;
let runSubmitInFlight = false;
const SIDEBAR_STORAGE_KEY = "bulkimg.sidebar.collapsed";
const LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY = "bulkimg.library.collapsed-groups";
const TOAST_MS_OK = 4200;
const TOAST_MS_ERR = 7000;
let logsLines: string[] = [];
let logsSearchTimer: number | null = null;
let historyItems: HistoryItem[] = [];
let librarySessions = new Map<string, SessionSummary>();
let libraryRuns = new Map<string, RunSummary>();
let librarySelectedPromptIds = new Set<string>();
let collapsedLibraryGroups = new Set<string>();
try {
  const stored = JSON.parse(localStorage.getItem(LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY) ?? "[]");
  if (Array.isArray(stored)) collapsedLibraryGroups = new Set(stored.filter((value): value is string => typeof value === "string"));
} catch { /* local preference is optional */ }
let historyImageObserver: IntersectionObserver | null = null;
type ConverterQueueItem = { clientId: string; sourceKind: "session" | "upload" | "clipboard"; name: string; assetId?: string; dataBase64?: string; previewUrl?: string; format?: ConverterFormat };
let converterQueue: ConverterQueueItem[] = [];
let converterRules: ConverterRule[] = [];
let converterJobs: ConverterJob[] = [];
let converterSessionImages: ConverterSourceImage[] = [];
let converterTab: "workspace" | "history" = "workspace";
let converterSessionLayout: "cards" | "list" = "cards";
let selectedConverterSessionAssets = new Set<string>();
let clipboardHistoryTarget: "reference" | "converter" | null = null;
let clipboardHistoryTargetExpiresAt = 0;
let waveSizes: number[] = [];
let lightboxItems: HistoryItem[] = [];
let lightboxIndex = 0;
let lightboxPromptExpanded = false;
type ReferenceImage = { fileId: string; name: string; previewUrl: string };
let referenceImages: ReferenceImage[] = [];
let referencePasteInFlight = false;
let estimateTimer: number | null = null;
let matrixPage = 0;
let activeKeyCount = 0;
let matrixView: "list" | "cards" = localStorage.getItem("bulkimg-prompt-view") === "cards" ? "cards" : "list";
let lastTelemetryStatus: SessionTelemetry["status"] | null = null;
let waveQueueRequest = 0;
let alertedWaveKey: string | null = null;
let selectionSyncToken = 0;
let bootstrapData: AppBootstrap | null = null;
let pricingView: PricingView | null = null;
let appLimits: {
  maxReferences: number;
  maxReferenceBytes: number;
  maxPromptChars: number;
  directPromptLimit: number;
  batchPromptLimit: number;
  defaultWaveSize: number;
} = {
  maxReferences: APP_LIMITS.maxReferences,
  maxReferenceBytes: APP_LIMITS.maxReferenceBytes,
  maxPromptChars: APP_LIMITS.maxPromptChars,
  directPromptLimit: APP_LIMITS.directPromptLimit,
  batchPromptLimit: APP_LIMITS.batchPromptLimit,
  defaultWaveSize: APP_LIMITS.defaultWaveSize,
};
const PAGE_SIZE = 100;

function referenceLimit(): number {
  return appLimits.maxReferences;
}

function referenceLimitBytes(): number {
  return appLimits.maxReferenceBytes;
}

function directPromptLimit(): number {
  return appLimits.directPromptLimit;
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  el.classList.toggle("hidden", hidden);
  el.hidden = hidden;
}

function updateWaveUi(): void {
  const batch = currentMode() === "batch";
  const split = elements.waveStrategy.value !== "all";
  const hasPrompts = selected.size > 0;
  setHidden(elements.waveControls, !batch || !hasPrompts);
  setHidden(elements.waveSizeField, !batch || !hasPrompts || !split);
  if (hasPrompts && split) ensureWavePlan();
  renderWaveList();
  const showMath = batch && selected.size > 0;
  setHidden(elements.waveMath, !showMath);
  if (showMath) {
    if (!split) elements.waveMath.textContent = `${selected.size} prompts will run in one batch.`;
    else elements.waveMath.textContent = `${selected.size} prompts across ${waveSizes.length} wave${waveSizes.length === 1 ? "" : "s"}: ${waveSizes.join(" + ")}.`;
  }
}

function defaultWavePlan(total: number): number[] {
  if (total <= 0) return [];
  const plan = [Math.min(10, total)];
  let remaining = total - plan[0]!;
  while (remaining > 0) { const size = Math.min(100, remaining); plan.push(size); remaining -= size; }
  return plan;
}

function ensureWavePlan(): void {
  const total = selected.size;
  if (!waveSizes.length) { waveSizes = defaultWavePlan(total); return; }
  let remaining = total;
  const next: number[] = [];
  for (const size of waveSizes) {
    if (remaining <= 0) break;
    const bounded = Math.max(1, Math.min(appLimits.batchPromptLimit, Math.floor(size || 1), remaining));
    next.push(bounded); remaining -= bounded;
  }
  while (remaining > 0) { const size = Math.min(100, remaining); next.push(size); remaining -= size; }
  waveSizes = next;
}

function renderWaveList(): void {
  if (!waveSizes.length) { elements.waveList.innerHTML = ""; return; }
  elements.waveList.innerHTML = waveSizes.map((size, index) => `<div class="wave-row"><span>Wave ${index + 1}</span><label><span class="sr-only">Prompts in wave ${index + 1}</span><input type="number" min="1" max="${appLimits.batchPromptLimit}" value="${size}" data-wave-index="${index}" /> <small>prompts</small></label><button class="icon-button wave-remove" type="button" data-remove-wave="${index}" aria-label="Remove wave ${index + 1}" title="Remove wave">×</button></div>`).join("");
  elements.waveList.querySelectorAll<HTMLInputElement>("input[data-wave-index]").forEach((input) => input.addEventListener("change", () => {
    const index = Number(input.dataset["waveIndex"]);
    const value = Math.max(1, Math.min(appLimits.batchPromptLimit, Math.floor(Number(input.value) || 1)));
    waveSizes[index] = value;
    ensureWavePlan(); updateWaveUi();
  }));
  elements.waveList.querySelectorAll<HTMLButtonElement>("button[data-remove-wave]").forEach((button) => button.addEventListener("click", () => {
    if (waveSizes.length === 1) return;
    waveSizes.splice(Number(button.dataset["removeWave"]), 1); ensureWavePlan(); updateWaveUi();
  }));
}

function formatRateLimits(admin: AdminConfigView | null): { text: string; level: "soft" | "warn" | "ready" } {
  if (!admin?.configured) {
    if (admin?.lastError) return { text: `Admin key: ${admin.lastError}`, level: "warn" };
    return { text: "Org limits optional — Admin key in API keys.", level: "soft" };
  }
  const limits = admin.rateLimits;
  if (!limits) {
    return {
      text: admin.projectId
        ? `Admin · ${admin.projectId} — refresh limits`
        : "Admin key saved — pick a project and refresh",
      level: "soft",
    };
  }
  const ipm = limits.maxImagesPerMinute != null ? `${formatNumber(limits.maxImagesPerMinute)}/min` : "images/min —";
  const tpm = limits.maxTokensPerMinute != null ? `${formatNumber(limits.maxTokensPerMinute)} TPM` : "TPM —";
  return { text: `${limits.model}: ${ipm} · ${tpm}`, level: "ready" };
}

function applyAdminView(admin: AdminConfigView): void {
  adminConfiguredState = admin.configured;
  elements.adminSavedHint.textContent = admin.keyHint ?? "saved";
  elements.adminSavedMeta.textContent = admin.projectId
    ? `Project ${admin.projectId}`
    : "No project selected yet";
  if (admin.projectId) {
    elements.adminProject.value = admin.projectId;
    elements.adminProjectNew.value = admin.projectId;
  }
  const limitsUi = formatRateLimits(admin);
  elements.adminLimitsPreview.textContent = admin.rateLimits
    ? limitsUi.text
    : (admin.lastError ?? (admin.configured ? "Limits not loaded yet — pick a project and refresh." : ""));
  elements.rateLimitsLine.textContent = limitsUi.text;
  elements.rateLimitsLine.dataset["level"] = limitsUi.level;
  elements.adminTabBadge.textContent = admin.configured ? "On" : "—";
  elements.adminTabBadge.classList.toggle("off", !admin.configured);

  // Editing when no key yet, or user chose Change Admin key
  const editing = !admin.configured || adminEditingKey;
  elements.adminStatus.textContent = editing
    ? (admin.configured
      ? `Replace Admin key. Current: ${admin.keyHint ?? "saved"}`
      : "Paste an Admin API key from OpenAI → Organization → Admin keys.")
    : "";
  setHidden(elements.adminConfigured, editing);
  setHidden(elements.adminEdit, !editing);
  elements.adminSaveLabel.textContent = admin.configured && adminEditingKey ? "Replace Admin key" : "Save Admin key";
  setHidden(elements.cancelAdminEdit, !(admin.configured && adminEditingKey));
  elements.adminKey.required = editing;
  elements.clearAdmin.disabled = !admin.configured;
  elements.refreshLimits.disabled = !admin.configured;
  elements.loadAdminProjects.disabled = !admin.configured;
  elements.editAdminKey.disabled = !admin.configured;
}

function isSessionActive(target: SessionTelemetry | null = session): boolean {
  return Boolean(target && (target.status === "pending" || target.status === "processing"));
}

function canResumeSession(target: SessionTelemetry | null = session): boolean {
  return Boolean(target && target.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(target.status));
}

function syncEstimateChrome(count: number): void {
  const show = count > 0;
  setHidden(elements.estimatedCost, !show);
  setHidden(elements.estimateBox, !show);
  if (!show) {
    elements.estimatedCost.textContent = "";
    elements.railEstimate.textContent = "";
    elements.railPkr.textContent = "";
  }
}

function syncKeyCountBadge(active: number): void {
  elements.keyCount.textContent = String(active);
  setHidden(elements.keyCount, active === 0);
}

function syncActionState(): void {
  const count = selected.size;
  const overDirectLimit = currentMode() === "direct" && count > directPromptLimit();
  const active = isSessionActive();
  const canResume = canResumeSession();
  const busy = runSubmitInFlight || elements.runButton.getAttribute("aria-busy") === "true";
  const noKeys = activeKeyCount === 0;
  const canGenerate = !busy && count > 0 && !overDirectLimit && !noKeys && !active;

  elements.runButton.disabled = !canGenerate;
  const label = elements.runButton.querySelector("span");
  if (label) {
    if (busy) label.textContent = "Starting…";
    else if (active) label.textContent = "Running…";
    else if (noKeys) label.textContent = "Add API key";
    else if (overDirectLimit) label.textContent = `Choose up to ${directPromptLimit()}`;
    else if (count) label.textContent = `Generate ${count}`;
    else label.textContent = "Generate";
  }
  elements.runButton.title = noKeys
    ? "Add a generation API key"
    : count === 0
      ? "Select prompts to generate"
      : overDirectLimit
        ? `Direct mode allows up to ${directPromptLimit()} prompts`
        : active
          ? "A run is already in progress"
          : "Start generation";

  setHidden(elements.cancelButton, !active);
  elements.cancelButton.disabled = !active;

  setHidden(elements.resumeButton, !canResume);
  elements.resumeButton.disabled = !canResume;
  elements.retryButton.classList.toggle("hidden", !canResume);
  elements.retryButton.disabled = !canResume;

  elements.exportButton.disabled = !session || busy;
  elements.previewSession.disabled = !session || session.completedCount === 0;

  const cells = selectableCells();
  document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
    const action = button.dataset["pick"];
    if (action === "none") button.disabled = selected.size === 0;
    else if (action === "all") button.disabled = cells.length === 0 || selected.size === cells.length;
  });
  elements.deleteSelectedPrompts.disabled = selected.size === 0;
  elements.clearImportedPrompts.disabled = !matrix || matrix.cells.length === 0;

  elements.parseManual.disabled = elements.parseManual.getAttribute("aria-busy") === "true"
    || !elements.manualPrompts.value.trim();
}

function dismissToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastTickTimer !== null) {
    window.clearInterval(toastTickTimer);
    toastTickTimer = null;
  }
  elements.toast.classList.remove("show");
  elements.toast.hidden = true;
  elements.toastProgress.style.animation = "none";
}

function showToast(message: string, isError = false): void {
  dismissToast();
  const duration = isError ? TOAST_MS_ERR : TOAST_MS_OK;
  toastEndsAt = Date.now() + duration;
  elements.toastMessage.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.setAttribute("role", isError ? "alert" : "status");
  elements.toast.setAttribute("aria-live", isError ? "assertive" : "polite");
  elements.toast.hidden = false;
  const secondsLeft = () => Math.max(0, Math.ceil((toastEndsAt - Date.now()) / 1000));
  elements.toastTimerLabel.textContent = `${secondsLeft()}s`;
  // restart CSS progress animation
  elements.toastProgress.style.animation = "none";
  void elements.toastProgress.offsetWidth;
  elements.toastProgress.style.animation = "";
  elements.toastProgress.style.animationDuration = `${duration}ms`;
  elements.toast.classList.add("show");
  refreshIcons();
  toastTickTimer = window.setInterval(() => {
    const left = secondsLeft();
    elements.toastTimerLabel.textContent = `${left}s`;
    if (left <= 0 && toastTickTimer !== null) {
      window.clearInterval(toastTickTimer);
      toastTickTimer = null;
    }
  }, 250);
  toastTimer = window.setTimeout(() => dismissToast(), duration);
}

function applySidebarCollapsed(collapsed: boolean, persist = false): void {
  elements.appShell.dataset["sidebar"] = collapsed ? "collapsed" : "expanded";
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  elements.sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  elements.sidebarToggle.innerHTML = collapsed
    ? '<i data-lucide="panel-left-open"></i>'
    : '<i data-lucide="panel-left-close"></i>';
  refreshIcons();
  if (persist) {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // persist optional
    }
  }
}

function restoreSidebar(): void {
  let collapsed = false;
  try {
    collapsed = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    collapsed = false;
  }
  applySidebarCollapsed(collapsed, false);
}

function setKeyTypeTab(type: "generation" | "admin"): void {
  const generation = type === "generation";
  elements.keyTypeGeneration.classList.toggle("active", generation);
  elements.keyTypeAdmin.classList.toggle("active", !generation);
  elements.keyTypeGeneration.setAttribute("aria-selected", String(generation));
  elements.keyTypeAdmin.setAttribute("aria-selected", String(!generation));
  elements.keyPanelGeneration.classList.toggle("hidden", !generation);
  elements.keyPanelGeneration.hidden = !generation;
  elements.keyPanelAdmin.classList.toggle("hidden", generation);
  elements.keyPanelAdmin.hidden = generation;
  elements.keyError.classList.add("hidden");
  window.requestAnimationFrame(() => {
    if (generation) elements.keyLabel.focus();
    else if (adminConfiguredState && !adminEditingKey) elements.adminProject.focus();
    else elements.adminKey.focus();
  });
}

function resumeConfirmMessage(): string {
  return "Resume starts a new OpenAI batch for remaining prompts. Saved images stay. You do not need to re-import the CSV.";
}

async function startSessionPolling(sessionId: string): Promise<void> {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(async () => {
    if (!session || session.sessionId !== sessionId) return;
    try {
      renderTelemetry(await app.rpc!.request.pollBatchStatus({ sessionId }));
      await loadKeys();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh the run", true);
    }
  }, 10_000);
}

function isTerminalStatus(status: SessionTelemetry["status"]): boolean {
  return ["partial", "completed", "failed", "cancelled"].includes(status);
}

function hideWaveQueue(): void {
  elements.waveQueueList.innerHTML = "";
  elements.waveQueueSummary.textContent = "";
  setHidden(elements.waveQueue, true);
}

async function continueQueuedWave(runId: string, button?: HTMLButtonElement): Promise<void> {
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    const next = await app.rpc!.request.continueRun({ runId });
    renderTelemetry(next);
    showToast(`Batch ${(next.waveIndex ?? 0) + 1} is now running.`);
    await startSessionPolling(next.sessionId);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not run the next batch", true);
    if (session) void refreshWaveQueue(session);
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}

function renderWaveQueue(run: RunSummary): void {
  const waves = [...run.sessions].sort((left, right) => (left.waveIndex ?? 0) - (right.waveIndex ?? 0));
  if (waves.length < 2) {
    hideWaveQueue();
    return;
  }
  const readyWaveIndex = run.waveStrategy === "guided"
    ? waves.findIndex((wave, index) => wave.status === "pending" && waves.slice(0, index).every((previous) => isTerminalStatus(previous.status)))
    : -1;
  const readyWave = readyWaveIndex >= 0 ? waves[readyWaveIndex]! : null;
  const alertKey = readyWave ? `${run.runId}:${readyWave.sessionId}` : null;
  const shouldAlert = Boolean(alertKey && alertedWaveKey !== alertKey);
  if (shouldAlert && alertKey) alertedWaveKey = alertKey;

  elements.waveQueueSummary.textContent = readyWave
    ? `Batch ${(readyWave.waveIndex ?? readyWaveIndex) + 1} is ready to run`
    : `${run.completedCount}/${run.totalPrompts} images across ${waves.length} batches`;
  elements.waveQueueList.innerHTML = waves.map((wave, index) => {
    const ordinal = (wave.waveIndex ?? index) + 1;
    const ready = readyWave?.sessionId === wave.sessionId;
    const statusLabel = ready ? "Ready to run" : wave.status.replaceAll("_", " ");
    return `<li class="wave-queue-item status-${escapeHtml(wave.status)}${ready && shouldAlert ? " awaiting-run" : ""}${session?.sessionId === wave.sessionId ? " active-wave" : ""}">
      <span class="wave-queue-number">Batch ${ordinal}/${waves.length}</span>
      <strong>${wave.completedCount}/${wave.totalPrompts} images</strong>
      <small>${escapeHtml(statusLabel)}</small>
      ${ready ? `<button type="button" class="secondary-button wave-run" data-run-id="${escapeHtml(run.runId)}" aria-label="Run batch ${ordinal}">Run batch ${ordinal}</button>` : ""}
    </li>`;
  }).join("");
  setHidden(elements.waveQueue, false);
  elements.waveQueueList.querySelectorAll<HTMLButtonElement>(".wave-run").forEach((button) => {
    button.onclick = () => void continueQueuedWave(button.dataset["runId"]!, button);
  });
}

async function refreshWaveQueue(next: SessionTelemetry): Promise<void> {
  const request = ++waveQueueRequest;
  if (!next.parentRunId || !next.waveCount || next.waveCount < 2) {
    hideWaveQueue();
    return;
  }
  try {
    const run = await app.rpc!.request.getRunDetail({ runId: next.parentRunId });
    if (request !== waveQueueRequest || session?.sessionId !== next.sessionId) return;
    renderWaveQueue(run);
  } catch {
    if (request === waveQueueRequest && session?.sessionId === next.sessionId) hideWaveQueue();
  }
}

const slateStackIcons = {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock3,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  ImagePlus,
  Image,
  Images,
  Info,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Moon,
  MoreHorizontal,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Repeat2,
  Rows3,
  ScrollText,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UploadCloud,
  X,
};

function motionAllowed(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function enter(element: Element, delay = 0, distance = 6): void {
  if (!motionAllowed()) return;
  void animate(element, { opacity: [0.72, 1], transform: [`translateY(${distance}px)`, "translateY(0px)"] }, { duration: 0.2, delay, ease: [0.16, 1, 0.3, 1] });
}

function enterVisibleItems(container: Element, selector: string, limit = 8): void {
  if (!motionAllowed()) return;
  [...container.querySelectorAll(selector)].slice(0, limit).forEach((item, index) => enter(item, index * 0.018, 4));
}

function animateState(element: Element): void {
  if (!motionAllowed()) return;
  void animate(element, { opacity: [0.6, 1], transform: ["translateY(3px)", "translateY(0px)"] }, { duration: 0.16, ease: [0.16, 1, 0.3, 1] });
}

function animateSelection(element: Element): void {
  if (!motionAllowed()) return;
  void animate(element, { transform: ["scale(0.92)", "scale(1)"], opacity: [0.65, 1] }, { duration: 0.14, ease: [0.16, 1, 0.3, 1] });
}

function refreshIcons(): void {
  createIcons({
    icons: slateStackIcons,
    attrs: {
      "aria-hidden": "true",
      "stroke-width": "1.75",
    },
  });
}

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem("bulkimg-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Local storage can be unavailable in hardened webview configurations.
  }
  // The supplied SlateStack system is dark-first. Keep light mode available as
  // an explicit, persisted choice instead of inheriting the OS on first run.
  return "dark";
}

function applyTheme(theme: Theme, persist = false): void {
  document.documentElement.dataset["theme"] = theme;
  elements.themeLabel.textContent = theme === "dark" ? "Dark theme" : "Light theme";
  elements.themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  if (persist) {
    try {
      window.localStorage.setItem("bulkimg-theme", theme);
    } catch {
      // Theme still applies for this session when persistence is unavailable.
    }
  }
}

function escapeHtml(value: string): string {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatEta(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 60_000) return `~${Math.max(1, Math.ceil(ms / 1000))}s`;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours}h ${rest}m` : `~${hours}h`;
}

function setTab(mode: "csv" | "manual"): void {
  const csv = mode === "csv";
  elements.csvTab.classList.toggle("active", csv);
  elements.manualTab.classList.toggle("active", !csv);
  elements.csvTab.setAttribute("aria-selected", String(csv));
  elements.manualTab.setAttribute("aria-selected", String(!csv));
  elements.csvTab.tabIndex = csv ? 0 : -1;
  elements.manualTab.tabIndex = csv ? -1 : 0;
  elements.csvPanel.classList.toggle("hidden", !csv);
  elements.manualPanel.classList.toggle("hidden", csv);
  elements.csvPanel.toggleAttribute("hidden", !csv);
  elements.manualPanel.toggleAttribute("hidden", csv);
  enter(csv ? elements.csvPanel : elements.manualPanel, 0, 4);
}

function checkIconMarkup(): string {
  return elements.checkIconTemplate.innerHTML;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stopElapsedTicker(): void {
  if (elapsedTimer !== null) {
    window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  elapsedAnchor = null;
}

function startElapsedTicker(elapsedMs: number): void {
  elapsedAnchor = { wallMs: Date.now(), elapsedMs };
  if (elapsedTimer !== null) return;
  elapsedTimer = window.setInterval(() => {
    if (!elapsedAnchor) return;
    elements.elapsed.textContent = formatElapsed(elapsedAnchor.elapsedMs + (Date.now() - elapsedAnchor.wallMs));
  }, 1_000);
}

function converterDefaultFormat(): ConverterFormat {
  return (elements.converterFormats.querySelector<HTMLButtonElement>(".active")?.dataset["converterFormat"] ?? "png") as ConverterFormat;
}

function converterOptions(): ConverterOptions {
  const positive = (value: string) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  };
  return {
    defaultFormat: converterDefaultFormat(), quality: elements.converterQuality.value as ConverterOptions["quality"],
    width: positive(elements.converterWidth.value), height: positive(elements.converterHeight.value),
    fit: elements.converterFit.value as ConverterOptions["fit"], stripMetadata: elements.converterStripMetadata.checked,
    background: elements.converterBackground.value, prefix: elements.converterPrefix.value.trim(), rules: converterRules,
    overrides: Object.fromEntries(converterQueue.filter((item) => item.format).map((item) => [item.clientId, item.format!])),
  };
}

function effectiveConverterFormat(item: ConverterQueueItem, ordinal: number): ConverterFormat {
  if (item.format) return item.format;
  let match: ConverterFormat | null = null;
  for (const rule of converterRules) {
    if (rule.type === "nth" && ordinal % rule.every === 0) match = rule.format;
    if (rule.type === "odd" && ordinal % 2 === 1) match = rule.format;
    if (rule.type === "even" && ordinal % 2 === 0) match = rule.format;
    if (rule.type === "range" && ordinal >= rule.start && ordinal <= rule.end) match = rule.format;
    if (rule.type === "cycle" && rule.formats.length) match = rule.formats[(ordinal - 1) % rule.formats.length] ?? null;
  }
  return match ?? converterDefaultFormat();
}

function renderConverterRules(): void {
  if (!converterRules.length) {
    elements.converterRuleList.innerHTML = '<small class="converter-rule-empty">No rules yet. The default format applies to every image.</small>';
    return;
  }
  const suffix = (value: number) => value % 100 >= 11 && value % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th";
  const summary = (rule: ConverterRule) => {
    if (rule.type === "nth") return `Every ${rule.every}${suffix(rule.every)} image → ${rule.format.toUpperCase()}`;
    if (rule.type === "range") return `Images ${rule.start}–${rule.end} → ${rule.format.toUpperCase()}`;
    if (rule.type === "cycle") return `Repeat ${rule.formats.map((format) => format.toUpperCase()).join(" → ")}`;
    return `${rule.type === "odd" ? "Odd" : "Even"} images → ${rule.format.toUpperCase()}`;
  };
  elements.converterRuleList.innerHTML = converterRules.map((rule) => `<div class="converter-rule"><span>${escapeHtml(summary(rule))}</span><button type="button" class="icon-button converter-remove-rule" data-rule-id="${rule.id}" aria-label="Remove rule"><i data-lucide="x"></i></button></div>`).join("");
  elements.converterRuleList.querySelectorAll<HTMLButtonElement>(".converter-remove-rule").forEach((button) => {
    button.addEventListener("click", () => {
      converterRules = converterRules.filter((rule) => rule.id !== button.dataset["ruleId"]);
      renderConverterRules(); renderConverterQueue();
    });
  });
  refreshIcons();
}

function renderConverterSessionSources(): void {
  const grouped = new Map<string, ConverterSourceImage[]>();
  for (const image of converterSessionImages) {
    const images = grouped.get(image.sessionId) ?? [];
    images.push(image); grouped.set(image.sessionId, images);
  }
  elements.converterSessionCards.classList.toggle("active", converterSessionLayout === "cards");
  elements.converterSessionListMode.classList.toggle("active", converterSessionLayout === "list");
  elements.converterSessionCards.setAttribute("aria-pressed", String(converterSessionLayout === "cards"));
  elements.converterSessionListMode.setAttribute("aria-pressed", String(converterSessionLayout === "list"));
  const selectedCount = selectedConverterSessionAssets.size;
  elements.converterSessionSelection.textContent = selectedCount ? `${selectedCount} session image${selectedCount === 1 ? "" : "s"} selected` : "Select images from your generated sessions";
  elements.converterSessionAddInline.disabled = selectedCount === 0;
  if (!converterSessionImages.length) {
    elements.converterSessionSources.innerHTML = '<div class="empty-state"><i data-lucide="images"></i><strong>No session images yet</strong><small>Your generated images will appear here automatically.</small></div>';
    refreshIcons(); return;
  }
  const renderImage = (image: ConverterSourceImage) => `<button type="button" class="converter-session-source${selectedConverterSessionAssets.has(image.assetId) ? " selected" : ""}" data-session-asset-id="${image.assetId}" aria-pressed="${selectedConverterSessionAssets.has(image.assetId)}"><span class="converter-session-preview" data-session-preview-id="${image.assetId}"><i data-lucide="image"></i></span><span><strong>${escapeHtml(image.name)}</strong><small>${escapeHtml(new Date(image.createdAt).toLocaleDateString())}</small></span></button>`;
  if (converterSessionLayout === "list") {
    elements.converterSessionSources.innerHTML = `<div class="converter-session-list-inline">${[...grouped.entries()].map(([sessionId, images]) => `<section><header><strong>Session ${escapeHtml(sessionId.slice(0, 8))}</strong><small>${images.length} image${images.length === 1 ? "" : "s"} · ${escapeHtml(new Date(images[0]!.createdAt).toLocaleString())}</small><button type="button" class="secondary-button converter-add-session" data-session-id="${sessionId}">Add all</button></header>${images.map(renderImage).join("")}</section>`).join("")}</div>`;
  } else {
    elements.converterSessionSources.innerHTML = `<div class="converter-session-cards">${[...grouped.entries()].map(([sessionId, images]) => `<article class="converter-session-card"><header><div><strong>Session ${escapeHtml(sessionId.slice(0, 8))}</strong><small>${images.length} image${images.length === 1 ? "" : "s"} · ${escapeHtml(new Date(images[0]!.createdAt).toLocaleString())}</small></div><button type="button" class="secondary-button converter-add-session" data-session-id="${sessionId}">Add all</button></header><div class="converter-session-image-grid">${images.map(renderImage).join("")}</div></article>`).join("")}</div>`;
  }
  elements.converterSessionSources.querySelectorAll<HTMLButtonElement>(".converter-session-source").forEach((button) => button.addEventListener("click", () => {
    const assetId = button.dataset["sessionAssetId"]!;
    if (selectedConverterSessionAssets.has(assetId)) selectedConverterSessionAssets.delete(assetId); else selectedConverterSessionAssets.add(assetId);
    renderConverterSessionSources();
  }));
  elements.converterSessionSources.querySelectorAll<HTMLButtonElement>(".converter-add-session").forEach((button) => button.addEventListener("click", () => {
    const sessionId = button.dataset["sessionId"]!;
    converterSessionImages.filter((image) => image.sessionId === sessionId).forEach((image) => selectedConverterSessionAssets.add(image.assetId));
    addSelectedConverterSessionImages();
  }));
  elements.converterSessionSources.querySelectorAll<HTMLElement>("[data-session-preview-id]").forEach((preview) => void loadConverterSessionPreview(preview));
  refreshIcons();
}

async function loadConverterSessionPreview(preview: HTMLElement): Promise<void> {
  const assetId = preview.dataset["sessionPreviewId"];
  if (!assetId) return;
  try {
    const { dataUrl } = await app.rpc!.request.getHistoryImage({ assetId });
    preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Generated session image" />`;
  } catch { preview.innerHTML = '<i data-lucide="image-off"></i>'; refreshIcons(); }
}

function addSelectedConverterSessionImages(): void {
  const alreadyQueued = new Set(converterQueue.filter((item) => item.assetId).map((item) => item.assetId!));
  for (const image of converterSessionImages) {
    if (!selectedConverterSessionAssets.has(image.assetId) || alreadyQueued.has(image.assetId)) continue;
    converterQueue.push({ clientId: crypto.randomUUID(), sourceKind: "session", assetId: image.assetId, name: image.name });
  }
  selectedConverterSessionAssets.clear();
  renderConverterSessionSources(); renderConverterQueue();
}

async function loadConverterSessionSources(): Promise<void> {
  elements.converterSessionSources.setAttribute("aria-busy", "true");
  elements.converterSessionSources.innerHTML = '<div class="empty-state"><i data-lucide="loader-circle"></i><strong>Loading session images…</strong></div>';
  refreshIcons();
  try {
    const images = await app.rpc!.request.listConverterSessionImages({});
    converterSessionImages = Array.isArray(images) ? images : [];
    renderConverterSessionSources();
  }
  catch (error) { elements.converterSessionSources.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load session images.")}</div>`; }
  finally { elements.converterSessionSources.removeAttribute("aria-busy"); }
}

function renderConverterQueue(): void {
  const hasItems = converterQueue.length > 0;
  elements.converterGrid.classList.toggle("has-queue", hasItems);
  elements.converterControls.classList.toggle("hidden", !hasItems);
  elements.converterControls.hidden = !hasItems;
  elements.converterQueueColumns.classList.toggle("hidden", !hasItems);
  elements.converterQueueColumns.hidden = !hasItems;
  elements.converterQueueTitle.textContent = hasItems ? "Conversion plan" : "Add more images";
  elements.converterQueueSubtitle.textContent = hasItems ? "Set one format for all images, then override individual rows only where needed." : "Upload, drag and drop, or paste images when they are not in a session.";
  elements.converterRun.disabled = converterQueue.length === 0;
  if (!converterQueue.length) {
    elements.converterQueue.innerHTML = '<div class="empty-state"><i data-lucide="images"></i><strong>No images added</strong><small>Choose a source to start a local conversion.</small></div>';
    refreshIcons();
    return;
  }
  const formats = ["png", "jpg", "webp", "avif", "tiff", "bmp"] as ConverterFormat[];
  elements.converterQueue.innerHTML = converterQueue.map((item, index) => {
    const ordinal = index + 1;
    const effective = effectiveConverterFormat(item, ordinal);
    const preview = item.previewUrl ? `<img src="${escapeHtml(item.previewUrl)}" alt="" />` : `<span class="image-placeholder"><i data-lucide="image"></i></span>`;
    return `<div class="converter-queue-item" role="listitem" data-client-id="${item.clientId}"><div class="converter-thumb">${preview}</div><div><strong>${escapeHtml(item.name)}</strong><small>${item.sourceKind === "session" ? "From session" : item.sourceKind === "clipboard" ? "Pasted image" : "Uploaded image"} · Image ${ordinal}</small></div><label class="sr-only" for="converter-format-${item.clientId}">Output format for ${escapeHtml(item.name)}</label><select id="converter-format-${item.clientId}" class="converter-item-format" data-client-id="${item.clientId}"><option value="">Default (${converterDefaultFormat().toUpperCase()})</option>${formats.map((format) => `<option value="${format}"${item.format === format ? " selected" : ""}>${format.toUpperCase()}</option>`).join("")}</select><b>${effective.toUpperCase()}</b><button type="button" class="icon-button converter-source-properties" data-client-id="${item.clientId}" aria-label="Properties for ${escapeHtml(item.name)}"><i data-lucide="info"></i></button><button type="button" class="icon-button converter-remove-item" data-client-id="${item.clientId}" aria-label="Remove ${escapeHtml(item.name)}"><i data-lucide="x"></i></button></div>`;
  }).join("");
  elements.converterQueue.querySelectorAll<HTMLSelectElement>(".converter-item-format").forEach((select) => select.addEventListener("change", () => {
    const item = converterQueue.find((candidate) => candidate.clientId === select.dataset["clientId"]);
    if (!item) return;
    item.format = (select.value || undefined) as ConverterFormat | undefined;
    renderConverterQueue();
  }));
  elements.converterQueue.querySelectorAll<HTMLButtonElement>(".converter-remove-item").forEach((button) => button.addEventListener("click", () => {
    const item = converterQueue.find((candidate) => candidate.clientId === button.dataset["clientId"]);
    if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    converterQueue = converterQueue.filter((candidate) => candidate.clientId !== button.dataset["clientId"]);
    renderConverterQueue();
  }));
  elements.converterQueue.querySelectorAll<HTMLButtonElement>(".converter-source-properties").forEach((button) => button.addEventListener("click", () => void showConverterSourceProperties(button.dataset["clientId"]!)));
  refreshIcons();
}

async function queueConverterFiles(files: File[], sourceKind: "upload" | "clipboard" = "upload"): Promise<void> {
  const usable = files.filter((file) => file.size > 0 && file.size <= 50 * 1024 * 1024);
  if (!usable.length) { showToast("Choose images up to 50 MB each.", true); return; }
  for (const file of usable.slice(0, 100 - converterQueue.length)) {
    const dataBase64 = await fileToBase64(file);
    converterQueue.push({ clientId: crypto.randomUUID(), sourceKind, name: file.name || "image.png", dataBase64, previewUrl: URL.createObjectURL(file) });
  }
  renderConverterQueue();
}

function renderConverterTab(): void {
  const history = converterTab === "history";
  elements.converterWorkspace.classList.toggle("hidden", history);
  elements.converterWorkspace.hidden = history;
  elements.converterHistory.classList.toggle("hidden", !history);
  elements.converterHistory.hidden = !history;
  elements.converterTabWorkspace.classList.toggle("active", !history);
  elements.converterTabHistory.classList.toggle("active", history);
  elements.converterTabWorkspace.setAttribute("aria-selected", String(!history));
  elements.converterTabHistory.setAttribute("aria-selected", String(history));
  if (history) void loadConverterJobs();
}

async function loadConverterJobs(): Promise<void> {
  elements.converterHistory.innerHTML = '<div class="empty-state"><i data-lucide="loader-circle"></i><strong>Loading conversions…</strong></div>';
  refreshIcons();
  try { converterJobs = await app.rpc!.request.listConverterJobs({}); renderConverterHistory(); }
  catch (error) { elements.converterHistory.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load Converter History.")}</div>`; }
}

function renderConverterHistory(): void {
  if (!converterJobs.length) {
    elements.converterHistory.innerHTML = '<div class="panel empty-state"><i data-lucide="images"></i><strong>No conversions yet</strong><small>Converted images stay here until you remove them.</small></div>';
    refreshIcons(); return;
  }
  elements.converterHistory.innerHTML = converterJobs.map((job) => `<article class="panel converter-job" data-job-id="${job.id}"><header><div><strong>${job.completedCount}/${job.totalCount} converted</strong><small>${escapeHtml(new Date(job.createdAt).toLocaleString())} · ${job.status}</small></div><div class="button-row"><button class="secondary-button converter-save-job" type="button" data-job-id="${job.id}"><i data-lucide="download"></i>Save all</button><button class="secondary-button danger-button converter-delete-job" type="button" data-job-id="${job.id}"><i data-lucide="trash-2"></i>Remove</button></div></header><div class="converter-result-grid">${job.items.map((item) => `<div class="converter-output-card" data-job-id="${job.id}" data-item-id="${item.id}"><div class="converter-output-preview"><span class="image-placeholder"><i data-lucide="image"></i></span></div><strong>${escapeHtml(item.outputName ?? item.sourceName)}</strong><small>${item.format.toUpperCase()} · ${item.status}</small><div><button class="icon-button converter-copy-output" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Copy image"><i data-lucide="copy"></i></button><button class="icon-button converter-save-output" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Save image"><i data-lucide="download"></i></button><button class="icon-button converter-properties" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Image properties"><i data-lucide="info"></i></button></div></div>`).join("")}</div></article>`).join("");
  wireConverterActions(elements.converterHistory);
  elements.converterHistory.querySelectorAll<HTMLElement>(".converter-output-card").forEach((card) => void loadConverterPreview(card));
  refreshIcons();
}

async function loadConverterPreview(card: HTMLElement): Promise<void> {
  const jobId = card.dataset["jobId"]; const itemId = card.dataset["itemId"];
  if (!jobId || !itemId) return;
  try {
    const { dataUrl } = await app.rpc!.request.getConverterOutput({ jobId, itemId });
    const preview = card.querySelector(".converter-output-preview");
    if (preview) preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Converted image" />`;
  } catch { /* failed source is shown by its status */ }
}

function wireConverterActions(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".converter-copy-output").forEach((button) => button.addEventListener("click", async () => {
    try { await app.rpc!.request.copyConverterOutput({ jobId: button.dataset["jobId"]!, itemId: button.dataset["itemId"]! }); showToast("Image copied to clipboard."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not copy image.", true); }
  }));
  container.querySelectorAll<HTMLButtonElement>(".converter-save-output").forEach((button) => button.addEventListener("click", async () => {
    try { const result = await app.rpc!.request.saveConverterOutputs({ jobId: button.dataset["jobId"]!, itemIds: [button.dataset["itemId"]!] }); if (result.saved) showToast("Image saved."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not save image.", true); }
  }));
  container.querySelectorAll<HTMLButtonElement>(".converter-properties").forEach((button) => button.addEventListener("click", () => void showConverterProperties(button.dataset["jobId"]!, button.dataset["itemId"]!)));
  container.querySelectorAll<HTMLButtonElement>(".converter-save-job").forEach((button) => button.addEventListener("click", async () => {
    const job = converterJobs.find((candidate) => candidate.id === button.dataset["jobId"]); if (!job) return;
    try { const result = await app.rpc!.request.saveConverterOutputs({ jobId: job.id, itemIds: job.items.filter((item) => item.status === "completed").map((item) => item.id) }); if (result.saved) showToast(`${result.saved} images saved.`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not save images.", true); }
  }));
  container.querySelectorAll<HTMLButtonElement>(".converter-delete-job").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Remove this Converter History item and its internal copies? Saved files will stay untouched.")) return;
    try { await app.rpc!.request.deleteConverterJob({ jobId: button.dataset["jobId"]! }); await loadConverterJobs(); showToast("Conversion removed from history."); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not remove conversion.", true); }
  }));
}

async function showConverterProperties(jobId: string, itemId: string): Promise<void> {
  try {
    const properties = await app.rpc!.request.getConverterProperties({ jobId, itemId });
    elements.converterPropertiesSubtitle.textContent = properties.name;
    const rows: Array<[string, string]> = [["Format", properties.format.toUpperCase()], ["Size", `${properties.width} × ${properties.height}px`], ["File size", `${(properties.sizeBytes / 1024 / 1024).toFixed(2)} MB`], ["Colour space", properties.colorSpace ?? "—"], ["Channels", String(properties.channels ?? "—")], ["Bit depth", properties.bitDepth ?? "—"], ["Transparency", properties.hasAlpha ? "Yes" : "No"], ["DPI", properties.density ? String(properties.density) : "—"], ["Metadata", properties.hasExif ? "EXIF present" : "None"], ["ICC profile", properties.hasIcc ? "Present" : "None"]];
    elements.converterPropertiesList.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    elements.converterPropertiesDialog.showModal();
  } catch (error) { showToast(error instanceof Error ? error.message : "Could not read image properties.", true); }
}

async function showConverterSourceProperties(clientId: string): Promise<void> {
  const item = converterQueue.find((candidate) => candidate.clientId === clientId);
  if (!item) return;
  const input: ConverterInput = item.sourceKind === "session"
    ? { clientId: item.clientId, sourceKind: "session", assetId: item.assetId!, name: item.name }
    : { clientId: item.clientId, sourceKind: item.sourceKind, name: item.name, dataBase64: item.dataBase64! };
  try {
    const properties = await app.rpc!.request.getConverterSourceProperties({ input });
    elements.converterPropertiesSubtitle.textContent = properties.name;
    const rows: Array<[string, string]> = [["Format", properties.format.toUpperCase()], ["Size", `${properties.width} × ${properties.height}px`], ["File size", `${(properties.sizeBytes / 1024 / 1024).toFixed(2)} MB`], ["Colour space", properties.colorSpace ?? "—"], ["Channels", String(properties.channels ?? "—")], ["Bit depth", properties.bitDepth ?? "—"], ["Transparency", properties.hasAlpha ? "Yes" : "No"], ["DPI", properties.density ? String(properties.density) : "—"], ["Metadata", properties.hasExif ? "EXIF present" : "None"], ["ICC profile", properties.hasIcc ? "Present" : "None"]];
    elements.converterPropertiesList.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    elements.converterPropertiesDialog.showModal();
  } catch (error) { showToast(error instanceof Error ? error.message : "Could not read image properties.", true); }
}

async function setView(view: "generator" | "converter" | "sessions" | "usage" | "history" | "exports" | "logs"): Promise<void> {
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    const active = button.dataset["view"] === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  elements.generatorView.classList.toggle("hidden", view !== "generator");
  elements.converterView.classList.toggle("hidden", view !== "converter");
  elements.sessionsView.classList.toggle("hidden", view !== "sessions");
  elements.usageView.classList.toggle("hidden", view !== "usage");
  elements.historyView.classList.toggle("hidden", view !== "history");
  elements.exportsView.classList.toggle("hidden", view !== "exports");
  elements.logsView.classList.toggle("hidden", view !== "logs");
  elements.headerStats.classList.toggle("hidden", view !== "generator");
  const titles = {
    generator: "Generate images.",
    converter: "Convert images.",
    sessions: "Sessions",
    usage: "Usage & limits",
    history: "Library",
    exports: "Exports",
    logs: "Logs",
  } as const;
  elements.pageTitle.textContent = titles[view];
  if (view === "sessions") await loadSessions();
  if (view === "converter") { renderConverterQueue(); renderConverterRules(); await loadConverterSessionSources(); if (converterTab === "history") await loadConverterJobs(); }
  if (view === "usage") await loadUsage();
  if (view === "history") await loadHistory();
  if (view === "exports") await loadExports();
  if (view === "logs") await loadLogs();
  const target = document.querySelector<HTMLElement>(`#${view}-view`);
  if (target) enter(target);
}

function selectableCells(): PromptCell[] {
  return matrix?.cells.filter((cell) => !cell.disabled) ?? [];
}

function currentMode(): RunMode {
  return document.querySelector<HTMLInputElement>('input[name="run-mode"]:checked')?.value as RunMode ?? "batch";
}

function updateSelection(): void {
  const count = selected.size;
  const previousCount = elements.selectedCount.textContent;
  elements.selectedCount.textContent = String(count);
  if (previousCount !== String(count)) animateState(elements.selectedCount);
  updateWaveUi();
  syncEstimateChrome(count);
  syncActionState();
  if (estimateTimer !== null) window.clearTimeout(estimateTimer);
  if (count === 0) return;
  estimateTimer = window.setTimeout(() => void refreshEstimate(), 180);
}

async function refreshEstimate(): Promise<void> {
  const count = selected.size;
  if (count === 0) {
    syncEstimateChrome(0);
    return;
  }
  try {
    const estimate = await app.rpc!.request.estimateRunCost({
      model: elements.model.value,
      promptCount: count,
      mode: currentMode(),
      quality: elements.quality.value as "low" | "medium" | "high",
      format: elements.size.value as OutputFormatId,
      referenceCount: referenceImages.length,
    });
    elements.fxRate.textContent = `PKR ${estimate.fxRate.toFixed(2)}`;
    setHidden(elements.estimatedCost, false);
    setHidden(elements.estimateBox, false);
    elements.estimatedCost.textContent = `$${estimate.costUsd.toFixed(2)}`;
    elements.railEstimate.textContent = `$${estimate.costUsd.toFixed(3)}`;
    elements.railPkr.textContent = `PKR ${estimate.costPkr.toFixed(2)}`;
    animateState(elements.railEstimate);
  } catch {
    setHidden(elements.estimatedCost, false);
    elements.estimatedCost.textContent = "—";
  }
}

function updateMatrixSummary(): void {
  if (!matrix) {
    elements.sourceName.textContent = "No prompts yet";
    elements.sourceSummary.textContent = "Add prompts to continue.";
    return;
  }

  elements.sourceName.textContent = matrix.sourceName;
  const enabled = matrix.cells.filter((cell) => !cell.disabled).length;
  const disabled = matrix.cells.length - enabled;
  const weekGroups = matrix.groups.filter((group) => group.id !== "manual").length;
  elements.sourceSummary.textContent = weekGroups
    ? `${enabled} prompts · ${weekGroups} weeks · ${disabled} unavailable`
    : `${enabled} prompt${enabled === 1 ? "" : "s"}${disabled ? ` · ${disabled} unavailable` : ""}`;
}

function applyMatrix(next: PromptMatrix): void {
  matrix = next;
  selected = new Set();
  matrixPage = 0;
  updateMatrixSummary();
  elements.warnings.classList.toggle("hidden", next.warnings.length === 0);
  elements.warnings.textContent = next.warnings.join(" ");
  renderMatrix(true, true);
  updateSelection();
}

function clearPromptMatrix(showNotification = true): void {
  matrix = null;
  selected = new Set();
  matrixPage = 0;
  selectionSyncToken += 1;
  elements.csvFile.value = "";
  elements.warnings.textContent = "";
  elements.warnings.classList.add("hidden");
  updateMatrixSummary();
  renderMatrix(true, false);
  updateSelection();
  if (showNotification) showToast("Imported prompts cleared.");
}

function removePromptIds(ids: Set<string>, message: string): void {
  if (!matrix || ids.size === 0) return;

  const remainingCells = matrix.cells.filter((cell) => !ids.has(cell.id));
  if (remainingCells.length === 0) {
    clearPromptMatrix(false);
    showToast(message);
    return;
  }

  const remainingIds = new Set(remainingCells.map((cell) => cell.id));
  matrix = {
    ...matrix,
    cells: remainingCells,
    groups: matrix.groups
      .map((group) => ({
        ...group,
        cellIds: group.cellIds.filter((id) => remainingIds.has(id)),
      }))
      .filter((group) => group.cellIds.length > 0),
  };
  selected = new Set([...selected].filter((id) => remainingIds.has(id)));
  const pageCount = Math.max(1, Math.ceil(remainingCells.length / PAGE_SIZE));
  matrixPage = Math.min(matrixPage, pageCount - 1);
  updateMatrixSummary();
  renderMatrix(true, true);
  updateSelection();
  showToast(message);
}

function removeSelectedPrompts(): void {
  const count = selected.size;
  if (count === 0) return;
  removePromptIds(new Set(selected), `${count} selected prompt${count === 1 ? "" : "s"} deleted.`);
}

function removePromptCell(id: string): void {
  removePromptIds(new Set([id]), "Prompt deleted.");
}

function renderMatrix(resetScroll = false, animateRows = false): void {
  const previousScrollTop = elements.matrix.scrollTop;
  elements.matrix.classList.toggle("view-list", matrixView === "list");
  elements.matrix.classList.toggle("view-cards", matrixView === "cards");
  elements.matrixViewList.classList.toggle("active", matrixView === "list");
  elements.matrixViewCards.classList.toggle("active", matrixView === "cards");
  elements.matrixViewList.setAttribute("aria-pressed", String(matrixView === "list"));
  elements.matrixViewCards.setAttribute("aria-pressed", String(matrixView === "cards"));
  if (!matrix || matrix.cells.length === 0) {
    elements.matrix.innerHTML = matrix
      ? '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="circle-alert"></i></span><strong>No prompts found</strong><small>Check the file structure or try the manual prompt pad.</small></div>'
      : '<div class="empty-state"><i data-lucide="layers-3"></i><strong>No prompts loaded</strong><small>CSV and manual input are both supported.</small></div>';
    refreshIcons();
    elements.matrixScrollUp.disabled = true;
    elements.matrixScrollDown.disabled = true;
    elements.matrixScrollPosition.textContent = "No imported rows";
    elements.matrixPage.textContent = "No pages";
    elements.matrixPrev.disabled = true;
    elements.matrixNext.disabled = true;
    return;
  }
  const pages = Math.max(1, Math.ceil(matrix.cells.length / PAGE_SIZE));
  matrixPage = Math.min(matrixPage, pages - 1);
  const visible = matrix.cells.slice(matrixPage * PAGE_SIZE, (matrixPage + 1) * PAGE_SIZE);
  const visibleIds = new Set(visible.map((cell) => cell.id));
  const cellById = new Map(matrix.cells.map((cell) => [cell.id, cell]));
  const groups = matrix.groups.length
    ? matrix.groups
    : [{ id: "ungrouped", label: "Prompts", startDate: "", cellIds: matrix.cells.map((cell) => cell.id) }];
  const groupedVisible = groups.map((group) => ({
    group,
    cells: group.cellIds.map((id) => cellById.get(id)).filter((cell): cell is PromptCell => Boolean(cell && visibleIds.has(cell.id))),
  })).filter(({ cells }) => cells.length > 0);
  elements.matrixPage.textContent = matrix.cells.length
    ? `Page ${matrixPage + 1} of ${pages}`
    : "No pages";
  const multiPage = pages > 1;
  elements.matrixPrev.disabled = !multiPage || matrixPage === 0;
  elements.matrixNext.disabled = !multiPage || matrixPage >= pages - 1;
  const renderCard = (cell: PromptCell) => `
    <div class="prompt-row" data-row-id="${cell.id}">
      <button type="button" class="prompt-card ${cell.disabled ? "disabled" : ""} ${selected.has(cell.id) ? "selected" : ""}" data-id="${cell.id}" aria-pressed="${selected.has(cell.id)}" ${cell.disabled ? `disabled title="${escapeHtml(cell.disabledReason ?? "This schedule cell cannot generate an image")}"` : ""}>
        <span class="prompt-meta"><span>${escapeHtml(cell.dayLabel || "Prompt")}</span><span>${escapeHtml(cell.scheduleDate || "No date")}</span></span>
        <span class="prompt-copy"><span class="prompt-theme">${escapeHtml(cell.themeColumn)}</span><span class="prompt-text">${escapeHtml(cell.promptText)}</span></span>
        <span class="check-dot" aria-hidden="true">${checkIconMarkup()}</span>
      </button>
      <button type="button" class="prompt-delete" data-delete-id="${cell.id}" aria-label="Delete ${escapeHtml(cell.dayLabel || "prompt")}" title="Delete prompt">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;
  const renderGroup = ({ group, cells }: { group: PromptGroup; cells: PromptCell[] }) => {
    const selectable = group.cellIds.map((id) => cellById.get(id)).filter((cell): cell is PromptCell => Boolean(cell && !cell.disabled));
    const selectedCount = selectable.filter((cell) => selected.has(cell.id)).length;
    const allSelected = selectable.length > 0 && selectedCount === selectable.length;
    const selectionState = allSelected ? "true" : selectedCount > 0 ? "mixed" : "false";
    const unavailable = group.cellIds.length - selectable.length;
    const header = group.id === "manual" ? "" : `<header class="prompt-group-header">
      <div><strong>${escapeHtml(group.label)}</strong><span>${escapeHtml(group.startDate || "No start date")} · ${selectable.length} prompt${selectable.length === 1 ? "" : "s"}${unavailable ? ` · ${unavailable} unavailable` : ""}</span></div>
      <button type="button" class="week-select" data-group-id="${group.id}" aria-pressed="${selectionState}"><span>${allSelected ? "Clear week" : "Select week"}</span><small>${selectedCount}/${selectable.length}</small></button>
    </header>`;
    return `<section class="prompt-group" data-group-id="${group.id}">${header}<div class="prompt-group-cells">${cells.map(renderCard).join("")}</div></section>`;
  };
  elements.matrix.innerHTML = groupedVisible.map(renderGroup).join("");
  refreshIcons();
  elements.matrix.scrollTop = resetScroll ? 0 : previousScrollTop;
  window.requestAnimationFrame(updateMatrixScrollControls);
  if (animateRows) enterVisibleItems(elements.matrix, ".prompt-card");
  elements.matrix.querySelectorAll<HTMLElement>(".prompt-card:not(.disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset["id"];
      if (!id) return;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      syncCardSelection(card, selected.has(id));
      syncVisibleGroupControls();
      updateSelection();
    });
  });
  elements.matrix.querySelectorAll<HTMLButtonElement>(".prompt-delete[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset["deleteId"];
      if (id) removePromptCell(id);
    });
  });
  elements.matrix.querySelectorAll<HTMLButtonElement>(".week-select[data-group-id]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!matrix) return;
      const group = matrix.groups.find((candidate) => candidate.id === button.dataset["groupId"]);
      if (!group) return;
      const cellMap = new Map(matrix.cells.map((cell) => [cell.id, cell]));
      const selectable = group.cellIds
        .map((id) => cellMap.get(id))
        .filter((cell): cell is PromptCell => Boolean(cell && !cell.disabled));
      const clear = selectable.length > 0 && selectable.every((cell) => selected.has(cell.id));
      selectable.forEach((cell) => clear ? selected.delete(cell.id) : selected.add(cell.id));
      syncVisibleSelections();
      updateSelection();
    });
  });
}

function syncCardSelection(card: HTMLElement, isSelected: boolean, animateCheck = true): void {
  card.classList.toggle("selected", isSelected);
  card.setAttribute("aria-pressed", String(isSelected));
  const checkDot = card.querySelector<HTMLElement>(".check-dot");
  if (isSelected && animateCheck) {
    if (checkDot) animateSelection(checkDot);
  }
}

function syncVisibleSelections(): void {
  const token = ++selectionSyncToken;
  const cards = [...elements.matrix.querySelectorAll<HTMLElement>(".prompt-card[data-id]")];
  syncVisibleGroupControls();
  let index = 0;
  const syncChunk = () => {
    if (token !== selectionSyncToken) return;
    const end = Math.min(index + 12, cards.length);
    for (; index < end; index += 1) {
      const card = cards[index]!;
      const id = card.dataset["id"];
      if (id) syncCardSelection(card, selected.has(id), false);
    }
    if (index < cards.length) window.requestAnimationFrame(syncChunk);
  };
  syncChunk();
}

function syncVisibleGroupControls(): void {
  if (!matrix) return;
  const cellMap = new Map(matrix.cells.map((cell) => [cell.id, cell]));
  const groupMap = new Map(matrix.groups.map((group) => [group.id, group]));
  elements.matrix.querySelectorAll<HTMLButtonElement>(".week-select[data-group-id]").forEach((button) => {
    const group = groupMap.get(button.dataset["groupId"] ?? "");
    if (!group) return;
    const selectable = group.cellIds
      .map((id) => cellMap.get(id))
      .filter((cell): cell is PromptCell => Boolean(cell && !cell.disabled));
    const selectedCount = selectable.filter((cell) => selected.has(cell.id)).length;
    const allSelected = selectable.length > 0 && selectedCount === selectable.length;
    button.setAttribute("aria-pressed", allSelected ? "true" : selectedCount > 0 ? "mixed" : "false");
    const action = button.querySelector<HTMLElement>("span");
    const count = button.querySelector<HTMLElement>("small");
    if (action) action.textContent = allSelected ? "Clear week" : "Select week";
    if (count) count.textContent = `${selectedCount}/${selectable.length}`;
  });
}

function renderTelemetry(next: SessionTelemetry): void {
  session = next;
  const telemetry = document.querySelector<HTMLElement>(".telemetry");
  const wasHidden = telemetry?.classList.contains("hidden") ?? false;
  telemetry?.classList.remove("hidden");
  telemetry?.setAttribute("data-status", next.status);
  elements.sessionStatus.textContent = next.status.toUpperCase();
  const waveLabel = next.waveCount != null && next.waveIndex != null && next.waveCount > 1
    ? ` · batch ${next.waveIndex + 1}/${next.waveCount}`
    : "";
  const phaseLabel = next.phase && next.phase !== "done" ? ` · ${next.phase.replaceAll("_", " ")}` : "";
  elements.sessionMessage.textContent = `${next.message}${waveLabel}${phaseLabel}`;
  const active = next.status === "pending" || next.status === "processing";
  if (active) {
    startElapsedTicker(next.elapsedMs);
    elements.elapsed.textContent = formatElapsed(next.elapsedMs);
  } else {
    stopElapsedTicker();
    elements.elapsed.textContent = formatElapsed(next.elapsedMs);
  }
  const pct = next.totalPrompts > 0 ? Math.min(100, Math.round((next.completedCount / next.totalPrompts) * 100)) : 0;
  elements.progress.textContent = `${next.completedCount} / ${next.totalPrompts}`;
  elements.progressBar.style.width = `${pct}%`;
  elements.eta.textContent = active ? formatEta(next.etaMs) : "—";
  const estimate = Number.isFinite(next.estimateUsd) ? next.estimateUsd : 0;
  elements.sessionCost.textContent = `$${next.costUsd.toFixed(3)} · est $${estimate.toFixed(3)} · PKR ${next.costPkr.toFixed(2)}`;
  elements.fxRate.textContent = `PKR ${next.fxRate.toFixed(2)}`;
  void refreshWaveQueue(next);
  syncActionState();
  if (pollTimer !== null && ["partial", "completed", "failed", "cancelled"].includes(next.status)) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (wasHidden && telemetry) enter(telemetry);
  if (lastTelemetryStatus !== next.status) {
    animateState(elements.sessionStatus);
    animateState(elements.sessionMessage);
    lastTelemetryStatus = next.status;
  }
}

function updateMatrixScrollControls(): void {
  const maxScroll = Math.max(0, elements.matrix.scrollHeight - elements.matrix.clientHeight);
  elements.matrixScrollUp.disabled = elements.matrix.scrollTop <= 1;
  elements.matrixScrollDown.disabled = maxScroll <= 1 || elements.matrix.scrollTop >= maxScroll - 1;
  if (matrix?.cells.length) {
    const first = matrixPage * PAGE_SIZE + 1;
    const last = Math.min(matrix.cells.length, first + PAGE_SIZE - 1);
    const percent = maxScroll <= 1 ? 100 : Math.round((elements.matrix.scrollTop / maxScroll) * 100);
    elements.matrixScrollPosition.textContent = `Rows ${first}–${last} of ${matrix.cells.length} · ${percent}%`;
  }
}

function setMatrixView(view: "list" | "cards"): void {
  if (matrixView === view) return;
  matrixView = view;
  localStorage.setItem("bulkimg-prompt-view", view);
  renderMatrix(false, false);
  enterVisibleItems(elements.matrix, ".prompt-card", 6);
  elements.matrix.focus({ preventScroll: true });
}

function openKeysDialog(focusTarget: HTMLElement): void {
  if (!elements.keysDialog.open) elements.keysDialog.showModal();
  if (motionAllowed()) {
    void animate(elements.keysDialog, { opacity: [0.72, 1], transform: ["translateY(6px) scale(0.985)", "translateY(0px) scale(1)"] }, { duration: 0.2, ease: [0.16, 1, 0.3, 1] });
  }
  window.requestAnimationFrame(() => focusTarget.focus());
}

function scrollPromptSelections(direction: -1 | 1): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.matrix.scrollBy({
    top: direction * Math.max(160, Math.round(elements.matrix.clientHeight * 0.75)),
    behavior: reduced ? "auto" : "smooth",
  });
  elements.matrix.focus({ preventScroll: true });
}

function referenceFileError(file: File): string | null {
  const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
  const lowerName = file.name.toLowerCase();
  const fallbackMimeType = lowerName.endsWith(".png")
    ? "image/png"
    : lowerName.endsWith(".webp")
      ? "image/webp"
      : /\.jpe?g$/.test(lowerName)
        ? "image/jpeg"
        : "";
  const mimeType = file.type || fallbackMimeType;
  if (!supportedTypes.has(mimeType)) return "Choose PNG, JPEG, or WebP reference images.";
  if (file.size === 0) return null; // skip empty clipboard placeholders without toast spam
  if (file.size > referenceLimitBytes()) return "Each reference can be up to 50 MB.";
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read image data."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read image data."));
    reader.readAsDataURL(file);
  });
}

function logUi(event: string, fields: Record<string, unknown> = {}): void {
  void (async () => {
    try {
      const rpcClient = app.rpc;
      if (!rpcClient?.request?.writeDiagnosticLog) {
        console.warn("[bulkimg:diag] RPC not ready for", event, fields);
        return;
      }
      await rpcClient.request.writeDiagnosticLog({ event, fields });
    } catch (error) {
      console.warn("[bulkimg:diag] write failed", event, error);
    }
  })();
}

function looksLikeCsvText(text: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Clipboard text is empty." };
  if (trimmed.length > 10 * 1024 * 1024) return { ok: false, reason: "Pasted text is larger than 10 MB." };
  const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 1) return { ok: false, reason: "Clipboard text is empty." };
  const sample = lines.slice(0, 30);
  const delimiterCounts = {
    comma: sample.filter((line) => line.includes(",")).length,
    tab: sample.filter((line) => line.includes("\t")).length,
    semi: sample.filter((line) => line.includes(";")).length,
  };
  const maxDelim = Math.max(delimiterCounts.comma, delimiterCounts.tab, delimiterCounts.semi);
  if (maxDelim === 0 && lines.length < 2) {
    return { ok: false, reason: "That paste does not look like CSV. Copy spreadsheet cells or a .csv file and try again." };
  }
  // Reject pure HTML clipboard noise
  if (/^<!DOCTYPE html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return { ok: false, reason: "Clipboard has HTML, not CSV. Copy from Excel/Sheets or a .csv file." };
  }
  return { ok: true };
}

function referenceMimeType(file: File): string {
  if (file.type) return file.type;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function renderReferenceImages(announcement?: string): void {
  const count = referenceImages.length;
  const limit = referenceLimit();
  elements.referenceControl.dataset["count"] = String(count);
  elements.referenceDock.classList.toggle("has-image", count > 0);
  elements.referenceDock.disabled = count >= limit;
  elements.referenceTitle.textContent = count === 0 ? "Add reference images" : count >= limit ? "References ready" : "Add another reference";
  elements.referenceHint.textContent = count === 0
    ? `Drop, Ctrl+V, or Win+V · up to ${limit} images · 50 MB each`
    : count >= limit ? "Remove an image to add another" : "Click, drop, Ctrl+V, or Win+V to add more";
  elements.referenceBadge.textContent = `${count}/${limit}`;
  setHidden(elements.referenceBadge, count === 0);
  setHidden(elements.referenceList, count === 0);
  elements.referenceList.innerHTML = referenceImages.map((reference, index) => `
    <div class="reference-item" role="listitem">
      <img src="${escapeHtml(reference.previewUrl)}" alt="" />
      <span><strong>${escapeHtml(reference.name)}</strong><small>Reference ${index + 1}</small></span>
      <button type="button" class="reference-remove" data-file-id="${escapeHtml(reference.fileId)}" aria-label="Remove ${escapeHtml(reference.name)}"><i data-lucide="x"></i></button>
    </div>
  `).join("");
  refreshIcons();
  if (count) enterVisibleItems(elements.referenceList, ".reference-item");
  if (announcement) elements.referenceStatus.textContent = announcement;
  elements.referenceList.querySelectorAll<HTMLButtonElement>(".reference-remove").forEach((button) => {
    button.addEventListener("click", async () => {
      const fileId = button.dataset["fileId"];
      const reference = referenceImages.find((item) => item.fileId === fileId);
      if (!fileId || !reference) return;
      button.disabled = true;
      try {
        await app.rpc!.request.removeReferenceImage({ fileId });
        URL.revokeObjectURL(reference.previewUrl);
        referenceImages = referenceImages.filter((item) => item.fileId !== fileId);
        renderReferenceImages(`${reference.name} removed. ${referenceImages.length} reference images attached.`);
        void refreshEstimate();
      } catch (error) {
        button.disabled = false;
        showToast(error instanceof Error ? error.message : "Could not remove the reference image.", true);
      }
    });
  });
}

function setReferencePasteBusy(busy: boolean, label = "Uploading reference image…", hint = "Saving it to this run…"): void {
  elements.referenceControl.classList.toggle("uploading", busy);
  elements.referenceDock.toggleAttribute("aria-busy", busy);
  elements.pasteReference.disabled = busy;
  elements.pickReference.disabled = busy;
  if (!busy) {
    renderReferenceImages();
    return;
  }
  elements.referenceDock.disabled = true;
  elements.referenceTitle.textContent = label;
  elements.referenceHint.textContent = hint;
  elements.referenceBadge.textContent = "Uploading";
  setHidden(elements.referenceBadge, false);
  elements.referenceStatus.textContent = label;
}

async function attachReferenceFiles(files: File[], alreadyInFlight = false): Promise<void> {
  if (referencePasteInFlight && !alreadyInFlight) {
    logUi("ui_reference_paste_ignored", { reason: "upload_in_progress", attempted: files.length });
    return;
  }
  const startedAt = performance.now();
  logUi("ui_reference_attach_start", {
    attempted: files.length,
    bytes: files.reduce((total, file) => total + file.size, 0),
  });
  const limit = referenceLimit();
  const remaining = limit - referenceImages.length;
  if (remaining <= 0) {
    showToast("You can attach at most 16 reference images.", true);
    return;
  }
  const nonEmpty = files.filter((file) => file.size > 0);
  if (!nonEmpty.length) {
    showToast("No usable image data found. Copy a real PNG/JPEG/WebP and press Ctrl+V.", true);
    logUi("ui_reference_paste", { ok: false, reason: "empty_files", attempted: files.length });
    return;
  }
  const accepted = nonEmpty.slice(0, remaining);
  if (nonEmpty.length > accepted.length) showToast("You can attach at most 16 reference images.", true);
  if (!alreadyInFlight) referencePasteInFlight = true;
  setReferencePasteBusy(true, `Uploading ${accepted.length} reference image${accepted.length === 1 ? "" : "s"}…`);
  let uploaded = 0;
  let skippedEmpty = files.length - nonEmpty.length;
  let skippedInvalid = 0;
  for (const file of accepted) {
    const validationError = referenceFileError(file);
    if (validationError === null && file.size === 0) {
      skippedEmpty += 1;
      continue;
    }
    if (validationError) {
      skippedInvalid += 1;
      showToast(validationError, true);
      continue;
    }
    try {
      const dataBase64 = await fileToBase64(file);
      if (!dataBase64 || dataBase64.length < 8) {
        skippedEmpty += 1;
        continue;
      }
      const result = await app.rpc!.request.uploadReferenceImage({
        dataBase64,
        filename: file.name || `clipboard-${Date.now()}.png`,
        mimeType: referenceMimeType(file),
      });
      referenceImages.push({ fileId: result.fileId, name: file.name || "Pasted image", previewUrl: URL.createObjectURL(file) });
      uploaded += 1;
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Could not upload ${file.name || "the reference image"}.`, true);
      logUi("ui_reference_upload_error", { name: file.name, message: error instanceof Error ? error.message : "error" });
    }
  }
  try {
    elements.referenceFile.value = "";
    renderReferenceImages(uploaded ? `${uploaded} reference image${uploaded === 1 ? "" : "s"} added. ${referenceImages.length} attached.` : undefined);
    if (uploaded) {
      showToast(`${uploaded} reference image${uploaded === 1 ? "" : "s"} added.`);
      void refreshEstimate();
    } else if (skippedEmpty && !skippedInvalid) {
      showToast("Clipboard image was empty. Try copying the image again, then Ctrl+V.", true);
    }
    logUi("ui_reference_attach", {
      uploaded,
      skippedEmpty,
      skippedInvalid,
      attempted: files.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    if (!alreadyInFlight) referencePasteInFlight = false;
    if (!referencePasteInFlight) setReferencePasteBusy(false);
  }
}

function releaseReferencesToSession(): void {
  referenceImages.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
  referenceImages = [];
  renderReferenceImages("References assigned to the submitted session.");
}

function keyStatus(key: ApiKeyStats): { label: string; className: string } {
  if (key.currentSessionId) return { label: "In use", className: "current" };
  if (key.isRateLimited) return { label: "Rate limited", className: "limited" };
  if (!key.isActive) return { label: "Paused", className: "paused" };
  return { label: "Active", className: "" };
}

async function loadKeys(): Promise<void> {
  const keys = await app.rpc!.request.listApiKeys({});
  const active = keys.filter((key) => key.isActive).length;
  activeKeyCount = active;
  const requests = keys.reduce((sum, key) => sum + key.totalRequests, 0);
  const tokens = keys.reduce((sum, key) => sum + key.inputTokens + key.outputTokens, 0);
  const spend = keys.reduce((sum, key) => sum + key.costUsd, 0);
  activeKeyCount = active;
  syncKeyCountBadge(active);
  elements.genTabCount.textContent = String(keys.length);
  elements.activeKeyTotal.textContent = String(active);
  elements.keyRequestTotal.textContent = formatNumber(requests);
  elements.keyTokenTotal.textContent = formatNumber(tokens);
  elements.keySpendTotal.textContent = `$${spend.toFixed(3)}`;
  elements.keySummary.classList.toggle("hidden", requests === 0 && tokens === 0 && spend === 0);
  elements.keyList.innerHTML = keys.length ? keys.map((key) => {
    const status = keyStatus(key);
    const usage = key.totalRequests > 0
      ? `<small>${formatNumber(key.totalRequests)} requests · ${formatNumber(key.inputTokens + key.outputTokens)} tokens · $${key.costUsd.toFixed(3)}</small>`
      : "";
    return `<article class="key-row" data-key-id="${key.id}">
      <div><strong>${escapeHtml(key.label)}</strong><small>${escapeHtml(key.keyHint)} · ${status.label}</small>${usage}</div>
      <button class="secondary-button toggle-key" data-key-id="${key.id}" data-active="${key.isActive}">${key.isActive ? "Pause" : "Resume"}</button>
      <button class="secondary-button danger-button delete-key" data-key-id="${key.id}">Remove</button>
    </article>`;
  }).join("") : '<div class="empty-state"><i data-lucide="key-round"></i><strong>No API keys</strong><small>Add API key to enable generation.</small></div>';
  refreshIcons();
  enterVisibleItems(elements.keyList, ".key-row", 6);

  elements.keyList.querySelectorAll<HTMLButtonElement>(".toggle-key").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset["keyId"];
      if (!id) return;
      button.disabled = true;
      try {
        await app.rpc!.request.setApiKeyActive({ id, isActive: button.dataset["active"] !== "true" });
        await loadKeys();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not update key", true);
        button.disabled = false;
      }
    });
  });
  elements.keyList.querySelectorAll<HTMLButtonElement>(".delete-key").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset["keyId"];
      if (!id || !window.confirm("Remove this encrypted API key from BulkImg Studio?")) return;
      button.disabled = true;
      try {
        await app.rpc!.request.deleteApiKey({ id });
        await loadKeys();
        showToast("API key removed.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not remove key", true);
        button.disabled = false;
      }
    });
  });
  syncActionState();
}

function usageRangeBounds(value: string): { startAt: string | null; endAt: string } {
  const end = new Date();
  if (value === "all") return { startAt: null, endAt: end.toISOString() };
  const days = value === "7d" ? 7 : value === "90d" ? 90 : 30;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function money(value: number, decimals = 3): string {
  return `$${value.toFixed(decimals)}`;
}

function usageKpi(label: string, value: string, detail: string): string {
  return `<article class="usage-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function renderUsageSummary(summary: UsageSummary): void {
  const totalTokens = summary.total.inputTokens + summary.total.outputTokens;
  elements.usageSummaryGrid.innerHTML = [
    usageKpi("Requests", formatNumber(summary.total.requestCount), `${formatNumber(summary.total.completedCount)} completed`),
    usageKpi("Images", formatNumber(summary.total.completedCount), `${formatNumber(summary.total.failedCount)} failed`),
    usageKpi("Tokens", formatNumber(totalTokens), `in ${formatNumber(summary.total.inputTokens)} · out ${formatNumber(summary.total.outputTokens)}`),
    usageKpi("Tracked cost", money(summary.total.costUsd), `PKR ${summary.total.costPkr.toFixed(2)} · this app`),
  ].join("");

  const modes: Array<[string, UsageTotals]> = [["Direct", summary.direct], ["Batch", summary.batch]];
  elements.usageModeComparison.innerHTML = modes.map(([label, totals]) => {
    const tokens = totals.inputTokens + totals.outputTokens;
    return `<article class="usage-mode-card">
      <div class="usage-mode-title"><strong>${label}</strong><span>${formatNumber(totals.requestCount)} requests</span></div>
      <div class="usage-mode-value">${money(totals.costUsd)}</div>
      <div class="usage-stat-list">
        <div><span>Completed</span><strong>${formatNumber(totals.completedCount)}</strong></div>
        <div><span>Tokens</span><strong>${formatNumber(tokens)}</strong></div>
        <div><span>Input / output</span><strong>${formatNumber(totals.inputTokens)} / ${formatNumber(totals.outputTokens)}</strong></div>
      </div>
    </article>`;
  }).join("");
  enter(elements.usageSummaryGrid, 0, 4);
  elements.usageModeComparison.querySelectorAll<HTMLElement>(".usage-mode-card").forEach((card, index) => {
    enter(card, index * 0.04, 4);
  });
}

function renderUsageLimits(): void {
  const data = bootstrapData;
  if (!data) return;
  const local: Array<[string, string]> = [
    ["Direct prompts", `up to ${formatNumber(data.limits.directPromptLimit)}`],
    ["Batch prompts", `up to ${formatNumber(data.limits.batchPromptLimit)}`],
    ["Reference images", `up to ${formatNumber(data.limits.maxReferences)}`],
    ["Reference size", formatBytes(data.limits.maxReferenceBytes)],
    ["Prompt length", `${formatNumber(data.limits.maxPromptChars)} chars`],
  ];
  const localHtml = `<div class="usage-limit-group"><h4>App limits</h4>${local.map(([label, value]) =>
    `<div class="usage-limit-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;

  const provider = data.admin?.rateLimits;
  const probe = data.rateHeaderProbe;
  const providerRows: string[] = [];
  if (provider) {
    providerRows.push(
      `<div class="usage-limit-row"><span>Project images / min</span><strong>${provider.maxImagesPerMinute == null ? "—" : formatNumber(provider.maxImagesPerMinute)}</strong></div>`,
      `<div class="usage-limit-row"><span>Project requests / min</span><strong>${provider.maxRequestsPerMinute == null ? "—" : formatNumber(provider.maxRequestsPerMinute)}</strong></div>`,
      `<div class="usage-limit-row"><span>Project tokens / min</span><strong>${provider.maxTokensPerMinute == null ? "—" : formatNumber(provider.maxTokensPerMinute)}</strong></div>`,
      `<div class="usage-limit-row"><span>Batch queued tokens / day</span><strong>${provider.batchDayMaxInputTokens == null ? "—" : formatNumber(provider.batchDayMaxInputTokens)}</strong></div>`,
    );
  }
  if (probe && (probe.limitRequests != null || probe.limitTokens != null || probe.limitImages != null)) {
    const reset = [probe.resetRequests ? `requests reset ${probe.resetRequests}` : "", probe.resetTokens ? `tokens reset ${probe.resetTokens}` : ""]
      .filter(Boolean).join(" · ");
    providerRows.push(
      `<div class="usage-limit-row"><span>Latest request window</span><strong>${probe.remainingRequests == null ? "—" : formatNumber(probe.remainingRequests)} / ${probe.limitRequests == null ? "—" : formatNumber(probe.limitRequests)} req</strong></div>`,
      `<div class="usage-limit-row"><span>Latest token window</span><strong>${probe.remainingTokens == null ? "—" : formatNumber(probe.remainingTokens)} / ${probe.limitTokens == null ? "—" : formatNumber(probe.limitTokens)} tok</strong></div>`,
      reset ? `<small class="usage-limit-note">${escapeHtml(reset)}</small>` : "",
    );
  }
  const scope = provider
    ? `Project ${data.admin?.projectId ?? "configured"} · fetched ${formatDate(provider.fetchedAt)}`
    : probe?.capturedAt
      ? `Latest API response · captured ${formatDate(probe.capturedAt)}`
      : !data.admin?.configured
        ? "No Admin key configured"
        : !data.admin.projectId
          ? "Admin key saved · no project selected"
          : "Project limits not loaded yet";
  const providerEmpty = !data.admin?.configured
    ? "Add an Admin key in API keys to load project limits. Generation keys still track this app’s usage."
    : !data.admin.projectId
      ? "Select a Project in the Admin tab, then refresh limits."
      : (data.admin.lastError ?? "Refresh limits to load the selected project snapshot.");
  const providerHtml = `<div class="usage-limit-group"><h4>Provider limits <small>${escapeHtml(scope)}</small></h4>${
    providerRows.length ? providerRows.join("") : `<p class="usage-limit-empty">${escapeHtml(providerEmpty)}</p>`
  }</div>`;
  elements.usageLimits.innerHTML = localHtml + providerHtml;
}

function renderPricing(): void {
  const pricing = pricingView;
  if (!pricing) return;
  elements.usagePricingMeta.textContent = `${pricing.version} · ${pricing.source}`;
  const perMillion = (rate: number) => `${money(rate * 1_000_000, rate * 1_000_000 < 1 ? 2 : 0)} / 1M`;
  const tokenRows: Array<[string, number]> = [
    ["Text input", pricing.textInputTokenUsd],
    ["Image input", pricing.imageInputTokenUsd],
    ["Cached text input", pricing.cachedTextInputTokenUsd],
    ["Cached image input", pricing.cachedImageInputTokenUsd],
    ["Image output", pricing.imageOutputTokenUsd],
  ];
  const formats: Array<keyof PricingView["imageEstimatesUsd"]> = ["square", "portrait", "landscape", "story"];
  elements.usagePricing.innerHTML = `
    <div class="usage-pricing-tokens">${tokenRows.map(([label, rate]) =>
      `<div class="usage-price-row"><span>${label}</span><strong>${perMillion(rate)}</strong></div>`).join("")}</div>
    <div class="usage-image-prices">
      <div class="usage-price-row usage-price-heading"><span>Format · ratio · resolution</span><strong>Low · Medium · High</strong></div>
      ${formats.map((key) => {
        const rates = pricing.imageEstimatesUsd[key];
        const format = OUTPUT_FORMATS[key];
        return `<div class="usage-price-row"><span>${format.label} · ${format.ratio} · ${format.size}</span><strong>${money(rates.low)} · ${money(rates.medium)} · ${money(rates.high)}</strong></div>`;
      }).join("")}
      <small class="usage-limit-note">Reference input estimate: ${money(pricing.referenceInputEstimateUsd)} each · Batch discount: ${Math.round(pricing.batchDiscount * 100)}%</small>
    </div>
    <div class="usage-pricing-notes">
      <div><strong>Cached prompts</strong><span>OpenAI may classify eligible repeated input as cached. This app displays the cached rate, but does not force caching.</span></div>
      <div><strong>Reference images</strong><span>Used in edit requests through the attached reference files. Their returned image-input tokens are part of actual usage; the per-reference amount above is only a pre-run estimate.</span></div>
    </div>
    <div class="usage-pricing-examples">
      <h4>Cost examples</h4>
      <div class="usage-example"><strong>1 prompt · no references</strong><span>1 text input + 1 generated image output</span><em>Direct and Batch use different rates</em></div>
      <div class="usage-example"><strong>15 prompts · 4 references</strong><span>4 references are uploaded once, then used across 15 requests = up to 60 image-input uses</span><em>Batch applies 50% to the token bill; caching only lowers it when OpenAI reports cached tokens</em></div>
    </div>`;
  enter(elements.usagePricing, 0.08, 4);
}

async function loadUsage(): Promise<void> {
  elements.refreshUsage.disabled = true;
  elements.refreshUsage.setAttribute("aria-busy", "true");
  elements.usageStatus.textContent = "Loading local usage…";
  elements.usageSummaryGrid.innerHTML = '<div class="usage-loading">Reading this app’s local ledger…</div>';
  try {
    const [summary, latestBootstrap] = await Promise.all([
      app.rpc!.request.getUsageSummary(usageRangeBounds(elements.usageRange.value)),
      app.rpc!.request.getBootstrap({}),
    ]);
    bootstrapData = latestBootstrap;
    pricingView = latestBootstrap.pricing;
    renderUsageSummary(summary);
    renderUsageLimits();
    renderPricing();
    const rangeLabel = elements.usageRange.options[elements.usageRange.selectedIndex]?.textContent ?? "selected range";
    elements.usageStatus.textContent = `${rangeLabel} · updated ${formatDate(summary.generatedAt)}`;
  } catch (error) {
    elements.usageStatus.textContent = error instanceof Error ? error.message : "Could not load usage.";
    elements.usageSummaryGrid.innerHTML = '<div class="empty-state"><strong>Usage unavailable</strong><small>Try refreshing the local ledger.</small></div>';
  } finally {
    elements.refreshUsage.disabled = false;
    elements.refreshUsage.removeAttribute("aria-busy");
  }
}

async function loadSessions(): Promise<void> {
  elements.refreshSessions.disabled = true;
  elements.refreshSessions.setAttribute("aria-busy", "true");
  elements.sessionList.setAttribute("aria-busy", "true");
  elements.sessionList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="loader-circle"></i></span><strong>Loading sessions…</strong><small>Reading local run history.</small></div>';
  refreshIcons();
  try {
    const [runs, sessions] = await Promise.all([
      app.rpc!.request.listRuns({}).catch(() => [] as RunSummary[]),
      app.rpc!.request.listSessions({}).catch(() => [] as SessionSummary[]),
    ]);
    const covered = new Set(runs.flatMap((run) => run.sessions.map((wave) => wave.sessionId)));
    const orphans = sessions.filter((session) => !session.parentRunId || !covered.has(session.sessionId));
    if (!runs.length && !orphans.length) {
      elements.sessionList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="clock-3"></i></span><strong>No sessions yet</strong><small>Completed and active runs will appear here.</small></div>';
    } else {
      const runHtml = runs.map((run) => {
        const phaseBits = run.sessions.map((wave) => {
          const label = wave.waveIndex != null ? `Batch ${wave.waveIndex + 1}` : wave.sessionId.slice(0, 8);
          return `<article class="data-row wave-row session-row" data-session-id="${wave.sessionId}">
            <div class="session-row-main">
              <div><strong>${escapeHtml(label)}</strong><span>${formatDate(wave.startTime)}</span></div>
              <div><span>Status</span><strong class="status-badge status-${escapeHtml(wave.status)}">${escapeHtml(wave.status)}</strong></div>
              <div><span>Progress</span><strong>${wave.completedCount} / ${wave.totalPrompts}</strong></div>
              <div><span>Cost</span><strong>$${wave.costUsd.toFixed(3)}</strong></div>
              <div class="session-actions">
                <button class="secondary-button session-detail" data-session-id="${wave.sessionId}">Details</button>
                <button class="secondary-button session-live" data-session-id="${wave.sessionId}">Live</button>
                ${wave.runMode === "batch" && ["pending", "processing"].includes(wave.status) ? `<button class="secondary-button session-check" data-session-id="${wave.sessionId}">Check now</button>` : ""}
                ${["pending", "processing"].includes(wave.status) ? `<button class="secondary-button session-cancel" data-session-id="${wave.sessionId}">Cancel</button>` : ""}
                ${wave.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(wave.status) ? `<button class="secondary-button session-resume" data-session-id="${wave.sessionId}">Resume</button>` : ""}
                <button class="secondary-button session-export" data-session-id="${wave.sessionId}">Export</button>
              </div>
            </div>
            <div class="session-detail-panel hidden" data-detail-for="${wave.sessionId}" hidden></div>
          </article>`;
        }).join("");
        const canResumeRun = run.sessions.some((wave) => wave.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(wave.status));
        return `<section class="run-group" data-run-id="${run.runId}">
          <header class="run-group-head">
            <div><strong>Run ${escapeHtml(run.runId.slice(0, 8))}</strong><span>${formatDate(run.startTime)} · ${escapeHtml(run.runMode)} · ${run.waveCount || 1} batch(es)</span></div>
            <div class="run-group-stats">
              <strong class="status-badge status-${escapeHtml(run.status)}">${escapeHtml(run.status)}</strong>
              <span>${run.completedCount}/${run.totalPrompts}</span>
              <span>$${run.costUsd.toFixed(3)} / est $${run.estimateUsd.toFixed(3)}</span>
            </div>
            <div class="session-actions">
              ${run.waveStrategy === "guided" && run.sessions.some((wave) => wave.status === "pending") ? `<button class="secondary-button run-continue" data-run-id="${run.runId}">Continue next batch</button>` : ""}
              ${canResumeRun ? `<button class="secondary-button run-resume" data-run-id="${run.runId}">Resume leftovers</button>` : ""}
              <button class="secondary-button run-export" data-run-id="${run.runId}">Export run</button>
            </div>
          </header>
          ${phaseBits || '<p class="empty-inline">No wave sessions yet.</p>'}
        </section>`;
      }).join("");
      const orphanHtml = orphans.map((item) => `
      <article class="data-row session-row" data-session-id="${item.sessionId}">
        <div class="session-row-main">
          <div><strong>${escapeHtml(item.sessionId.slice(0, 8))}</strong><span>${formatDate(item.startTime)}</span></div>
          <div><span>Status</span><strong class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</strong></div>
          <div><span>Output</span><strong>${escapeHtml(item.format)} · ${escapeHtml(item.quality)}</strong></div>
          <div><span>Progress</span><strong>${item.completedCount} / ${item.totalPrompts}</strong></div>
          <div class="session-actions">
            <button class="secondary-button session-detail" data-session-id="${item.sessionId}">Details</button>
            <button class="secondary-button session-live" data-session-id="${item.sessionId}">Live</button>
            ${item.runMode === "batch" && ["pending", "processing"].includes(item.status) ? `<button class="secondary-button session-check" data-session-id="${item.sessionId}">Check now</button>` : ""}
            ${["pending", "processing"].includes(item.status) ? `<button class="secondary-button session-cancel" data-session-id="${item.sessionId}">Cancel</button>` : ""}
            ${item.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(item.status) ? `<button class="secondary-button session-resume" data-session-id="${item.sessionId}">Resume</button>` : ""}
            ${["partial", "failed"].includes(item.status) ? `<button class="secondary-button session-diagnostic" data-diagnostic-id="${item.diagnosticId}">Copy ID</button>` : ""}
            <button class="secondary-button session-export" data-session-id="${item.sessionId}">Export</button>
          </div>
        </div>
        <div class="session-detail-panel hidden" data-detail-for="${item.sessionId}" hidden></div>
      </article>`).join("");
      elements.sessionList.innerHTML = `${runHtml}${orphanHtml}`;
    }
    enterVisibleItems(elements.sessionList, ".data-row, .run-group");
    bindSessionListHandlers();
  } catch (error) {
    elements.sessionList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load sessions")}</div>`;
  } finally {
    elements.sessionList.removeAttribute("aria-busy");
    elements.refreshSessions.disabled = false;
    elements.refreshSessions.removeAttribute("aria-busy");
    refreshIcons();
  }
}

function formatPhaseGrid(t: SessionTelemetry): string {
  const d = t.durationMs ?? {};
  const rows = [
    ["Submit / remote", d.remote ?? d.submit],
    ["Download", d.download],
    ["Save", d.persist],
  ];
  return rows.map(([label, ms]) => `<div><span>${label}</span><strong>${formatDurationMs(ms as number | null)}</strong></div>`).join("");
}

function formatPromptRows(prompts: SessionPromptOutcome[]): string {
  if (!prompts.length) return "<p class=\"empty-inline\">No prompts recorded.</p>";
  return `<table class="prompt-outcome-table">
    <thead><tr><th>#</th><th>Prompt</th><th>Status</th><th>Duration</th><th>Cost</th><th>Image</th></tr></thead>
    <tbody>${prompts.map((prompt) => `
      <tr>
        <td>${prompt.ordinal}</td>
        <td title="${escapeHtml(prompt.promptText)}">${escapeHtml(prompt.promptText.length > 96 ? `${prompt.promptText.slice(0, 96)}…` : prompt.promptText)}</td>
        <td><span class="status-badge status-${escapeHtml(prompt.status)}">${escapeHtml(prompt.status)}</span></td>
        <td>${formatDurationMs(prompt.durationMs)}</td>
        <td>$${prompt.costUsd.toFixed(3)}</td>
        <td>${prompt.hasImage ? "Yes" : "—"}</td>
      </tr>`).join("")}</tbody>
  </table>`;
}

function renderSessionDetailHtml(detail: SessionDetail): string {
  const t = detail.telemetry;
  const wave = t.waveCount != null && t.waveIndex != null ? `Batch ${t.waveIndex + 1}/${t.waveCount}` : "Single session";
  const canResume = t.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(t.status);
  return `<div class="session-detail-inner">
    <div class="session-detail-meta">
      <div><span>Status</span><strong class="status-badge status-${escapeHtml(t.status)}">${escapeHtml(t.status)}</strong></div>
      <div><span>Phase</span><strong>${escapeHtml(t.phase.replaceAll("_", " "))}</strong></div>
      <div><span>Mode</span><strong>${escapeHtml(t.runMode)} · ${escapeHtml(t.format)} · ${escapeHtml(t.quality)}</strong></div>
      <div><span>Scope</span><strong>${escapeHtml(wave)}</strong></div>
      <div><span>Progress</span><strong>${t.completedCount} / ${t.totalPrompts}</strong></div>
      <div><span>Spent / est</span><strong>$${t.costUsd.toFixed(3)} / $${t.estimateUsd.toFixed(3)}</strong></div>
      <div><span>Elapsed / ETA</span><strong>${formatElapsed(t.elapsedMs)} / ${formatEta(t.etaMs)}</strong></div>
      <div><span>Diagnostic</span><strong title="${escapeHtml(t.diagnosticId)}">${escapeHtml(t.diagnosticId)}</strong></div>
    </div>
    <p class="session-detail-message">${escapeHtml(t.message)}</p>
    <div class="session-phase-grid">${formatPhaseGrid(t)}</div>
    <div class="session-detail-actions">
      <button type="button" class="secondary-button session-live" data-session-id="${t.sessionId}">View live strip</button>
      ${t.runMode === "batch" && ["pending", "processing"].includes(t.status) ? `<button type="button" class="secondary-button session-check" data-session-id="${t.sessionId}">Check now</button>` : ""}
      ${canResume ? `<button type="button" class="secondary-button session-resume" data-session-id="${t.sessionId}">Resume leftovers</button>` : ""}
      ${["pending", "processing"].includes(t.status) ? `<button type="button" class="secondary-button session-cancel" data-session-id="${t.sessionId}">Cancel</button>` : ""}
      <button type="button" class="secondary-button session-export" data-session-id="${t.sessionId}">Export ZIP</button>
      <button type="button" class="secondary-button session-diagnostic" data-diagnostic-id="${escapeHtml(t.diagnosticId)}">Copy diagnostic ID</button>
    </div>
    <h4 class="session-prompts-heading">Prompts</h4>
    ${formatPromptRows(detail.prompts)}
  </div>`;
}

async function toggleSessionDetail(sessionId: string, listRoot: ParentNode = elements.sessionList): Promise<void> {
  if (listRoot === elements.historyList) {
    const source = historyItems.find((item) => item.sessionId === sessionId && item.hasImage);
    if (source) {
      const groupId = source.parentRunId ?? source.sessionId;
      const images = historyItems.filter((item) => (item.parentRunId ?? item.sessionId) === groupId && item.hasImage);
      await openLightbox(images, Math.max(0, images.findIndex((item) => item.sessionId === sessionId)));
      return;
    }
  }
  const panel = listRoot.querySelector<HTMLElement>(`.session-detail-panel[data-detail-for="${sessionId}"]`);
  if (!panel) return;
  const isOpen = !panel.classList.contains("hidden") && !panel.hidden;
  listRoot.querySelectorAll<HTMLElement>(".session-detail-panel").forEach((node) => {
    node.classList.add("hidden");
    node.hidden = true;
    node.innerHTML = "";
  });
  if (isOpen) return;
  panel.classList.remove("hidden");
  panel.hidden = false;
  panel.innerHTML = '<div class="empty-inline">Loading session detail…</div>';
  try {
    const detail = await app.rpc!.request.getSessionDetail({ sessionId, refresh: false });
    panel.innerHTML = renderSessionDetailHtml(detail);
    refreshIcons();
    bindSessionListHandlers(panel, listRoot);
    enter(panel, 0, 4);
  } catch (error) {
    panel.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load detail")}</div>`;
  }
}

function bindSessionListHandlers(root: ParentNode = elements.sessionList, listRoot: ParentNode = elements.sessionList): void {
  root.querySelectorAll<HTMLButtonElement>(".session-detail").forEach((button) => {
    button.onclick = () => void toggleSessionDetail(button.dataset["sessionId"]!, listRoot);
  });
  root.querySelectorAll<HTMLButtonElement>(".session-live, .session-open").forEach((button) => {
    button.onclick = async () => {
      const detail = await app.rpc!.request.getSessionDetail({ sessionId: button.dataset["sessionId"]!, refresh: true });
      renderTelemetry(detail.telemetry);
      await setView("generator");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-cancel").forEach((button) => {
    button.onclick = async () => {
      await app.rpc!.request.cancelBatchRun({ sessionId: button.dataset["sessionId"]! });
      if (listRoot === elements.historyList) await loadHistory();
      else await loadSessions();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-check").forEach((button) => {
    button.onclick = async () => {
      await app.rpc!.request.getSessionDetail({ sessionId: button.dataset["sessionId"]!, refresh: true });
      if (listRoot === elements.historyList) await loadHistory();
      else await loadSessions();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-resume, .run-resume").forEach((button) => {
    button.onclick = async () => {
      if (!window.confirm(resumeConfirmMessage())) return;
      const runId = button.dataset["runId"];
      const sessionId = button.dataset["sessionId"];
      const next = await app.rpc!.request.resumeRun(runId ? { runId } : { sessionId: sessionId! });
      renderTelemetry(next);
      await startSessionPolling(next.sessionId);
      await setView("generator");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".run-continue").forEach((button) => {
    button.onclick = async () => {
      await continueQueuedWave(button.dataset["runId"]!, button);
      await setView("generator");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-export").forEach((button) => {
    button.onclick = async () => {
      const result = await app.rpc!.request.exportSessionZip({ sessionId: button.dataset["sessionId"]!, pickPath: true });
      if (result.filePath) showToast("Session ZIP exported.");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".run-export").forEach((button) => {
    button.onclick = async () => {
      const result = await app.rpc!.request.exportRunZip({ runId: button.dataset["runId"]!, pickPath: true });
      if (result.filePath) showToast("Run ZIP exported.");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-diagnostic").forEach((button) => {
    button.onclick = async () => {
      await navigator.clipboard.writeText(button.dataset["diagnosticId"]!);
      showToast("Diagnostic ID copied.");
    };
  });
}

async function loadExports(): Promise<void> {
  elements.refreshExports.disabled = true;
  elements.refreshExports.setAttribute("aria-busy", "true");
  elements.exportList.setAttribute("aria-busy", "true");
  elements.exportList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="loader-circle"></i></span><strong>Loading exports…</strong><small>Scanning the local exports folder.</small></div>';
  refreshIcons();
  try {
    const exports: ExportSummary[] = await app.rpc!.request.listExports({});
    elements.exportList.innerHTML = exports.length ? exports.map((item) => `
      <article class="data-row">
        <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.filePath)}</span></div>
        <div><span>Type</span><strong>ZIP archive</strong></div>
        <div><span>Size</span><strong>${formatBytes(item.sizeBytes)}</strong></div>
        <div><span>Modified</span><strong>${formatDate(item.modifiedAt)}</strong></div>
        <div><span>Location</span><strong>App exports folder</strong></div>
      </article>`).join("") : '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="archive"></i></span><strong>No exports yet</strong><small>Exported session ZIPs will appear here.</small></div>';
    enterVisibleItems(elements.exportList, ".data-row");
  } catch (error) {
    elements.exportList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load exports")}</div>`;
  } finally {
    elements.exportList.removeAttribute("aria-busy");
    elements.refreshExports.disabled = false;
    elements.refreshExports.removeAttribute("aria-busy");
    refreshIcons();
  }
}

function isErrorLogLine(line: string): boolean {
  if (/_error"|"category":"(timeout|network|provider|auth)"|"level":"error"/i.test(line)) return true;
  return /\berror\b/i.test(line) && /batch_|session_|download_|poll_|persist_/i.test(line);
}

function renderLogLines(lines: string[]): void {
  logsLines = lines;
  elements.logsCount.textContent = `${lines.length} line${lines.length === 1 ? "" : "s"}`;
  elements.logsList.innerHTML = lines.map((line) => {
    const error = isErrorLogLine(line);
    return `<code class="log-line${error ? " error" : ""}">${escapeHtml(line)}</code>`;
  }).join("");
  elements.copyLogs.disabled = lines.length === 0;
  elements.logsList.scrollTop = elements.logsList.scrollHeight;
}

async function loadLogs(): Promise<void> {
  elements.refreshLogs.disabled = true;
  elements.refreshLogs.setAttribute("aria-busy", "true");
  try {
    const result = await app.rpc!.request.getDiagnosticLogs({
      limit: 400,
      query: elements.logsSearch.value.trim() || undefined,
      event: elements.logsEvent.value || undefined,
    });
    const selectedEvent = elements.logsEvent.value;
    const options = ['<option value="">All events</option>']
      .concat(result.events.map((event) => `<option value="${escapeHtml(event)}">${escapeHtml(event)}</option>`));
    elements.logsEvent.innerHTML = options.join("");
    if (selectedEvent && result.events.includes(selectedEvent)) elements.logsEvent.value = selectedEvent;
    renderLogLines(result.lines);
    elements.logsPath.textContent = result.path;
    elements.logsPath.title = result.path;
  } catch (error) {
    elements.logsList.innerHTML = `<code class="log-line error">${escapeHtml(error instanceof Error ? error.message : "Could not load logs")}</code>`;
    elements.logsCount.textContent = "0 lines";
    showToast(error instanceof Error ? error.message : "Could not load logs", true);
  } finally {
    elements.refreshLogs.disabled = false;
    elements.refreshLogs.removeAttribute("aria-busy");
    refreshIcons();
  }
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minRest = minutes % 60;
  return minRest ? `${hours}h ${minRest}m` : `${hours}h`;
}

function filteredHistoryItems(): HistoryItem[] {
  const query = elements.historySearch.value.trim().toLowerCase();
  const filter = elements.historyFilter.value;
  return historyItems.filter((item) => {
    if (filter === "has-image" && !item.hasImage) return false;
    if (filter === "no-image" && item.hasImage) return false;
    if (filter === "completed" && item.status !== "completed") return false;
    if (filter === "failed" && item.status !== "failed") return false;
    if (filter === "partial" && item.status !== "partial") return false;
    if (filter === "cancelled" && item.status !== "cancelled") return false;
    if (filter === "batch" && item.runMode !== "batch") return false;
    if (filter === "direct" && item.runMode !== "direct") return false;
    if (!query) return true;
    return [item.promptText, item.model, item.themeColumn, item.week, item.scheduleDate, item.status, item.sessionId, item.parentRunId ?? ""]
      .some((value) => value.toLowerCase().includes(query));
  });
}

function closeLightbox(): void {
  elements.lightbox.classList.add("hidden");
  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute("src");
  elements.lightboxCount.textContent = "Image 0 of 0";
  elements.lightboxCaption.textContent = "";
  elements.lightboxCaption.classList.remove("expanded");
  elements.lightboxPromptToggle.textContent = "Show prompt";
  elements.lightboxDetails.innerHTML = "";
}

async function openLightbox(items: HistoryItem[], index: number): Promise<void> {
  const previewable = items.filter((item) => item.assetId && item.hasImage);
  if (!previewable.length) return;
  const current = items[index];
  const previewIndex = Math.max(0, previewable.findIndex((item) => item.promptId === current?.promptId));
  lightboxItems = previewable;
  lightboxIndex = previewIndex >= 0 ? previewIndex : 0;
  await showLightboxAt(lightboxIndex);
}

async function showLightboxAt(index: number): Promise<void> {
  if (!lightboxItems.length) return;
  lightboxIndex = Math.max(0, Math.min(index, lightboxItems.length - 1));
  const item = lightboxItems[lightboxIndex]!;
  elements.lightbox.classList.remove("hidden");
  elements.lightbox.hidden = false;
  elements.lightboxCount.textContent = `Image ${lightboxIndex + 1} of ${lightboxItems.length}`;
  elements.lightboxCaption.textContent = item.promptText;
  lightboxPromptExpanded = false;
  elements.lightboxCaption.classList.remove("expanded");
  elements.lightboxPromptToggle.textContent = "Show prompt";
  elements.lightboxPrev.disabled = lightboxIndex === 0;
  elements.lightboxNext.disabled = lightboxIndex === lightboxItems.length - 1;
  elements.lightboxImage.alt = item.promptText;
  const session = librarySessions.get(item.sessionId);
  const selected = librarySelectedPromptIds.has(item.promptId);
  elements.lightboxDetails.innerHTML = `<div class="lightbox-detail-head"><span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><button type="button" class="secondary-button lightbox-select" data-prompt-id="${escapeHtml(item.promptId)}"><i data-lucide="${selected ? "check" : "images"}"></i>${selected ? "Selected" : "Select image"}</button></div><section><h3>Image details</h3><dl><div><dt>Image</dt><dd>${lightboxIndex + 1} of ${lightboxItems.length}</dd></div><div><dt>Week</dt><dd>${escapeHtml(item.week || "Not set")}</dd></div><div><dt>Theme</dt><dd>${escapeHtml(item.themeColumn || "Manual")}</dd></div><div><dt>Format</dt><dd>${escapeHtml(session ? `${session.format} · ${session.quality}` : item.model)}</dd></div><div><dt>Cost</dt><dd>$${item.costUsd.toFixed(3)}</dd></div></dl></section><section><h3>Session</h3><dl><div><dt>Progress</dt><dd>${session ? `${session.completedCount} of ${session.totalPrompts} images` : "Saved image"}</dd></div><div><dt>Mode</dt><dd>${escapeHtml(item.runMode)}</dd></div><div><dt>Created</dt><dd>${escapeHtml(formatDate(item.createdAt))}</dd></div></dl></section>`;
  elements.lightboxDetails.querySelector<HTMLButtonElement>(".lightbox-select")?.addEventListener("click", () => {
    if (librarySelectedPromptIds.has(item.promptId)) librarySelectedPromptIds.delete(item.promptId);
    else librarySelectedPromptIds.add(item.promptId);
    updateLibrarySelection();
    void showLightboxAt(lightboxIndex);
  });
  try {
    const { dataUrl } = await app.rpc!.request.getHistoryImage({ assetId: item.assetId! });
    elements.lightboxImage.src = dataUrl;
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not open preview", true);
    closeLightbox();
  }
  refreshIcons();
}

function renderHistoryCard(item: HistoryItem): string {
  return `<article class="history-card" data-prompt-id="${item.promptId}">
      <label class="history-select"><input class="library-select-item" type="checkbox" data-prompt-id="${escapeHtml(item.promptId)}" ${librarySelectedPromptIds.has(item.promptId) ? "checked" : ""} /><span class="sr-only">Select this image</span></label>
      <button type="button" class="history-image preview-history" ${item.assetId ? `data-asset-id="${escapeHtml(item.assetId)}" data-prompt-id="${escapeHtml(item.promptId)}"` : "disabled"} aria-label="Preview image">
        <div class="image-placeholder"><i data-lucide="${item.hasImage ? "loader-circle" : "image-off"}" aria-hidden="true"></i><strong>${item.hasImage ? "Loading preview" : "No image saved"}</strong><small>${item.hasImage ? "Stored locally" : "Prompt retained from this session"}</small></div>
      </button>
      <div class="history-card-body">
        <div class="history-card-meta"><span>${formatDate(item.createdAt)}</span><span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
        <p class="history-prompt">${escapeHtml(item.promptText)}</p>
        <p class="history-card-summary" title="${escapeHtml(item.model)} · ${escapeHtml(item.themeColumn || item.week || "Manual")}">${escapeHtml(item.themeColumn || item.week || "Manual")} · $${item.costUsd.toFixed(3)}</p>
        <details class="action-menu history-card-menu"><summary aria-label="Image options" title="Image options"><i data-lucide="more-horizontal"></i></summary><div class="action-menu-popover"><p class="action-menu-label">Image options</p><button class="menu-action reveal-history" data-asset-id="${item.assetId ?? ""}" ${item.assetId ? "" : "disabled"}><i data-lucide="folder-open"></i>Show file in folder</button><button class="menu-action reveal-session" data-session-id="${item.sessionId}"><i data-lucide="folder-open"></i>Open session folder</button><button class="menu-action danger-button delete-history" data-prompt-id="${item.promptId}"><i data-lucide="trash-2"></i>Delete this image</button></div></details>
      </div>
    </article>`;
}

function renderHistory(animateCards = false): void {
  historyImageObserver?.disconnect();
  const visible = filteredHistoryItems();
  librarySelectedPromptIds = new Set([...librarySelectedPromptIds].filter((promptId) => historyItems.some((item) => item.promptId === promptId)));
  elements.clearHistory.disabled = historyItems.length === 0;
  updateLibrarySelection();
  elements.historyCount.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  const groups = new Map<string, { id: string; title: string; subtitle: string; items: HistoryItem[]; sessions: SessionSummary[]; run?: RunSummary }>();
  for (const item of visible) {
    const key = item.parentRunId ?? item.sessionId;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const wave = item.waveIndex != null ? ` · wave ${item.waveIndex + 1}` : "";
    groups.set(key, {
      title: item.parentRunId ? `Run ${item.parentRunId.slice(0, 8)}` : `Session ${item.sessionId.slice(0, 8)}`,
      subtitle: `${librarySessions.get(item.sessionId)?.status ?? item.status} · ${item.runMode}${wave}`,
      items: [item],
      id: key,
      sessions: [],
      run: item.parentRunId ? libraryRuns.get(item.parentRunId) : undefined,
    });
  }

  if (!elements.historySearch.value.trim()) {
    for (const session of librarySessions.values()) {
      const key = session.parentRunId ?? session.sessionId;
      const existing = groups.get(key);
      if (existing) {
        existing.sessions.push(session);
        continue;
      }
      const run = session.parentRunId ? libraryRuns.get(session.parentRunId) : undefined;
      groups.set(key, {
        id: key,
        title: session.parentRunId ? `Run ${session.parentRunId.slice(0, 8)}` : `Session ${session.sessionId.slice(0, 8)}`,
        subtitle: `${session.status} · ${session.runMode}`,
        items: [],
        sessions: [session],
        run,
      });
    }
  }

  if (!groups.size) {
    const query = elements.historySearch.value.trim();
    elements.historyList.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="${query ? "search" : "images"}"></i></span><strong>${query ? "No matching library items" : "Library is empty"}</strong><small>${query ? "Try a broader search." : "Sessions and generated images will appear here."}</small></div>`;
    refreshIcons();
    return;
  }

  elements.historyList.innerHTML = [...groups.values()].map((group) => {
    const first = group.items[0];
    const sessions = group.sessions.length ? group.sessions : group.items.map((item) => librarySessions.get(item.sessionId)).filter((session): session is SessionSummary => Boolean(session));
    const activeSession = sessions.find((session) => ["pending", "processing"].includes(session.status));
    const primarySession = activeSession ?? sessions[0] ?? (first ? librarySessions.get(first.sessionId) : undefined);
    if (!primarySession) return "";
    const run = group.run;
    const canResume = sessions.some((session) => session.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(session.status));
    const canContinue = Boolean(run?.waveStrategy === "guided" && run.sessions.some((session) => session.status === "pending"));
    const exportAction = run
      ? `<button type="button" class="secondary-button run-export" data-run-id="${escapeHtml(run.runId)}">Export ZIP</button>`
      : `<button type="button" class="secondary-button session-export" data-session-id="${escapeHtml(primarySession.sessionId)}">Export ZIP</button>`;
    const imagesHtml = group.items.length
      ? `<div class="history-grid-inner">${group.items.map(renderHistoryCard).join("")}</div>`
      : '<p class="empty-inline">No images saved for this session yet.</p>';
    return `<section class="history-group">
      <header class="history-group-head"><button type="button" class="library-group-toggle" data-group-id="${escapeHtml(group.id)}" aria-expanded="${collapsedLibraryGroups.has(group.id) ? "false" : "true"}"><i data-lucide="${collapsedLibraryGroups.has(group.id) ? "chevron-right" : "chevron-down"}" aria-hidden="true"></i><span><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.subtitle)} · ${group.items.length} image${group.items.length === 1 ? "" : "s"}</small></span></button><div class="history-group-actions"><details class="action-menu"><summary aria-label="Run options" title="Run options"><i data-lucide="more-horizontal"></i></summary><div class="action-menu-popover"><p class="action-menu-label">Run options</p>${group.items.length ? `<button type="button" class="menu-action preview-library-group" data-group-id="${escapeHtml(group.id)}"><i data-lucide="images"></i>Preview and details</button>` : ""}${exportAction.replace("secondary-button", "menu-action").replace(">Export ZIP<", "><i data-lucide=\"download\"></i>Download all images<")}${group.items.length ? `<button type="button" class="menu-action library-select-group" data-group-id="${escapeHtml(group.id)}"><i data-lucide="check"></i>Select all images</button>` : ""}${activeSession ? `<button type="button" class="menu-action session-live" data-session-id="${escapeHtml(activeSession.sessionId)}"><i data-lucide="images"></i>Open progress</button>${activeSession.runMode === "batch" ? `<button type="button" class="menu-action session-check" data-session-id="${escapeHtml(activeSession.sessionId)}"><i data-lucide="refresh-cw"></i>Check for updates</button>` : ""}<button type="button" class="menu-action danger-button session-cancel" data-session-id="${escapeHtml(activeSession.sessionId)}"><i data-lucide="x"></i>Cancel this run</button>` : ""}${canResume ? `<button type="button" class="menu-action ${run ? "run-resume" : "session-resume"}" data-${run ? "run-id" : "session-id"}="${escapeHtml(run?.runId ?? primarySession.sessionId)}"><i data-lucide="refresh-cw"></i>Resume unfinished images</button>` : ""}${canContinue ? `<button type="button" class="menu-action run-continue" data-run-id="${escapeHtml(run!.runId)}"><i data-lucide="images"></i>Continue next batch</button>` : ""}</div></details></div></header>
      <div class="library-group-content${collapsedLibraryGroups.has(group.id) ? " hidden" : ""}"${collapsedLibraryGroups.has(group.id) ? " hidden" : ""}><div class="session-detail-panel hidden" data-detail-for="${escapeHtml(primarySession.sessionId)}" hidden></div>${imagesHtml}</div>
    </section>`;
  }).join("");
  refreshIcons();
  if (animateCards) enterVisibleItems(elements.historyList, ".history-card");

  historyImageObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const imageContainer = entry.target as HTMLElement;
      const assetId = imageContainer.dataset["assetId"];
      observer.unobserve(imageContainer);
      if (!assetId) continue;
      void app.rpc!.request.getHistoryImage({ assetId }).then(({ dataUrl }) => {
        const item = historyItems.find((candidate) => candidate.promptId === imageContainer.dataset["promptId"]);
        const image = document.createElement("img");
        image.alt = `Generated output for: ${item?.promptText ?? "saved prompt"}`;
        image.addEventListener("load", () => {
          image.classList.add("loaded");
          if (motionAllowed()) void animate(image, { opacity: [0, 1], transform: ["scale(1.012)", "scale(1)"] }, { duration: 0.22, ease: [0.16, 1, 0.3, 1] });
        }, { once: true });
        image.src = dataUrl;
        imageContainer.prepend(image);
      }).catch((error: unknown) => {
        const placeholder = imageContainer.querySelector<HTMLElement>(".image-placeholder");
        if (placeholder) {
          placeholder.classList.add("history-load-error");
          placeholder.innerHTML = `<i data-lucide="circle-alert" aria-hidden="true"></i><strong>Preview unavailable</strong><small>${escapeHtml(error instanceof Error ? error.message : "Stored file is missing")}</small>`;
          refreshIcons();
        }
      });
    }
  }, { rootMargin: "160px" });
  elements.historyList.querySelectorAll<HTMLElement>(".history-image[data-asset-id]").forEach((imageContainer) => historyImageObserver?.observe(imageContainer));

  elements.historyList.querySelectorAll<HTMLButtonElement>(".preview-history").forEach((button) => {
    button.addEventListener("click", () => {
      const promptId = button.dataset["promptId"] ?? button.closest<HTMLElement>(".history-card")?.dataset["promptId"];
      if (!promptId) return;
      const items = filteredHistoryItems();
      const index = items.findIndex((item) => item.promptId === promptId);
      if (index >= 0) void openLightbox(items, index);
    });
  });
  elements.historyList.querySelectorAll<HTMLInputElement>(".library-select-item").forEach((input) => {
    input.addEventListener("change", () => {
      const promptId = input.dataset["promptId"];
      if (!promptId) return;
      if (input.checked) librarySelectedPromptIds.add(promptId);
      else librarySelectedPromptIds.delete(promptId);
      updateLibrarySelection();
    });
  });
  elements.historyList.querySelectorAll<HTMLButtonElement>(".library-select-group").forEach((button) => {
    button.addEventListener("click", () => {
      const groupId = button.dataset["groupId"];
      if (!groupId) return;
      const items = visible.filter((item) => (item.parentRunId ?? item.sessionId) === groupId);
      const selectAll = items.some((item) => !librarySelectedPromptIds.has(item.promptId));
      for (const item of items) {
        if (selectAll) librarySelectedPromptIds.add(item.promptId);
        else librarySelectedPromptIds.delete(item.promptId);
      }
      renderHistory();
    });
  });
  elements.historyList.querySelectorAll<HTMLButtonElement>(".preview-library-group").forEach((button) => {
    button.addEventListener("click", () => {
      const groupId = button.dataset["groupId"];
      const items = visible.filter((item) => (item.parentRunId ?? item.sessionId) === groupId);
      if (items.length) void openLightbox(items, 0);
    });
  });
  elements.historyList.querySelectorAll<HTMLButtonElement>(".library-group-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const groupId = button.dataset["groupId"];
      if (!groupId) return;
      if (collapsedLibraryGroups.has(groupId)) collapsedLibraryGroups.delete(groupId);
      else collapsedLibraryGroups.add(groupId);
      localStorage.setItem(LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify([...collapsedLibraryGroups]));
      renderHistory();
    });
  });
  bindSessionListHandlers(elements.historyList);
  elements.historyList.querySelectorAll<HTMLButtonElement>(".reveal-history").forEach((button) => {
    button.addEventListener("click", async () => {
      const assetId = button.dataset["assetId"];
      if (!assetId) return;
      button.disabled = true;
      try {
        await app.rpc!.request.revealHistoryAsset({ assetId });
        showToast("Opened file in Explorer.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not show file", true);
      } finally {
        button.disabled = false;
      }
    });
  });
  elements.historyList.querySelectorAll<HTMLButtonElement>(".reveal-session").forEach((button) => {
    button.addEventListener("click", async () => {
      const sessionId = button.dataset["sessionId"];
      if (!sessionId) return;
      button.disabled = true;
      try {
        await app.rpc!.request.revealHistorySessionFolder({ sessionId });
        showToast("Opened session folder.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not open session folder", true);
      } finally {
        button.disabled = false;
      }
    });
  });
  elements.historyList.querySelectorAll<HTMLButtonElement>(".delete-history").forEach((button) => {
    button.addEventListener("click", async () => {
      const promptId = button.dataset["promptId"];
      if (!promptId || !window.confirm("Delete this prompt and its locally stored image from History?")) return;
      button.disabled = true;
      try {
        await app.rpc!.request.deleteHistoryItem({ promptId });
        await loadHistory();
        showToast("History item deleted.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not delete history item", true);
        button.disabled = false;
      }
    });
  });
}

async function loadHistory(): Promise<void> {
  elements.refreshHistory.disabled = true;
  elements.refreshHistory.setAttribute("aria-busy", "true");
  elements.historyList.setAttribute("aria-busy", "true");
  elements.historyList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="loader-circle"></i></span><strong>Loading history…</strong><small>Reading locally stored prompts and images.</small></div>';
  refreshIcons();
  try {
    const [items, sessions, runs] = await Promise.all([
      app.rpc!.request.listHistory({}),
      app.rpc!.request.listSessions({}),
      app.rpc!.request.listRuns({}).catch(() => [] as RunSummary[]),
    ]);
    historyItems = items;
    librarySessions = new Map(sessions.map((item) => [item.sessionId, item]));
    libraryRuns = new Map(runs.map((item) => [item.runId, item]));
    renderHistory(true);
  } catch (error) {
    elements.historyList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load history")}</div>`;
  } finally {
    elements.historyList.removeAttribute("aria-busy");
    elements.refreshHistory.disabled = false;
    elements.refreshHistory.removeAttribute("aria-busy");
    refreshIcons();
  }
}

async function importCsvFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    showToast("Choose a CSV file.", true);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("That CSV is larger than 10 MB. Split it into smaller batches and try again.", true);
    return;
  }
  if (file.size === 0) {
    showToast("That CSV is empty.", true);
    return;
  }
  elements.csvPanel.setAttribute("aria-busy", "true");
  elements.pickCsvNative.disabled = true;
  try {
    applyMatrix(await app.rpc!.request.importCSV({ csvText: await file.text(), sourceName: file.name }));
    showToast(`Loaded ${file.name}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not import CSV", true);
  } finally {
    elements.csvPanel.removeAttribute("aria-busy");
    elements.pickCsvNative.disabled = false;
  }
}

async function bootstrap(): Promise<void> {
  const data: AppBootstrap = await app.rpc!.request.getBootstrap({});
  bootstrapData = data;
  pricingView = data.pricing;
  document.title = `${data.brand.appName} ${data.brand.version}`;
  elements.brandName.textContent = data.brand.appName;
  elements.brandVersion.textContent = data.brand.version;
  elements.platform.textContent = data.platform;
  elements.keyCount.textContent = String(data.keyCount);
  activeKeyCount = data.keyCount;
  syncKeyCountBadge(data.keyCount);
  elements.fxRate.textContent = `PKR ${data.fxRate.toFixed(2)}`;
  elements.model.innerHTML = data.models.models.map((model) =>
    `<option value="${escapeHtml(model.id)}" ${model.enabled ? "" : "disabled"}>${escapeHtml(model.label)}</option>`,
  ).join("");
  elements.model.value = data.models.defaultModel;
  if (data.limits) {
    appLimits = {
      maxReferences: data.limits.maxReferences,
      maxReferenceBytes: data.limits.maxReferenceBytes,
      maxPromptChars: data.limits.maxPromptChars,
      directPromptLimit: data.limits.directPromptLimit,
      batchPromptLimit: data.limits.batchPromptLimit,
      defaultWaveSize: data.settings?.waveSize ?? APP_LIMITS.defaultWaveSize,
    };
  }
  if (data.settings) {
    elements.waveStrategy.value = data.settings.waveSize > 0 ? "guided" : "all";
  }
  if (data.admin) applyAdminView(data.admin);
  else if (data.adminWarning) {
    elements.rateLimitsLine.textContent = "Org limits optional — Admin key in API keys.";
    elements.rateLimitsLine.dataset["level"] = "soft";
  }
  renderPricing();
  renderUsageLimits();
  renderReferenceImages();
  updateWaveUi();
  syncEstimateChrome(selected.size);
  syncActionState();
  logUi("ui_bootstrap_ok", { version: data.brand.version, platform: data.platform, keyCount: data.keyCount });
}

applyTheme(getInitialTheme());
restoreSidebar();
refreshIcons();
syncEstimateChrome(0);
syncActionState();

elements.sidebarToggle.addEventListener("click", () => {
  const collapsed = elements.appShell.dataset["sidebar"] !== "collapsed";
  applySidebarCollapsed(collapsed, true);
  // Keep focus on toggle for keyboard users
  elements.sidebarToggle.focus();
});

elements.toastClose.addEventListener("click", () => dismissToast());

elements.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
  applyTheme(current === "dark" ? "light" : "dark", true);
});

document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => void setView(button.dataset["view"] as "generator" | "converter" | "sessions" | "usage" | "history" | "exports" | "logs"));
});
elements.converterTabWorkspace.addEventListener("click", () => { converterTab = "workspace"; renderConverterTab(); });
elements.converterTabHistory.addEventListener("click", () => { converterTab = "history"; renderConverterTab(); });
elements.converterFormats.querySelectorAll<HTMLButtonElement>("[data-converter-format]").forEach((button) => button.addEventListener("click", () => {
  elements.converterFormats.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  renderConverterQueue();
}));
function toggleConverterSection(button: HTMLButtonElement, section: HTMLElement): void {
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded)); section.classList.toggle("hidden", !expanded); section.hidden = !expanded;
}
elements.converterRulesToggle.addEventListener("click", () => toggleConverterSection(elements.converterRulesToggle, elements.converterRules));
elements.converterOptionsToggle.addEventListener("click", () => toggleConverterSection(elements.converterOptionsToggle, elements.converterOptions));
elements.converterBrowse.addEventListener("click", () => elements.converterFile.click());
elements.converterDropzone.addEventListener("click", () => elements.converterFile.click());
elements.converterDropzone.addEventListener("pointerenter", () => armClipboardHistoryTarget("converter"));
elements.converterDropzone.addEventListener("focusin", () => armClipboardHistoryTarget("converter"));
elements.converterDropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.converterFile.click(); } });
elements.converterFile.addEventListener("change", () => { void queueConverterFiles(Array.from(elements.converterFile.files ?? [])); elements.converterFile.value = ""; });
["dragenter", "dragover"].forEach((name) => elements.converterDropzone.addEventListener(name, (event) => { event.preventDefault(); elements.converterDropzone.classList.add("dragging"); }));
["dragleave", "drop"].forEach((name) => elements.converterDropzone.addEventListener(name, (event) => { event.preventDefault(); elements.converterDropzone.classList.remove("dragging"); }));
elements.converterDropzone.addEventListener("drop", (event) => void queueConverterFiles(Array.from(event.dataTransfer?.files ?? [])));
elements.converterPaste.addEventListener("click", () => void pasteConverterImages("paste_button"));
elements.converterFromSession.addEventListener("click", () => void loadConverterSessionSources());
elements.converterSessionCards.addEventListener("click", () => { converterSessionLayout = "cards"; renderConverterSessionSources(); });
elements.converterSessionListMode.addEventListener("click", () => { converterSessionLayout = "list"; renderConverterSessionSources(); });
elements.converterSessionAddInline.addEventListener("click", () => addSelectedConverterSessionImages());
elements.converterAddRule.addEventListener("click", () => {
  const type = elements.converterRuleType.value; const value = elements.converterRuleValue.value.trim(); const format = elements.converterRuleFormat.value as ConverterFormat;
  let rule: ConverterRule | null = null;
  if (type === "nth") { const every = Number(value); if (Number.isInteger(every) && every > 0) rule = { id: crypto.randomUUID(), type: "nth", every, format }; }
  if (type === "odd" || type === "even") rule = { id: crypto.randomUUID(), type, format };
  if (type === "range") { const match = value.match(/^(\d+)\s*-\s*(\d+)$/); if (match && Number(match[1]) > 0 && Number(match[2]) >= Number(match[1])) rule = { id: crypto.randomUUID(), type: "range", start: Number(match[1]), end: Number(match[2]), format }; }
  if (type === "cycle") { const formats = value.split(/[,\s]+/).map((candidate) => candidate.toLowerCase()).filter((candidate): candidate is ConverterFormat => ["png", "jpg", "webp", "avif", "tiff", "bmp"].includes(candidate)); if (formats.length) rule = { id: crypto.randomUUID(), type: "cycle", formats }; }
  if (!rule) { showToast(type === "range" ? "Enter a range like 4-8." : type === "cycle" ? "Enter formats like PNG,JPG,WebP." : "Enter a number greater than zero.", true); return; }
  converterRules.push(rule); elements.converterRuleValue.value = ""; renderConverterRules(); renderConverterQueue();
});
elements.converterRun.addEventListener("click", async () => {
  if (!converterQueue.length) return;
  elements.converterRun.disabled = true; elements.converterRun.setAttribute("aria-busy", "true");
  try {
    const inputs: ConverterInput[] = converterQueue.map((item) => item.sourceKind === "session"
      ? { clientId: item.clientId, sourceKind: "session", assetId: item.assetId!, name: item.name }
      : { clientId: item.clientId, sourceKind: item.sourceKind, name: item.name, dataBase64: item.dataBase64! });
    const job = await app.rpc!.request.convertImages({ inputs, options: converterOptions() });
    converterJobs = [job, ...converterJobs.filter((candidate) => candidate.id !== job.id)];
    elements.converterResult.hidden = false; elements.converterResult.classList.remove("hidden");
    elements.converterResult.innerHTML = `<div class="converter-result-head"><div><h2>Conversion complete</h2><p>${job.completedCount} of ${job.totalCount} images are ready. Copy or save whenever you want.</p></div><div class="button-row"><button id="converter-result-copy-files" class="secondary-button" type="button"><i data-lucide="copy"></i>Copy files</button><button id="converter-result-save-all" class="secondary-button" type="button"><i data-lucide="download"></i>Save all</button><button id="converter-result-history" class="secondary-button" type="button">View history</button></div></div><div class="converter-result-grid">${job.items.map((item) => `<div class="converter-output-card" data-job-id="${job.id}" data-item-id="${item.id}"><div class="converter-output-preview"><span class="image-placeholder"><i data-lucide="image"></i></span></div><strong>${escapeHtml(item.outputName ?? item.sourceName)}</strong><small>${item.format.toUpperCase()} · ${item.status}</small><div><button class="icon-button converter-copy-output" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Copy image"><i data-lucide="copy"></i></button><button class="icon-button converter-save-output" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Save image"><i data-lucide="download"></i></button><button class="icon-button converter-properties" type="button" data-job-id="${job.id}" data-item-id="${item.id}" aria-label="Image properties"><i data-lucide="info"></i></button></div></div>`).join("")}</div>`;
    wireConverterActions(elements.converterResult); elements.converterResult.querySelectorAll<HTMLElement>(".converter-output-card").forEach((card) => void loadConverterPreview(card));
    byId<HTMLButtonElement>("converter-result-copy-files").addEventListener("click", async () => { try { await app.rpc!.request.copyConverterFiles({ jobId: job.id, itemIds: job.items.filter((item) => item.status === "completed").map((item) => item.id) }); showToast("Converted files copied to clipboard."); } catch (error) { showToast(error instanceof Error ? error.message : "Could not copy files.", true); } });
    byId<HTMLButtonElement>("converter-result-save-all").addEventListener("click", async () => { const result = await app.rpc!.request.saveConverterOutputs({ jobId: job.id, itemIds: job.items.filter((item) => item.status === "completed").map((item) => item.id) }); if (result.saved) showToast(`${result.saved} images saved.`); });
    byId<HTMLButtonElement>("converter-result-history").addEventListener("click", () => { converterTab = "history"; renderConverterTab(); });
    refreshIcons(); showToast(`${job.completedCount} image${job.completedCount === 1 ? "" : "s"} converted.`);
  } catch (error) { showToast(error instanceof Error ? error.message : "Could not convert images.", true); }
  finally { elements.converterRun.disabled = converterQueue.length === 0; elements.converterRun.removeAttribute("aria-busy"); }
});
elements.csvTab.addEventListener("click", () => setTab("csv"));
elements.manualTab.addEventListener("click", () => setTab("manual"));
[elements.csvTab, elements.manualTab].forEach((tab) => {
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const useManual = event.key === "ArrowRight" || event.key === "End";
    const target = useManual ? elements.manualTab : elements.csvTab;
    setTab(useManual ? "manual" : "csv");
    target.focus();
  });
});
elements.csvFile.addEventListener("change", () => {
  const file = elements.csvFile.files?.[0];
  if (file) void importCsvFile(file);
  elements.csvFile.value = "";
});
elements.pickCsvNative.addEventListener("click", () => elements.csvFile.click());
if (dropzone) {
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  }));
  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files[0];
    if (file) void importCsvFile(file);
  });
  dropzone.addEventListener("mouseenter", () => {
    // Keep dropzone as a real Ctrl+V target without stealing focus from text fields.
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    dropzone.focus({ preventScroll: true });
  });
}
elements.parseManual.addEventListener("click", async () => {
  if (!elements.manualPrompts.value.trim()) {
    showToast("Add at least one prompt before building cards.", true);
    elements.manualPrompts.focus();
    return;
  }
  elements.parseManual.disabled = true;
  elements.parseManual.setAttribute("aria-busy", "true");
  try {
    applyMatrix(await app.rpc!.request.parseManualPrompts({ text: elements.manualPrompts.value }));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not parse prompts", true);
  } finally {
    elements.parseManual.disabled = false;
    elements.parseManual.removeAttribute("aria-busy");
  }
});
elements.manualPrompts.addEventListener("input", () => syncActionState());
elements.manualPrompts.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") elements.parseManual.click();
});
document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset["pick"];
    const cells = selectableCells();
    selected = action === "all" ? new Set(cells.map((cell) => cell.id)) : new Set();
    syncVisibleSelections();
    updateSelection();
  });
});
elements.deleteSelectedPrompts.addEventListener("click", removeSelectedPrompts);
elements.clearImportedPrompts.addEventListener("click", () => clearPromptMatrix());
elements.matrixPrev.addEventListener("click", () => { matrixPage = Math.max(0, matrixPage - 1); renderMatrix(true, true); });
elements.matrixNext.addEventListener("click", () => { matrixPage += 1; renderMatrix(true, true); });
elements.matrixScrollUp.addEventListener("click", () => scrollPromptSelections(-1));
elements.matrixScrollDown.addEventListener("click", () => scrollPromptSelections(1));
elements.matrix.addEventListener("scroll", updateMatrixScrollControls, { passive: true });
elements.matrixViewList.addEventListener("click", () => setMatrixView("list"));
elements.matrixViewCards.addEventListener("click", () => setMatrixView("cards"));
document.querySelectorAll<HTMLInputElement>('input[name="run-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".mode-option").forEach((label) => label.classList.remove("selected"));
    radio.closest(".mode-option")?.classList.add("selected");
    updateSelection();
    updateWaveUi();
    void refreshEstimate();
  });
});
elements.waveStrategy.addEventListener("change", () => {
  updateWaveUi();
});
elements.addWave.addEventListener("click", () => {
  const donor = [...waveSizes].map((size, index) => ({ size, index })).reverse().find(({ size }) => size > 1);
  if (!donor) { showToast("A one-prompt plan cannot be split further.", true); return; }
  waveSizes[donor.index] = donor.size - 1;
  waveSizes.push(1);
  updateWaveUi();
});
elements.model.addEventListener("change", () => void refreshEstimate());
elements.quality.addEventListener("change", () => void refreshEstimate());
elements.size.addEventListener("change", () => void refreshEstimate());

elements.referenceDock.addEventListener("click", () => elements.referenceFile.click());
elements.referenceControl.addEventListener("pointerenter", () => armClipboardHistoryTarget("reference"));
elements.referenceControl.addEventListener("focusin", () => armClipboardHistoryTarget("reference"));
elements.referenceFile.addEventListener("change", () => {
  const files = [...(elements.referenceFile.files ?? [])];
  if (files.length) void attachReferenceFiles(files);
});
["dragenter", "dragover"].forEach((eventName) => elements.referenceControl.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.referenceControl.classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => elements.referenceControl.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.referenceControl.classList.remove("dragging");
}));
elements.referenceControl.addEventListener("drop", (event) => {
  const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name));
  if (files.length) void attachReferenceFiles(files);
});
async function importCsvText(csvText: string, sourceName: string): Promise<void> {
  const check = looksLikeCsvText(csvText);
  if (!check.ok) {
    showToast(check.reason, true);
    logUi("ui_paste_csv_invalid", { reason: check.reason });
    return;
  }
  elements.csvPanel.setAttribute("aria-busy", "true");
  elements.pasteCsv.disabled = true;
  try {
    applyMatrix(await app.rpc!.request.importCSV({ csvText, sourceName }));
    showToast(sourceName === "clipboard.csv" ? "Loaded CSV from paste." : `Loaded ${sourceName}`);
    logUi("ui_paste_csv_text", { chars: csvText.length, ok: true, source: sourceName });
  } catch (error) {
    showToast(error instanceof Error ? error.message : "That paste is not a valid CSV for BulkImg.", true);
    logUi("ui_paste_csv_text", { ok: false, message: error instanceof Error ? error.message : "error" });
  } finally {
    elements.csvPanel.removeAttribute("aria-busy");
    elements.pasteCsv.disabled = false;
  }
}

/** Focus or pointer is on the CSV dropzone / panel (hover + Ctrl+V / Paste button). */
function isCsvPasteTarget(): boolean {
  if (elements.csvPanel.classList.contains("hidden")) return false;
  const active = document.activeElement;
  if (active instanceof Node && elements.csvPanel.contains(active)) return true;
  if (dropzone?.matches(":hover") || elements.csvPanel.matches(":hover")) return true;
  return false;
}

function updateLibrarySelection(): void {
  const count = librarySelectedPromptIds.size;
  elements.libraryDownloadSelected.disabled = count === 0;
  elements.libraryDeleteSelected.disabled = count === 0;
  elements.librarySelection.textContent = count ? `${count} image${count === 1 ? "" : "s"} selected` : "No images selected";
}

function isReferencePasteTarget(): boolean {
  const active = document.activeElement;
  return (active instanceof Node && elements.referenceControl.contains(active))
    || elements.referenceControl.matches(":hover")
    || activeClipboardHistoryTarget() === "reference";
}

function isConverterPasteTarget(): boolean {
  return (document.querySelector("[data-view='converter']")?.classList.contains("active") ?? false)
    || activeClipboardHistoryTarget() === "converter";
}

function armClipboardHistoryTarget(target: "reference" | "converter"): void {
  clipboardHistoryTarget = target;
  clipboardHistoryTargetExpiresAt = Date.now() + 30_000;
}

function activeClipboardHistoryTarget(): "reference" | "converter" | null {
  if (Date.now() <= clipboardHistoryTargetExpiresAt) return clipboardHistoryTarget;
  clipboardHistoryTarget = null;
  return null;
}

function imageFilesFromTransfer(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  const files = [...transfer.files];
  if (!files.length) {
    for (const item of [...transfer.items]) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files
    .filter((file) => file.size > 0 && (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name)))
    .map((file, index) => file.name ? file : new File([file], `clipboard-${Date.now()}-${index + 1}.png`, { type: file.type || "image/png" }));
}

async function imageFilesFromBrowserClipboard(maxCount: number): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const mimeType = item.types.find((type) => type.startsWith("image/"));
    if (!mimeType) continue;
    const blob = await item.getType(mimeType);
    if (blob.size > 0) files.push(new File([blob], `clipboard-${Date.now()}-${files.length + 1}.${mimeType.split("/")[1] || "png"}`, { type: mimeType }));
    if (files.length >= maxCount) break;
  }
  return files;
}

async function pasteConverterImages(via: string, transfer?: DataTransfer | null): Promise<void> {
  const startedAt = performance.now();
  const remaining = Math.max(1, 100 - converterQueue.length);
  elements.converterPaste.disabled = true;
  logUi("ui_converter_paste_start", { via, remaining });
  try {
    const eventFiles = imageFilesFromTransfer(transfer ?? null);
    if (eventFiles.length) {
      await queueConverterFiles(eventFiles, "clipboard");
      logUi("ui_converter_paste_event", { via, found: eventFiles.length, durationMs: Math.round(performance.now() - startedAt) });
      return;
    }
    try {
      const files = await imageFilesFromBrowserClipboard(remaining);
      if (files.length) {
        await queueConverterFiles(files, "clipboard");
        logUi("ui_converter_paste_browser", { via, found: files.length, durationMs: Math.round(performance.now() - startedAt) });
        return;
      }
    } catch (error) {
      logUi("ui_converter_paste_browser", { ok: false, via, message: error instanceof Error ? error.message : "unavailable" });
    }
    const result = await app.rpc!.request.readClipboardImages({ maxCount: remaining });
    if (result.error || !result.images.length) throw new Error(result.error || "Clipboard has no image.");
    for (const image of result.images) converterQueue.push({ clientId: crypto.randomUUID(), sourceKind: "clipboard", name: image.filename || "clipboard.png", dataBase64: image.dataBase64, previewUrl: `data:${image.mimeType};base64,${image.dataBase64}` });
    renderConverterQueue();
    logUi("ui_converter_paste_native", { ok: true, via, found: result.images.length, durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not paste image.";
    showToast(message, true);
    logUi("ui_converter_paste_native", { ok: false, via, message, durationMs: Math.round(performance.now() - startedAt) });
  } finally {
    elements.converterPaste.disabled = false;
  }
}

/**
 * CSV-only paste. Never reads browser clipboard (no permission prompts, no fake image.png).
 * 1) text plain/csv from the Ctrl+V paste event when present
 * 2) otherwise native Windows clipboard via Bun (Get-Clipboard)
 */
async function pasteCsvOnly(via: string, transfer?: DataTransfer | null): Promise<void> {
  logUi("ui_paste_csv_start", { via });
  // Text from the paste event only — never transfer.files / items (WebView invents empty image.png).
  if (transfer) {
    const text = (transfer.getData("text/plain") || transfer.getData("text/csv") || "").trim();
    if (text) {
      logUi("ui_paste_csv_event_text", { via, chars: text.length });
      await importCsvText(text, "clipboard.csv");
      return;
    }
  }
  if (!app.rpc) {
    showToast("App is not ready yet. Try Paste CSV again.", true);
    logUi("ui_paste_csv_native", { ok: false, error: "rpc_missing", via });
    return;
  }
  elements.pasteCsv.disabled = true;
  try {
    const result = await app.rpc.request.readClipboardCsv({});
    if (result.error || !result.text) {
      showToast(result.error || "Clipboard has no CSV text. Copy cells or a CSV, then paste again.", true);
      logUi("ui_paste_csv_native", { ok: false, error: result.error, via });
      return;
    }
    logUi("ui_paste_csv_native", { ok: true, via, chars: result.text.length, source: result.sourceName });
    await importCsvText(result.text, result.sourceName || "clipboard.csv");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not paste CSV.";
    showToast(message, true);
    logUi("ui_paste_csv_native", { ok: false, message, via });
  } finally {
    elements.pasteCsv.disabled = false;
  }
}

window.addEventListener("paste", (event) => {
  void (async () => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (isConverterPasteTarget()) {
      event.preventDefault();
      await pasteConverterImages("converter_ctrl_v", event.clipboardData);
      return;
    }
    if (isReferencePasteTarget()) {
      event.preventDefault();
      const files = imageFilesFromTransfer(event.clipboardData);
      logUi("ui_reference_paste_event", { found: files.length, via: "reference_hover_ctrl_v" });
      if (files.length) await attachReferenceFiles(files);
      else await pasteReferencesFromClipboard("reference_hover_ctrl_v");
      return;
    }
    if (!isCsvPasteTarget()) return;

    event.preventDefault();
    await pasteCsvOnly("csv_hover_ctrl_v", event.clipboardData);
  })();
});

elements.pasteCsv.addEventListener("click", () => void pasteCsvOnly("paste_button"));

elements.runButton.addEventListener("click", async () => {
  if (!matrix) return;
  if (activeKeyCount === 0) {
    await loadKeys();
    openKeysDialog(elements.apiKey);
    showToast("Add API key to generate.", true);
    return;
  }
  if (currentMode() === "direct" && selected.size > directPromptLimit()) {
    showToast(`Direct mode only allows ${directPromptLimit()} prompts. Use Batch for more.`, true);
    return;
  }
  if (currentMode() === "batch" && selected.size > 100 && !window.confirm(`Submit ${selected.size} prompts as a paid Batch run?`)) return;
  runSubmitInFlight = true;
  elements.runButton.disabled = true;
  elements.runButton.setAttribute("aria-busy", "true");
  syncActionState();
  try {
    const prompts = matrix.cells.filter((cell) => selected.has(cell.id)).map(({ promptText, week, scheduleDate, themeColumn }) => ({ promptText, week, scheduleDate, themeColumn }));
    const next = await app.rpc!.request.submitBatchRun({
      prompts,
      model: elements.model.value,
      mode: currentMode(),
      format: elements.size.value as OutputFormatId,
      quality: elements.quality.value as "low" | "medium" | "high",
      waveSize: currentMode() === "batch" && elements.waveStrategy.value !== "all" ? 100 : 0,
      waveStrategy: elements.waveStrategy.value as "all" | "guided" | "parallel",
      ...(currentMode() === "batch" && elements.waveStrategy.value !== "all" ? { waveSizes: [...waveSizes] } : {}),
      ...(referenceImages.length ? { referenceImageFileIds: referenceImages.map((reference) => reference.fileId) } : {}),
    });
    releaseReferencesToSession();
    renderTelemetry(next);
    await loadKeys();
    if (next.status === "failed") showToast(next.message, true);
    if (next.status === "pending" || next.status === "processing") await startSessionPolling(next.sessionId);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not start generation", true);
  } finally {
    runSubmitInFlight = false;
    elements.runButton.removeAttribute("aria-busy");
    updateSelection();
  }
});

elements.cancelButton.addEventListener("click", async () => {
  if (!session) return;
  elements.cancelButton.disabled = true;
  try {
    renderTelemetry(await app.rpc!.request.cancelBatchRun({ sessionId: session.sessionId }));
    showToast("Run cancelled. Saved images stay.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not cancel run", true);
  } finally {
    syncActionState();
  }
});

async function resumeLeftovers(): Promise<void> {
  if (!session) return;
  if (!window.confirm(resumeConfirmMessage())) return;
  elements.resumeButton.disabled = true;
  elements.retryButton.disabled = true;
  try {
    const next = await app.rpc!.request.resumeRun({
      ...(session.parentRunId ? { runId: session.parentRunId } : { sessionId: session.sessionId }),
    });
    renderTelemetry(next);
    showToast("Resume batch submitted for remaining prompts.");
    if (next.status === "pending" || next.status === "processing") await startSessionPolling(next.sessionId);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not resume prompts", true);
  } finally {
    syncActionState();
  }
}

elements.resumeButton.addEventListener("click", () => void resumeLeftovers());
elements.retryButton.addEventListener("click", () => void resumeLeftovers());

elements.manageKeys.addEventListener("click", async () => {
  try {
    await loadKeys();
    try {
      const data = await app.rpc!.request.getBootstrap({});
      if (data.admin) applyAdminView(data.admin);
    } catch {
      // Keys dialog still works if bootstrap refresh fails.
    }
    setKeyTypeTab("generation");
    openKeysDialog(byId<HTMLElement>("keys-title"));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load API keys", true);
  }
});
elements.refreshKeys.addEventListener("click", () => {
  if (elements.keyPanelAdmin.hidden) void loadKeys();
  else void refreshAdminPanel();
});
elements.keyTypeGeneration.addEventListener("click", () => setKeyTypeTab("generation"));
elements.keyTypeAdmin.addEventListener("click", () => setKeyTypeTab("admin"));
elements.keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.keyError.classList.add("hidden");
  const submit = elements.keyForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await app.rpc!.request.addApiKey({ label: elements.keyLabel.value, key: elements.apiKey.value });
    elements.apiKey.value = "";
    elements.keyLabel.value = "";
    await loadKeys();
    showToast("Generation key encrypted and saved.");
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save generation key";
    elements.keyError.classList.remove("hidden");
  } finally {
    if (submit) submit.disabled = false;
  }
});

async function fillAdminProjects(): Promise<void> {
  elements.loadAdminProjects.disabled = true;
  try {
    const projects = await app.rpc!.request.listAdminProjects({});
    elements.adminProjectList.innerHTML = projects.map((project) =>
      `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name || project.id)}</option>`,
    ).join("");
    if (projects.length === 1 && !elements.adminProject.value) {
      elements.adminProject.value = projects[0]!.id;
      elements.adminProjectNew.value = projects[0]!.id;
    }
    showToast(projects.length ? `Loaded ${projects.length} project${projects.length === 1 ? "" : "s"}.` : "No projects returned for this Admin key.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load projects", true);
  } finally {
    elements.loadAdminProjects.disabled = !adminConfiguredState;
  }
}

async function refreshAdminPanel(): Promise<void> {
  try {
    if (elements.adminProject.value.trim()) {
      await app.rpc!.request.setAdminProjectId({ projectId: elements.adminProject.value.trim() });
    }
    adminEditingKey = false;
    applyAdminView(await app.rpc!.request.refreshRateLimits({}));
    showToast("Rate limits refreshed.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not refresh rate limits", true);
  }
}

elements.adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.keyError.classList.add("hidden");
  const submit = elements.adminForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const projectId = elements.adminProjectNew.value.trim() || elements.adminProject.value.trim();
    const admin = await app.rpc!.request.setAdminKey({
      key: elements.adminKey.value,
      ...(projectId ? { projectId } : {}),
    });
    elements.adminKey.value = "";
    adminEditingKey = false;
    applyAdminView(admin);
    showToast(admin.configured ? "Admin key saved." : "Admin key updated.");
    if (admin.configured) {
      try { await fillAdminProjects(); } catch { /* optional */ }
    }
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save Admin key";
    elements.keyError.classList.remove("hidden");
  } finally {
    if (submit) submit.disabled = false;
  }
});

elements.adminManageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.keyError.classList.add("hidden");
  try {
    const projectId = elements.adminProject.value.trim();
    if (!projectId) {
      showToast("Enter a project ID first.", true);
      elements.adminProject.focus();
      return;
    }
    applyAdminView(await app.rpc!.request.setAdminProjectId({ projectId }));
    showToast("Project saved.");
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save project";
    elements.keyError.classList.remove("hidden");
  }
});

elements.editAdminKey.addEventListener("click", () => {
  adminEditingKey = true;
  applyAdminView({
    configured: adminConfiguredState,
    projectId: elements.adminProject.value || null,
    keyHint: elements.adminSavedHint.textContent || null,
    rateLimits: null,
    lastError: elements.adminLimitsPreview.textContent || null,
  });
  // keep last applied limits text - re-fetch full view
  void (async () => {
    try {
      const data = await app.rpc!.request.getBootstrap({});
      if (data.admin) {
        adminEditingKey = true;
        applyAdminView(data.admin);
      }
    } catch { /* local toggle still works */ }
    elements.adminKey.focus();
  })();
});

elements.cancelAdminEdit.addEventListener("click", () => {
  adminEditingKey = false;
  elements.adminKey.value = "";
  elements.keyError.classList.add("hidden");
  void (async () => {
    try {
      const data = await app.rpc!.request.getBootstrap({});
      if (data.admin) applyAdminView(data.admin);
    } catch {
      adminEditingKey = false;
    }
  })();
});

elements.loadAdminProjects.addEventListener("click", () => void fillAdminProjects());
elements.refreshLimits.addEventListener("click", () => void refreshAdminPanel());
elements.clearAdmin.addEventListener("click", async () => {
  if (!window.confirm("Clear the Admin API key and cached rate limits from this device?")) return;
  try {
    adminEditingKey = false;
    applyAdminView(await app.rpc!.request.clearAdminKey({}));
    elements.adminProject.value = "";
    elements.adminProjectNew.value = "";
    elements.adminProjectList.innerHTML = "";
    elements.adminKey.value = "";
    showToast("Admin key cleared.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not clear Admin key", true);
  }
});

// Close keys dialog when backdrop (outside panel) is clicked
elements.keysDialog.addEventListener("click", (event) => {
  if (event.target === elements.keysDialog) elements.keysDialog.close();
});
elements.keysDialog.addEventListener("cancel", () => {
  adminEditingKey = false;
});

function base64PreviewUrl(dataBase64: string, mimeType: string): string {
  try {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  } catch {
    return `data:${mimeType};base64,${dataBase64}`;
  }
}

async function pasteReferencesFromClipboard(via = "paste_button"): Promise<void> {
  if (referencePasteInFlight) {
    logUi("ui_reference_paste_ignored", { reason: "upload_in_progress", via });
    return;
  }
  const startedAt = performance.now();
  const remaining = referenceLimit() - referenceImages.length;
  if (remaining <= 0) {
    showToast("You can attach at most 16 reference images.", true);
    return;
  }
  referencePasteInFlight = true;
  setReferencePasteBusy(true, "Reading clipboard…", "Checking for reference images…");
  logUi("ui_paste_images_start", { remaining, via });
  try {
    if (!app.rpc) throw new Error("App is not ready yet.");
    try {
      const files = await imageFilesFromBrowserClipboard(remaining);
      if (files.length) {
        logUi("ui_paste_images_browser", { found: files.length, via });
        await attachReferenceFiles(files, true);
        return;
      }
      logUi("ui_paste_images_browser", { found: 0, via });
    } catch (error) {
      logUi("ui_paste_images_browser", { ok: false, via, message: error instanceof Error ? error.message : "unavailable" });
    }
    const result = await app.rpc.request.readClipboardImages({ maxCount: remaining });
    if (result.error || !result.images.length) {
      showToast(result.error || "Clipboard has no image.", true);
      logUi("ui_paste_images_native", { ok: false, error: result.error, via });
      return;
    }
    let uploaded = 0;
    setReferencePasteBusy(true, `Uploading ${result.images.length} reference image${result.images.length === 1 ? "" : "s"}…`);
    for (const image of result.images) {
      if (referenceImages.length >= referenceLimit()) break;
      if (!image.dataBase64 || image.dataBase64.length < 8) continue;
      try {
        const upload = await app.rpc.request.uploadReferenceImage({
          dataBase64: image.dataBase64,
          filename: image.filename || `clipboard-${Date.now()}.png`,
          mimeType: image.mimeType || "image/png",
        });
        referenceImages.push({
          fileId: upload.fileId,
          name: image.filename || "Pasted image",
          previewUrl: base64PreviewUrl(image.dataBase64, image.mimeType || "image/png"),
        });
        uploaded += 1;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not upload pasted image.", true);
        logUi("ui_reference_upload_error", {
          name: image.filename,
          message: error instanceof Error ? error.message : "error",
        });
      }
    }
    renderReferenceImages(uploaded
      ? `${uploaded} reference image${uploaded === 1 ? "" : "s"} added. ${referenceImages.length} attached.`
      : undefined);
    if (uploaded) {
      showToast(`${uploaded} reference image${uploaded === 1 ? "" : "s"} added.`);
      void refreshEstimate();
    } else {
      showToast("Clipboard image was empty or could not be uploaded.", true);
    }
    logUi("ui_paste_images_native", { ok: uploaded > 0, uploaded, found: result.images.length, via, durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not paste images.";
    showToast(message, true);
    logUi("ui_paste_images_native", { ok: false, message, via, durationMs: Math.round(performance.now() - startedAt) });
  } finally {
    referencePasteInFlight = false;
    setReferencePasteBusy(false);
  }
}

elements.pasteReference.addEventListener("click", () => void pasteReferencesFromClipboard("paste_button"));
elements.pickReference.addEventListener("click", () => elements.referenceFile.click());

elements.exportButton.addEventListener("click", async () => {
  if (!session) return;
  elements.exportButton.disabled = true;
  try {
    const result = session.parentRunId
      ? await app.rpc!.request.exportRunZip({ runId: session.parentRunId, pickPath: true })
      : await app.rpc!.request.exportSessionZip({ sessionId: session.sessionId, pickPath: true });
    if (result.filePath) {
      elements.sessionMessage.textContent = `Exported to ${result.filePath}`;
      showToast("ZIP exported.");
      await loadExports();
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not export session", true);
  } finally {
    elements.exportButton.disabled = false;
  }
});
elements.previewSession.addEventListener("click", async () => {
  if (!session) return;
  elements.previewSession.disabled = true;
  try {
    const items = (await app.rpc!.request.listHistory({})).filter((item) => item.sessionId === session!.sessionId && item.hasImage);
    if (!items.length) {
      showToast("No saved images are ready to preview yet.", true);
      return;
    }
    await openLightbox(items, 0);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load session preview.", true);
  } finally {
    syncActionState();
  }
});
elements.refreshSessions.addEventListener("click", () => void loadSessions());
elements.refreshUsage.addEventListener("click", () => void loadUsage());
elements.usageRange.addEventListener("change", () => void loadUsage());
elements.usageRefreshLimits.addEventListener("click", async () => {
  elements.usageRefreshLimits.disabled = true;
  try {
    const admin = await app.rpc!.request.refreshRateLimits({});
    if (bootstrapData) bootstrapData = { ...bootstrapData, admin };
    applyAdminView(admin);
    renderUsageLimits();
    showToast(admin.rateLimits ? "Provider limits refreshed." : (admin.lastError ?? "Provider limits are unavailable."), !admin.rateLimits);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not refresh provider limits", true);
  } finally {
    elements.usageRefreshLimits.disabled = false;
  }
});
elements.usageOpenKeys.addEventListener("click", () => elements.manageKeys.click());
elements.refreshHistory.addEventListener("click", () => void loadHistory());
elements.historySearch.addEventListener("input", () => renderHistory(false));
elements.historyFilter.addEventListener("change", () => renderHistory(false));
elements.libraryDownloadSelected.addEventListener("click", async () => {
  const assetIds = historyItems.filter((item) => librarySelectedPromptIds.has(item.promptId) && item.assetId && item.hasImage).map((item) => item.assetId!);
  if (!assetIds.length) return;
  elements.libraryDownloadSelected.disabled = true;
  try {
    const result = await app.rpc!.request.exportSelectedHistoryZip({ assetIds, pickPath: true });
    if (result.filePath) {
      showToast(`${assetIds.length} image${assetIds.length === 1 ? "" : "s"} downloaded as a ZIP.`);
      await loadExports();
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not download selected images.", true);
  } finally {
    updateLibrarySelection();
  }
});
elements.libraryDeleteSelected.addEventListener("click", async () => {
  const promptIds = [...librarySelectedPromptIds];
  if (!promptIds.length || !window.confirm(`Delete ${promptIds.length} selected image${promptIds.length === 1 ? "" : "s"} from this device? The session stays in Library.`)) return;
  elements.libraryDeleteSelected.disabled = true;
  try {
    for (const promptId of promptIds) await app.rpc!.request.deleteHistoryItem({ promptId });
    librarySelectedPromptIds.clear();
    await loadHistory();
    showToast(`${promptIds.length} image${promptIds.length === 1 ? "" : "s"} deleted.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not delete selected images.", true);
    updateLibrarySelection();
  }
});
elements.lightboxClose.addEventListener("click", () => closeLightbox());
elements.lightboxPrev.addEventListener("click", () => void showLightboxAt(lightboxIndex - 1));
elements.lightboxNext.addEventListener("click", () => void showLightboxAt(lightboxIndex + 1));
elements.lightboxPromptToggle.addEventListener("click", () => {
  lightboxPromptExpanded = !lightboxPromptExpanded;
  elements.lightboxCaption.classList.toggle("expanded", lightboxPromptExpanded);
  elements.lightboxPromptToggle.textContent = lightboxPromptExpanded ? "Hide prompt" : "Show prompt";
});
elements.lightbox.addEventListener("click", (event) => {
  if (event.target === elements.lightbox) closeLightbox();
});
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const activeMenu = target?.closest<HTMLDetailsElement>(".action-menu");
  document.querySelectorAll<HTMLDetailsElement>(".action-menu[open]").forEach((menu) => {
    if (menu !== activeMenu) menu.open = false;
  });
  if (target?.closest(".menu-action")) activeMenu?.removeAttribute("open");
});
window.addEventListener("keydown", (event) => {
  if (elements.lightbox.hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") void showLightboxAt(lightboxIndex - 1);
  if (event.key === "ArrowRight") void showLightboxAt(lightboxIndex + 1);
});
elements.clearHistory.addEventListener("click", async () => {
  if (!historyItems.length || !window.confirm("Delete all prompt history and all locally stored generated images? This cannot be undone.")) return;
  elements.clearHistory.disabled = true;
  try {
    const result = await app.rpc!.request.clearHistory({});
    await loadHistory();
    showToast(`Deleted ${result.deletedPrompts} prompts and ${result.deletedAssets} images.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not clear history", true);
  } finally {
    elements.clearHistory.disabled = false;
  }
});
elements.refreshExports.addEventListener("click", () => void loadExports());
elements.openExportsFolder.addEventListener("click", async () => {
  try {
    const result = await app.rpc!.request.revealExportsFolder({});
    showToast(`Opened ${result.directory}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not open exports folder", true);
  }
});
elements.refreshLogs.addEventListener("click", () => void loadLogs());
elements.logsEvent.addEventListener("change", () => void loadLogs());
elements.logsSearch.addEventListener("input", () => {
  if (logsSearchTimer !== null) window.clearTimeout(logsSearchTimer);
  logsSearchTimer = window.setTimeout(() => void loadLogs(), 250);
});
elements.copyLogs.addEventListener("click", async () => {
  if (!logsLines.length) return;
  try {
    await navigator.clipboard.writeText(logsLines.join("\n"));
    showToast("Logs copied.");
  } catch {
    showToast("Could not copy logs", true);
  }
});
elements.openLogsFolder.addEventListener("click", async () => {
  try {
    const result = await app.rpc!.request.revealLogsFolder({});
    showToast(`Opened ${result.directory}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not open logs folder", true);
  }
});

await bootstrap();

window.addEventListener("beforeunload", (event) => {
  if (!session || !["pending", "processing"].includes(session.status)) return;
  event.preventDefault();
  event.returnValue = session.runMode === "direct"
    ? "A direct run is still generating. Closing cannot recover an in-flight request."
    : "A batch is still being checked. You can reopen later and continue from the saved run.";
});
