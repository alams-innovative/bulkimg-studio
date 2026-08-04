import Electrobun, { Electroview } from "electrobun/view";
import { animate } from "motion/mini";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  createIcons,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  ImagePlus,
  Images,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Moon,
  PackageOpen,
  RefreshCw,
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
  ExportSummary,
  HistoryItem,
  PromptCell,
  PromptGroup,
  PromptMatrix,
  RunMode,
  RunSummary,
  SessionDetail,
  SessionPromptOutcome,
  SessionSummary,
  SessionTelemetry,
} from "../shared/contracts";
import { APP_LIMITS } from "../shared/contracts";
import type { OutputFormatId } from "../shared/output-formats";

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
  historyView: byId("history-view"),
  exportsView: byId("exports-view"),
  logsView: byId("logs-view"),
  refreshLogs: byId<HTMLButtonElement>("refresh-logs"),
  copyLogs: byId<HTMLButtonElement>("copy-logs"),
  openLogsFolder: byId<HTMLButtonElement>("open-logs-folder"),
  logsEvent: byId<HTMLSelectElement>("logs-event"),
  logsSearch: byId<HTMLInputElement>("logs-search"),
  logsCount: byId("logs-count"),
  logsList: byId("logs-list"),
  logsPath: byId("logs-path"),
  selectedCount: byId("selected-count"),
  estimatedCost: byId("estimated-cost"),
  fxRate: byId("fx-rate"),
  csvTab: byId<HTMLButtonElement>("csv-tab"),
  manualTab: byId<HTMLButtonElement>("manual-tab"),
  csvPanel: byId("csv-panel"),
  manualPanel: byId("manual-panel"),
  csvFile: byId<HTMLInputElement>("csv-file"),
  pickCsvNative: byId<HTMLButtonElement>("pick-csv-native"),
  manualPrompts: byId<HTMLTextAreaElement>("manual-prompts"),
  parseManual: byId<HTMLButtonElement>("parse-manual"),
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
  adminForm: byId<HTMLFormElement>("admin-form"),
  adminKey: byId<HTMLInputElement>("admin-key"),
  adminProject: byId<HTMLInputElement>("admin-project"),
  adminStatus: byId("admin-status"),
  refreshLimits: byId<HTMLButtonElement>("refresh-limits"),
  clearAdmin: byId<HTMLButtonElement>("clear-admin"),
  sessionStatus: byId("session-status"),
  sessionMessage: byId("session-message"),
  elapsed: byId("elapsed"),
  eta: byId("eta"),
  progress: byId("progress"),
  progressBar: byId("progress-bar"),
  sessionCost: byId("session-cost"),
  exportButton: byId<HTMLButtonElement>("export-button"),
  retryButton: byId<HTMLButtonElement>("retry-button"),
  refreshSessions: byId<HTMLButtonElement>("refresh-sessions"),
  sessionList: byId("session-list"),
  refreshHistory: byId<HTMLButtonElement>("refresh-history"),
  clearHistory: byId<HTMLButtonElement>("clear-history"),
  historySearch: byId<HTMLInputElement>("history-search"),
  historyFilter: byId<HTMLSelectElement>("history-filter"),
  historyCount: byId("history-count"),
  historyList: byId("history-list"),
  lightbox: byId("lightbox"),
  lightboxImage: byId<HTMLImageElement>("lightbox-image"),
  lightboxCaption: byId("lightbox-caption"),
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
  waveSplit: byId<HTMLInputElement>("wave-split"),
  waveSize: byId<HTMLInputElement>("wave-size"),
  waveMath: byId("wave-math"),
  rateLimitsLine: byId("rate-limits-line"),
  keySummary: byId("key-summary"),
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
let logsLines: string[] = [];
let logsSearchTimer: number | null = null;
let historyItems: HistoryItem[] = [];
let historyImageObserver: IntersectionObserver | null = null;
let lightboxItems: HistoryItem[] = [];
let lightboxIndex = 0;
type ReferenceImage = { fileId: string; name: string; previewUrl: string };
let referenceImages: ReferenceImage[] = [];
let estimateTimer: number | null = null;
let matrixPage = 0;
let activeKeyCount = 0;
let matrixView: "list" | "cards" = localStorage.getItem("bulkimg-prompt-view") === "cards" ? "cards" : "list";
let lastTelemetryStatus: SessionTelemetry["status"] | null = null;
let selectionSyncToken = 0;
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

function effectiveWaveSize(): number {
  if (currentMode() !== "batch" || !elements.waveSplit.checked) return 0;
  const raw = Number(elements.waveSize.value);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(appLimits.batchPromptLimit, Math.floor(raw));
}

function describeWaveMath(promptCount: number): string {
  const size = effectiveWaveSize();
  if (size <= 0 || promptCount <= 0) return promptCount ? `${promptCount} prompt${promptCount === 1 ? "" : "s"} → 1 batch` : "No prompts selected";
  const full = Math.floor(promptCount / size);
  const rem = promptCount % size;
  const waves = full + (rem ? 1 : 0);
  if (rem === 0) return `${promptCount} prompts → ${waves} wave${waves === 1 ? "" : "s"} of ${size}`;
  if (full === 0) return `${promptCount} prompts → 1 wave of ${promptCount}`;
  return `${promptCount} prompts → ${full} wave${full === 1 ? "" : "s"} of ${size} + 1 of ${rem}`;
}

function updateWaveUi(): void {
  const batch = currentMode() === "batch";
  elements.waveControls.classList.toggle("hidden", !batch);
  elements.waveSize.disabled = !batch || !elements.waveSplit.checked;
  elements.waveMath.textContent = batch ? describeWaveMath(selected.size) : "Direct mode does not use waves";
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

function formatRateLimits(admin: AdminConfigView | null): string {
  if (!admin?.configured) {
    return admin?.lastError
      ? `Admin key error: ${admin.lastError}`
      : "No Admin API key — org rate limits (images/min, TPM) won’t show. Generation still works.";
  }
  const limits = admin.rateLimits;
  if (!limits) {
    return admin.projectId
      ? `Admin key saved · project ${admin.projectId}. Limits not loaded yet — refresh limits.`
      : "Admin key saved. Set a project ID and refresh limits.";
  }
  const ipm = limits.maxImagesPerMinute != null ? `${formatNumber(limits.maxImagesPerMinute)} images/min` : "images/min —";
  const tpm = limits.maxTokensPerMinute != null ? `${formatNumber(limits.maxTokensPerMinute)} TPM` : "TPM —";
  return `${limits.model}: ${ipm} · ${tpm}`;
}

function applyAdminView(admin: AdminConfigView): void {
  elements.adminStatus.textContent = admin.configured
    ? `Admin key ${admin.keyHint ?? "saved"}${admin.projectId ? ` · ${admin.projectId}` : ""}`
    : "No Admin key — limits won’t show.";
  if (admin.projectId && !elements.adminProject.value) elements.adminProject.value = admin.projectId;
  elements.rateLimitsLine.textContent = formatRateLimits(admin);
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

const slateStackIcons = {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  ImagePlus,
  Images,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Moon,
  PackageOpen,
  RefreshCw,
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

function showToast(message: string, isError = false): void {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.setAttribute("role", isError ? "alert" : "status");
  elements.toast.setAttribute("aria-live", isError ? "assertive" : "polite");
  elements.toast.classList.add("show");
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 4200);
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

async function setView(view: "generator" | "sessions" | "history" | "exports" | "logs"): Promise<void> {
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    const active = button.dataset["view"] === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  elements.generatorView.classList.toggle("hidden", view !== "generator");
  elements.sessionsView.classList.toggle("hidden", view !== "sessions");
  elements.historyView.classList.toggle("hidden", view !== "history");
  elements.exportsView.classList.toggle("hidden", view !== "exports");
  elements.logsView.classList.toggle("hidden", view !== "logs");
  elements.headerStats.classList.toggle("hidden", view !== "generator");
  const titles = {
    generator: "Generate images.",
    sessions: "Sessions",
    history: "History",
    exports: "Exports",
    logs: "Logs",
  } as const;
  elements.pageTitle.textContent = titles[view];
  if (view === "sessions") await loadSessions();
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
  const overDirectLimit = currentMode() === "direct" && count > directPromptLimit();
  elements.runButton.disabled = count === 0 || overDirectLimit;
  elements.runButton.querySelector("span")!.textContent = overDirectLimit
    ? `Choose up to ${directPromptLimit()}`
    : count ? `Generate ${count}` : "Generate";
  updateWaveUi();
  if (estimateTimer !== null) window.clearTimeout(estimateTimer);
  if (count === 0) {
    elements.estimatedCost.textContent = "$0.00";
    elements.railEstimate.textContent = "$0.00";
    elements.railPkr.textContent = "PKR 0.00";
    return;
  }
  estimateTimer = window.setTimeout(() => void refreshEstimate(), 180);
}

async function refreshEstimate(): Promise<void> {
  const count = selected.size;
  if (count === 0) {
    elements.estimatedCost.textContent = "$0.00";
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
    elements.estimatedCost.textContent = `$${estimate.costUsd.toFixed(2)}`;
    elements.railEstimate.textContent = `$${estimate.costUsd.toFixed(3)}`;
    elements.railPkr.textContent = `PKR ${estimate.costPkr.toFixed(2)}`;
    animateState(elements.railEstimate);
  } catch {
    elements.estimatedCost.textContent = "—";
  }
}

function applyMatrix(next: PromptMatrix): void {
  matrix = next;
  selected = new Set();
  matrixPage = 0;
  elements.sourceName.textContent = next.sourceName;
  const enabled = next.cells.filter((cell) => !cell.disabled).length;
  const disabled = next.cells.length - enabled;
  const weekGroups = next.groups.filter((group) => group.id !== "manual").length;
  elements.sourceSummary.textContent = weekGroups
    ? `${enabled} prompts · ${weekGroups} weeks · ${disabled} unavailable`
    : `${enabled} prompt${enabled === 1 ? "" : "s"}${disabled ? ` · ${disabled} unavailable` : ""}`;
  elements.warnings.classList.toggle("hidden", next.warnings.length === 0);
  elements.warnings.textContent = next.warnings.join(" ");
  renderMatrix(true, true);
  updateSelection();
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
    elements.matrix.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="circle-alert"></i></span><strong>No prompts found</strong><small>Check the file structure or try the manual prompt pad.</small></div>';
    refreshIcons();
    elements.matrixScrollUp.disabled = true;
    elements.matrixScrollDown.disabled = true;
    elements.matrixScrollPosition.textContent = "No imported rows";
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
  elements.matrixPage.textContent = `Page ${matrixPage + 1} of ${pages}`;
  elements.matrixPrev.disabled = matrixPage === 0;
  elements.matrixNext.disabled = matrixPage >= pages - 1;
  const renderCard = (cell: PromptCell) => `
    <button type="button" class="prompt-card ${cell.disabled ? "disabled" : ""} ${selected.has(cell.id) ? "selected" : ""}" data-id="${cell.id}" aria-pressed="${selected.has(cell.id)}" ${cell.disabled ? `disabled title="${escapeHtml(cell.disabledReason ?? "This schedule cell cannot generate an image")}"` : ""}>
      <span class="prompt-meta"><span>${escapeHtml(cell.dayLabel || "Prompt")}</span><span>${escapeHtml(cell.scheduleDate || "No date")}</span></span>
      <span class="prompt-copy"><span class="prompt-theme">${escapeHtml(cell.themeColumn)}</span><span class="prompt-text">${escapeHtml(cell.promptText)}</span></span>
      <span class="check-dot" aria-hidden="true">${checkIconMarkup()}</span>
    </button>
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
    ? ` · wave ${next.waveIndex + 1}/${next.waveCount}`
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
  elements.exportButton.disabled = false;
  elements.cancelButton.disabled = !active;
  const canResume = next.retryableCount > 0 && ["partial", "failed", "cancelled"].includes(next.status);
  elements.retryButton.classList.toggle("hidden", !canResume);
  elements.retryButton.disabled = !canResume;
  elements.resumeButton.classList.toggle("hidden", !canResume);
  elements.resumeButton.disabled = !canResume;
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
  if (file.size === 0) return `${file.name || "That image"} is empty.`;
  if (file.size > referenceLimitBytes()) return "Each reference can be up to 50 MB.";
  return null;
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
  elements.referenceDock.classList.toggle("has-image", count > 0);
  elements.referenceDock.disabled = count >= limit;
  elements.referenceTitle.textContent = count === 0 ? "Add reference images" : count >= limit ? "References ready" : "Add another reference";
  elements.referenceHint.textContent = count === 0
    ? `Choose, drop, or paste up to ${limit} images · 50 MB each`
    : count >= limit ? "Remove an image to add another" : "Click, drop, or press Ctrl+V to add more";
  elements.referenceBadge.textContent = `${count}/${limit}`;
  elements.referenceList.classList.toggle("hidden", count === 0);
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

async function attachReferenceFiles(files: File[]): Promise<void> {
  const limit = referenceLimit();
  const remaining = limit - referenceImages.length;
  if (remaining <= 0) {
    showToast("You can attach at most 16 reference images.", true);
    return;
  }
  const accepted = files.slice(0, remaining);
  if (files.length > accepted.length) showToast("You can attach at most 16 reference images.", true);
  elements.referenceBadge.textContent = "Uploading";
  elements.referenceDock.setAttribute("aria-busy", "true");
  elements.referenceDock.disabled = true;
  let uploaded = 0;
  for (const file of accepted) {
    const validationError = referenceFileError(file);
    if (validationError) {
      showToast(validationError, true);
      continue;
    }
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buffer.length; i += chunk) binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
      const result = await app.rpc!.request.uploadReferenceImage({
        dataBase64: btoa(binary),
        filename: file.name || `clipboard-${Date.now()}.png`,
        mimeType: referenceMimeType(file),
      });
      referenceImages.push({ fileId: result.fileId, name: file.name || "Pasted image", previewUrl: URL.createObjectURL(file) });
      uploaded += 1;
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Could not upload ${file.name || "the reference image"}.`, true);
    }
  }
  elements.referenceDock.removeAttribute("aria-busy");
  elements.referenceFile.value = "";
  renderReferenceImages(uploaded ? `${uploaded} reference image${uploaded === 1 ? "" : "s"} added. ${referenceImages.length} attached.` : undefined);
  if (uploaded) {
    showToast(`${uploaded} reference image${uploaded === 1 ? "" : "s"} added.`);
    void refreshEstimate();
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
  elements.keyCount.textContent = String(active);
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
          const label = wave.waveIndex != null ? `Wave ${wave.waveIndex + 1}` : wave.sessionId.slice(0, 8);
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
            <div><strong>Run ${escapeHtml(run.runId.slice(0, 8))}</strong><span>${formatDate(run.startTime)} · ${escapeHtml(run.runMode)} · ${run.waveCount || 1} wave(s)</span></div>
            <div class="run-group-stats">
              <strong class="status-badge status-${escapeHtml(run.status)}">${escapeHtml(run.status)}</strong>
              <span>${run.completedCount}/${run.totalPrompts}</span>
              <span>$${run.costUsd.toFixed(3)} / est $${run.estimateUsd.toFixed(3)}</span>
            </div>
            <div class="session-actions">
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
  const wave = t.waveCount != null && t.waveIndex != null ? `Wave ${t.waveIndex + 1}/${t.waveCount}` : "Single session";
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
      ${canResume ? `<button type="button" class="secondary-button session-resume" data-session-id="${t.sessionId}">Resume leftovers</button>` : ""}
      ${["pending", "processing"].includes(t.status) ? `<button type="button" class="secondary-button session-cancel" data-session-id="${t.sessionId}">Cancel</button>` : ""}
      <button type="button" class="secondary-button session-export" data-session-id="${t.sessionId}">Export ZIP</button>
      <button type="button" class="secondary-button session-diagnostic" data-diagnostic-id="${escapeHtml(t.diagnosticId)}">Copy diagnostic ID</button>
    </div>
    <h4 class="session-prompts-heading">Prompts</h4>
    ${formatPromptRows(detail.prompts)}
  </div>`;
}

async function toggleSessionDetail(sessionId: string): Promise<void> {
  const panel = elements.sessionList.querySelector<HTMLElement>(`.session-detail-panel[data-detail-for="${sessionId}"]`);
  if (!panel) return;
  const isOpen = !panel.classList.contains("hidden") && !panel.hidden;
  elements.sessionList.querySelectorAll<HTMLElement>(".session-detail-panel").forEach((node) => {
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
    bindSessionListHandlers(panel);
    enter(panel, 0, 4);
  } catch (error) {
    panel.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load detail")}</div>`;
  }
}

function bindSessionListHandlers(root: ParentNode = elements.sessionList): void {
  root.querySelectorAll<HTMLButtonElement>(".session-detail").forEach((button) => {
    button.onclick = () => void toggleSessionDetail(button.dataset["sessionId"]!);
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
      await loadSessions();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".session-check").forEach((button) => {
    button.onclick = async () => {
      await app.rpc!.request.getSessionDetail({ sessionId: button.dataset["sessionId"]!, refresh: true });
      await loadSessions();
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
  elements.lightboxCaption.textContent = "";
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
  lightboxIndex = ((index % lightboxItems.length) + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex]!;
  elements.lightbox.classList.remove("hidden");
  elements.lightbox.hidden = false;
  elements.lightboxCaption.textContent = item.promptText;
  elements.lightboxImage.alt = item.promptText;
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
      <button type="button" class="history-image preview-history" ${item.assetId ? `data-asset-id="${escapeHtml(item.assetId)}" data-prompt-id="${escapeHtml(item.promptId)}"` : "disabled"} aria-label="Preview image">
        <div class="image-placeholder"><i data-lucide="${item.hasImage ? "loader-circle" : "image-off"}" aria-hidden="true"></i><strong>${item.hasImage ? "Loading preview" : "No image saved"}</strong><small>${item.hasImage ? "Stored locally" : "Prompt retained from this session"}</small></div>
      </button>
      <div class="history-card-body">
        <div class="history-card-meta"><span>${formatDate(item.createdAt)}</span><span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
        <p class="history-prompt">${escapeHtml(item.promptText)}</p>
        <div class="history-details">
          <div><span>Model</span><strong title="${escapeHtml(item.model)}">${escapeHtml(item.model)}</strong></div>
          <div><span>Theme / week</span><strong title="${escapeHtml(item.themeColumn)}">${escapeHtml(item.themeColumn || item.week || "Manual")}</strong></div>
          <div><span>Tokens</span><strong>${formatNumber(item.inputTokens + item.outputTokens)}</strong></div>
          <div><span>Tracked cost</span><strong>$${item.costUsd.toFixed(3)}</strong></div>
        </div>
        <div class="history-actions">
          <button class="secondary-button preview-history" data-prompt-id="${item.promptId}" ${item.hasImage && item.assetId ? "" : "disabled"}>Preview</button>
          <button class="secondary-button reveal-history" data-asset-id="${item.assetId ?? ""}" ${item.assetId ? "" : "disabled"}>Show file</button>
          <button class="secondary-button reveal-session" data-session-id="${item.sessionId}">Open session folder</button>
          <button class="secondary-button danger-button delete-history" data-prompt-id="${item.promptId}">Delete</button>
        </div>
      </div>
    </article>`;
}

function renderHistory(animateCards = false): void {
  historyImageObserver?.disconnect();
  const visible = filteredHistoryItems();
  elements.clearHistory.disabled = historyItems.length === 0;
  elements.historyCount.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  if (!visible.length) {
    const query = elements.historySearch.value.trim();
    elements.historyList.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="${query ? "search" : "images"}"></i></span><strong>${query ? "No matching history" : "History is empty"}</strong><small>${query ? "Try a broader search." : "Submitted prompts and generated images will appear here."}</small></div>`;
    refreshIcons();
    return;
  }

  const groups = new Map<string, { title: string; subtitle: string; items: HistoryItem[] }>();
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
      subtitle: `${item.runMode}${wave}`,
      items: [item],
    });
  }

  elements.historyList.innerHTML = [...groups.values()].map((group) => `
    <section class="history-group">
      <header class="history-group-head"><strong>${escapeHtml(group.title)}</strong><span>${escapeHtml(group.subtitle)} · ${group.items.length} item${group.items.length === 1 ? "" : "s"}</span></header>
      <div class="history-grid-inner">${group.items.map(renderHistoryCard).join("")}</div>
    </section>`).join("");
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
    historyItems = await app.rpc!.request.listHistory({});
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
  document.title = `${data.brand.appName} ${data.brand.version}`;
  elements.brandName.textContent = data.brand.appName;
  elements.brandVersion.textContent = data.brand.version;
  elements.platform.textContent = data.platform;
  elements.keyCount.textContent = String(data.keyCount);
  activeKeyCount = data.keyCount;
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
    const waveSize = data.settings.waveSize;
    elements.waveSize.value = String(waveSize);
    elements.waveSplit.checked = waveSize > 0;
  }
  if (data.admin) applyAdminView(data.admin);
  else if (data.adminWarning) elements.rateLimitsLine.textContent = data.adminWarning;
  renderReferenceImages();
  updateWaveUi();
}

applyTheme(getInitialTheme());
refreshIcons();

elements.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
  applyTheme(current === "dark" ? "light" : "dark", true);
});

document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => void setView(button.dataset["view"] as "generator" | "sessions" | "history" | "exports" | "logs"));
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
});
elements.pickCsvNative.addEventListener("click", async () => {
  elements.pickCsvNative.disabled = true;
  elements.pickCsvNative.setAttribute("aria-busy", "true");
  try {
    const picked = await app.rpc!.request.pickCsvFile({});
    if (!picked) return;
    applyMatrix(await app.rpc!.request.importCSV(picked));
    showToast(`Loaded ${picked.sourceName}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not open CSV", true);
  } finally {
    elements.pickCsvNative.disabled = false;
    elements.pickCsvNative.removeAttribute("aria-busy");
  }
});
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
elements.manualPrompts.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") elements.parseManual.click();
});
document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset["pick"];
    const cells = selectableCells();
    selected = action === "none" ? new Set() : new Set(cells.slice(0, action === "all" ? undefined : Number(action)).map((cell) => cell.id));
    syncVisibleSelections();
    updateSelection();
  });
});
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
elements.waveSplit.addEventListener("change", () => {
  if (!elements.waveSplit.checked) elements.waveSize.value = "0";
  else if (Number(elements.waveSize.value) <= 0) elements.waveSize.value = String(appLimits.defaultWaveSize || APP_LIMITS.defaultWaveSize);
  updateWaveUi();
  void app.rpc!.request.setSettings({ waveSize: effectiveWaveSize() }).catch(() => undefined);
});
elements.waveSize.addEventListener("change", () => {
  if (Number(elements.waveSize.value) <= 0) elements.waveSplit.checked = false;
  else elements.waveSplit.checked = true;
  updateWaveUi();
  void app.rpc!.request.setSettings({ waveSize: effectiveWaveSize() }).catch(() => undefined);
});
elements.model.addEventListener("change", () => void refreshEstimate());
elements.quality.addEventListener("change", () => void refreshEstimate());
elements.size.addEventListener("change", () => void refreshEstimate());

elements.referenceDock.addEventListener("click", () => elements.referenceFile.click());
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
window.addEventListener("paste", (event) => {
  const itemFiles = [...(event.clipboardData?.items ?? [])]
    .filter((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
    .map((entry) => entry.getAsFile())
    .filter((file): file is File => Boolean(file));
  const clipboardFiles = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name));
  const files = [...itemFiles, ...clipboardFiles].filter((file, index, all) =>
    all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.type === file.type) === index,
  );
  if (files.length) {
    event.preventDefault();
    void attachReferenceFiles(files);
  }
});

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
  elements.runButton.disabled = true;
  elements.runButton.setAttribute("aria-busy", "true");
  elements.runButton.querySelector("span")!.textContent = "Starting…";
  try {
    const prompts = matrix.cells.filter((cell) => selected.has(cell.id)).map(({ promptText, week, scheduleDate, themeColumn }) => ({ promptText, week, scheduleDate, themeColumn }));
    const next = await app.rpc!.request.submitBatchRun({
      prompts,
      model: elements.model.value,
      mode: currentMode(),
      format: elements.size.value as OutputFormatId,
      quality: elements.quality.value as "low" | "medium" | "high",
      waveSize: effectiveWaveSize(),
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
    elements.resumeButton.disabled = false;
    elements.retryButton.disabled = false;
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
    openKeysDialog(byId<HTMLElement>("keys-title"));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load API keys", true);
  }
});
elements.refreshKeys.addEventListener("click", () => void loadKeys());
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
    showToast("API key encrypted and saved.");
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save key";
    elements.keyError.classList.remove("hidden");
  } finally {
    if (submit) submit.disabled = false;
  }
});
elements.adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.keyError.classList.add("hidden");
  try {
    const admin = await app.rpc!.request.setAdminKey({
      key: elements.adminKey.value,
      ...(elements.adminProject.value.trim() ? { projectId: elements.adminProject.value.trim() } : {}),
    });
    elements.adminKey.value = "";
    applyAdminView(admin);
    showToast(admin.configured ? "Admin key saved." : "Admin key updated.");
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save Admin key";
    elements.keyError.classList.remove("hidden");
  }
});
elements.refreshLimits.addEventListener("click", async () => {
  try {
    if (elements.adminProject.value.trim()) {
      await app.rpc!.request.setAdminProjectId({ projectId: elements.adminProject.value.trim() });
    }
    applyAdminView(await app.rpc!.request.refreshRateLimits({}));
    showToast("Rate limits refreshed.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not refresh rate limits", true);
  }
});
elements.clearAdmin.addEventListener("click", async () => {
  try {
    applyAdminView(await app.rpc!.request.clearAdminKey({}));
    elements.adminProject.value = "";
    showToast("Admin key cleared.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not clear Admin key", true);
  }
});
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
elements.refreshSessions.addEventListener("click", () => void loadSessions());
elements.refreshHistory.addEventListener("click", () => void loadHistory());
elements.historySearch.addEventListener("input", () => renderHistory(false));
elements.historyFilter.addEventListener("change", () => renderHistory(false));
elements.lightboxClose.addEventListener("click", () => closeLightbox());
elements.lightboxPrev.addEventListener("click", () => void showLightboxAt(lightboxIndex - 1));
elements.lightboxNext.addEventListener("click", () => void showLightboxAt(lightboxIndex + 1));
elements.lightbox.addEventListener("click", (event) => {
  if (event.target === elements.lightbox) closeLightbox();
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
  if (session?.runMode !== "direct" || !["pending", "processing"].includes(session.status)) return;
  event.preventDefault();
  event.returnValue = "A Direct run is still generating.";
});
