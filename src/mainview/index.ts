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
  ApiKeyStats,
  AppBootstrap,
  AppRPC,
  ExportSummary,
  HistoryItem,
  PromptCell,
  PromptGroup,
  PromptMatrix,
  RunMode,
  SessionSummary,
  SessionTelemetry,
} from "../shared/contracts";
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
  sessionStatus: byId("session-status"),
  sessionMessage: byId("session-message"),
  elapsed: byId("elapsed"),
  progress: byId("progress"),
  tokens: byId("tokens"),
  sessionCost: byId("session-cost"),
  exportButton: byId<HTMLButtonElement>("export-button"),
  retryButton: byId<HTMLButtonElement>("retry-button"),
  refreshSessions: byId<HTMLButtonElement>("refresh-sessions"),
  sessionList: byId("session-list"),
  refreshHistory: byId<HTMLButtonElement>("refresh-history"),
  clearHistory: byId<HTMLButtonElement>("clear-history"),
  historySearch: byId<HTMLInputElement>("history-search"),
  historyCount: byId("history-count"),
  historyList: byId("history-list"),
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
type ReferenceImage = { fileId: string; name: string; previewUrl: string };
let referenceImages: ReferenceImage[] = [];
let estimateTimer: number | null = null;
let matrixPage = 0;
let activeKeyCount = 0;
let matrixView: "list" | "cards" = localStorage.getItem("bulkimg-prompt-view") === "cards" ? "cards" : "list";
let lastTelemetryStatus: SessionTelemetry["status"] | null = null;
let selectionSyncToken = 0;
const PAGE_SIZE = 100;
const REFERENCE_LIMIT = 4;

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
  const overDirectLimit = currentMode() === "direct" && count > 4;
  elements.runButton.disabled = count === 0 || overDirectLimit;
  elements.runButton.querySelector("span")!.textContent = overDirectLimit ? "Choose up to 4" : count ? `Generate ${count}` : "Generate";
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
  elements.sessionMessage.textContent = next.message;
  const active = next.status === "pending" || next.status === "processing";
  if (active) {
    startElapsedTicker(next.elapsedMs);
    elements.elapsed.textContent = formatElapsed(next.elapsedMs);
  } else {
    stopElapsedTicker();
    elements.elapsed.textContent = formatElapsed(next.elapsedMs);
  }
  elements.progress.textContent = `${next.completedCount} / ${next.totalPrompts}`;
  elements.tokens.textContent = `${formatNumber(next.inputTokens)} in · ${formatNumber(next.outputTokens)} out`;
  elements.sessionCost.textContent = `$${next.costUsd.toFixed(3)} · PKR ${next.costPkr.toFixed(2)}`;
  elements.fxRate.textContent = `PKR ${next.fxRate.toFixed(2)}`;
  elements.exportButton.disabled = false;
  elements.cancelButton.disabled = !active;
  const canRetry = next.retryableCount > 0 && ["partial", "failed"].includes(next.status);
  elements.retryButton.classList.toggle("hidden", !canRetry);
  elements.retryButton.disabled = !canRetry;
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
  if (file.size > 20 * 1024 * 1024) return `${file.name || "That image"} is larger than 20 MB.`;
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
  elements.referenceDock.classList.toggle("has-image", count > 0);
  elements.referenceDock.disabled = count >= REFERENCE_LIMIT;
  elements.referenceTitle.textContent = count === 0 ? "Add reference images" : count >= REFERENCE_LIMIT ? "References ready" : "Add another reference";
  elements.referenceHint.textContent = count === 0
    ? "Choose, drop, or paste up to 4 images"
    : count >= REFERENCE_LIMIT ? "Remove an image to add another" : "Click, drop, or press Ctrl+V to add more";
  elements.referenceBadge.textContent = `${count}/${REFERENCE_LIMIT}`;
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
  const remaining = REFERENCE_LIMIT - referenceImages.length;
  if (remaining <= 0) {
    showToast("Remove a reference image before adding another.", true);
    return;
  }
  const accepted = files.slice(0, remaining);
  if (files.length > accepted.length) showToast(`Only ${REFERENCE_LIMIT} reference images can be attached.`, true);
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
    const sessions: SessionSummary[] = await app.rpc!.request.listSessions({});
    elements.sessionList.innerHTML = sessions.length ? sessions.map((item) => `
      <article class="data-row" data-session-id="${item.sessionId}">
        <div><strong>${escapeHtml(item.sessionId.slice(0, 8))}</strong><span>${formatDate(item.startTime)}</span></div>
        <div><span>Status</span><strong class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</strong></div>
        <div><span>Output</span><strong>${escapeHtml(item.format)} · ${escapeHtml(item.quality)}</strong></div>
        <div><span>Progress</span><strong>${item.completedCount} / ${item.totalPrompts}</strong></div>
        <div class="session-actions">
          <button class="secondary-button session-open" data-session-id="${item.sessionId}">Open</button>
          ${item.runMode === "batch" && ["pending", "processing"].includes(item.status) ? `<button class="secondary-button session-check" data-session-id="${item.sessionId}">Check now</button>` : ""}
          ${["pending", "processing"].includes(item.status) ? `<button class="secondary-button session-cancel" data-session-id="${item.sessionId}">Cancel</button>` : ""}
          ${item.retryableCount > 0 && ["partial", "failed"].includes(item.status) ? `<button class="secondary-button session-retry" data-session-id="${item.sessionId}">Retry</button>` : ""}
          ${["partial", "failed"].includes(item.status) ? `<button class="secondary-button session-diagnostic" data-diagnostic-id="${item.diagnosticId}">Copy ID</button>` : ""}
          <button class="secondary-button session-export" data-session-id="${item.sessionId}">Export</button>
        </div>
      </article>`).join("") : '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="clock-3"></i></span><strong>No sessions yet</strong><small>Completed and active runs will appear here.</small></div>';
    enterVisibleItems(elements.sessionList, ".data-row");
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-open").forEach((button) => button.addEventListener("click", async () => {
      const detail = await app.rpc!.request.getSessionDetail({ sessionId: button.dataset["sessionId"]!, refresh: true });
      renderTelemetry(detail.telemetry);
      await setView("generator");
    }));
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-cancel").forEach((button) => button.addEventListener("click", async () => {
      await app.rpc!.request.cancelBatchRun({ sessionId: button.dataset["sessionId"]! });
      await loadSessions();
    }));
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-check").forEach((button) => button.addEventListener("click", async () => {
      await app.rpc!.request.getSessionDetail({ sessionId: button.dataset["sessionId"]!, refresh: true });
      await loadSessions();
    }));
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-retry").forEach((button) => button.addEventListener("click", async () => {
      renderTelemetry(await app.rpc!.request.retryFailedPrompts({ sessionId: button.dataset["sessionId"]! }));
      await setView("generator");
    }));
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-export").forEach((button) => button.addEventListener("click", async () => {
      const result = await app.rpc!.request.exportSessionZip({ sessionId: button.dataset["sessionId"]!, pickPath: true });
      if (result.filePath) showToast("Session ZIP exported.");
    }));
    elements.sessionList.querySelectorAll<HTMLButtonElement>(".session-diagnostic").forEach((button) => button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset["diagnosticId"]!);
      showToast("Diagnostic ID copied.");
    }));
  } catch (error) {
    elements.sessionList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load sessions")}</div>`;
  } finally {
    elements.sessionList.removeAttribute("aria-busy");
    elements.refreshSessions.disabled = false;
    elements.refreshSessions.removeAttribute("aria-busy");
    refreshIcons();
  }
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

function renderHistory(animateCards = false): void {
  historyImageObserver?.disconnect();
  const query = elements.historySearch.value.trim().toLowerCase();
  const visible = query ? historyItems.filter((item) => [
    item.promptText, item.model, item.themeColumn, item.week, item.scheduleDate, item.status,
  ].some((value) => value.toLowerCase().includes(query))) : historyItems;
  elements.clearHistory.disabled = historyItems.length === 0;
  elements.historyCount.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  elements.historyList.innerHTML = visible.length ? visible.map((item) => `
    <article class="history-card" data-prompt-id="${item.promptId}">
      <div class="history-image" ${item.assetId ? `data-asset-id="${escapeHtml(item.assetId)}" data-prompt-id="${escapeHtml(item.promptId)}"` : ""}>
        <div class="image-placeholder"><i data-lucide="${item.hasImage ? "loader-circle" : "image-off"}" aria-hidden="true"></i><strong>${item.hasImage ? "Loading preview" : "No image saved"}</strong><small>${item.hasImage ? "Stored locally" : "Prompt retained from this session"}</small></div>
      </div>
      <div class="history-card-body">
        <div class="history-card-meta"><span>${formatDate(item.createdAt)}</span><span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
        <p class="history-prompt">${escapeHtml(item.promptText)}</p>
        <div class="history-details">
          <div><span>Model</span><strong title="${escapeHtml(item.model)}">${escapeHtml(item.model)}</strong></div>
          <div><span>Theme / week</span><strong title="${escapeHtml(item.themeColumn)}">${escapeHtml(item.themeColumn || item.week || "Manual")}</strong></div>
          <div><span>Tokens</span><strong>${formatNumber(item.inputTokens + item.outputTokens)}</strong></div>
          <div><span>Tracked cost</span><strong>$${item.costUsd.toFixed(3)}</strong></div>
        </div>
        <div class="history-actions"><button class="secondary-button download-history" data-asset-id="${item.assetId ?? ""}" ${item.assetId ? "" : "disabled"}>Download</button><button class="secondary-button danger-button delete-history" data-prompt-id="${item.promptId}">Delete</button></div>
      </div>
    </article>`).join("") : `<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="${query ? "search" : "images"}"></i></span><strong>${query ? "No matching history" : "History is empty"}</strong><small>${query ? "Try a broader search." : "Submitted prompts and generated images will appear here."}</small></div>`;
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

  elements.historyList.querySelectorAll<HTMLButtonElement>(".download-history").forEach((button) => {
    button.addEventListener("click", async () => {
      const assetId = button.dataset["assetId"];
      if (!assetId) return;
      button.disabled = true;
      try {
        const result = await app.rpc!.request.downloadHistoryAsset({ assetId });
        showToast(`Downloaded to ${result.filePath}`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not download image", true);
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
    void refreshEstimate();
  });
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
  if (currentMode() === "direct" && selected.size > 4) {
    showToast("Direct supports up to 4 prompts.", true);
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
      ...(referenceImages.length ? { referenceImageFileIds: referenceImages.map((reference) => reference.fileId) } : {}),
    });
    releaseReferencesToSession();
    renderTelemetry(next);
    await loadKeys();
    if (next.status === "failed") showToast(next.message, true);
    if (next.status === "pending" || next.status === "processing") {
      pollTimer = window.setInterval(async () => {
        if (!session) return;
        try {
          renderTelemetry(await app.rpc!.request.pollBatchStatus({ sessionId: session.sessionId }));
          await loadKeys();
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Could not refresh the run", true);
        }
      }, 10_000);
    }
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
    showToast("Run cancelled.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not cancel run", true);
  }
});

elements.retryButton.addEventListener("click", async () => {
  if (!session) return;
  elements.retryButton.disabled = true;
  try {
    const next = await app.rpc!.request.retryFailedPrompts({ sessionId: session.sessionId });
    renderTelemetry(next);
    showToast("Retry run submitted.");
    if (next.status === "processing") {
      pollTimer = window.setInterval(async () => {
        if (!session) return;
        try {
          renderTelemetry(await app.rpc!.request.pollBatchStatus({ sessionId: session.sessionId }));
        } catch (error) {
          showToast(error instanceof Error ? error.message : "Could not refresh the run", true);
        }
      }, 10_000);
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not retry prompts", true);
    elements.retryButton.disabled = false;
  }
});

elements.manageKeys.addEventListener("click", async () => {
  try {
    await loadKeys();
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
elements.exportButton.addEventListener("click", async () => {
  if (!session) return;
  elements.exportButton.disabled = true;
  try {
    const result = await app.rpc!.request.exportSessionZip({ sessionId: session.sessionId, pickPath: true });
    if (result.filePath) {
      elements.sessionMessage.textContent = `Exported to ${result.filePath}`;
      showToast("Session ZIP exported.");
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
