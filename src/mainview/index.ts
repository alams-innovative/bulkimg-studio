import Electrobun, { Electroview } from "electrobun/view";
import {
  Archive,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
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
  PromptMatrix,
  RunMode,
  SessionSummary,
  SessionTelemetry,
} from "../shared/contracts";

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
  pageEyebrow: byId("page-eyebrow"),
  pageTitle: byId("page-title"),
  headerStats: byId("header-stats"),
  generatorView: byId("generator-view"),
  sessionsView: byId("sessions-view"),
  historyView: byId("history-view"),
  exportsView: byId("exports-view"),
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
  referenceDock: byId("reference-dock"),
  referenceFile: byId<HTMLInputElement>("reference-file"),
  referenceTitle: byId("reference-title"),
  referenceHint: byId("reference-hint"),
  referenceBadge: byId("reference-badge"),
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
  toast: byId("toast"),
};

const dropzone = document.querySelector<HTMLElement>(".dropzone");
let matrix: PromptMatrix | null = null;
let selected = new Set<string>();
let session: SessionTelemetry | null = null;
let pollTimer: number | null = null;
let toastTimer: number | null = null;
let historyItems: HistoryItem[] = [];
let historyImageObserver: IntersectionObserver | null = null;
let referenceImageFileId: string | undefined;
let estimateTimer: number | null = null;

const slateStackIcons = {
  Archive,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
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
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UploadCloud,
  X,
};

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
}

async function setView(view: "generator" | "sessions" | "history" | "exports"): Promise<void> {
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    const active = button.dataset["view"] === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  elements.generatorView.classList.toggle("hidden", view !== "generator");
  elements.sessionsView.classList.toggle("hidden", view !== "sessions");
  elements.historyView.classList.toggle("hidden", view !== "history");
  elements.exportsView.classList.toggle("hidden", view !== "exports");
  elements.headerStats.classList.toggle("hidden", view !== "generator");
  const titles = {
    generator: ["IMAGE OPERATIONS", "Batch generation studio"],
    sessions: ["ACTIVITY", "Generation sessions"],
    history: ["LIBRARY", "Prompt and image history"],
    exports: ["DELIVERABLES", "Export library"],
  } as const;
  elements.pageEyebrow.textContent = titles[view][0];
  elements.pageTitle.textContent = titles[view][1];
  if (view === "sessions") await loadSessions();
  if (view === "history") await loadHistory();
  if (view === "exports") await loadExports();
}

function selectableCells(): PromptCell[] {
  return matrix?.cells.filter((cell) => !cell.disabled) ?? [];
}

function currentMode(): RunMode {
  return document.querySelector<HTMLInputElement>('input[name="run-mode"]:checked')?.value as RunMode ?? "batch";
}

function updateSelection(): void {
  const count = selected.size;
  elements.selectedCount.textContent = String(count);
  elements.runButton.disabled = count === 0;
  elements.runButton.querySelector("span")!.textContent = count ? `Generate ${count} selected` : "Generate selected";
  if (estimateTimer !== null) window.clearTimeout(estimateTimer);
  if (count === 0) {
    elements.estimatedCost.textContent = "$0.00";
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
    });
    elements.fxRate.textContent = `Rs. ${estimate.fxRate.toFixed(2)}`;
    elements.estimatedCost.textContent = `$${estimate.costUsd.toFixed(2)}`;
  } catch {
    elements.estimatedCost.textContent = "—";
  }
}

function applyMatrix(next: PromptMatrix): void {
  matrix = next;
  selected = new Set();
  elements.sourceName.textContent = next.sourceName;
  const enabled = next.cells.filter((cell) => !cell.disabled).length;
  const disabled = next.cells.length - enabled;
  elements.sourceSummary.textContent = `${enabled} prompts · ${disabled} schedule cells disabled · ${next.columns.length} columns`;
  elements.warnings.classList.toggle("hidden", next.warnings.length === 0);
  elements.warnings.textContent = next.warnings.join(" ");
  renderMatrix();
  updateSelection();
}

function renderMatrix(): void {
  if (!matrix || matrix.cells.length === 0) {
    elements.matrix.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="circle-alert"></i></span><strong>No prompts found</strong><small>Check the file structure or try the manual prompt pad.</small></div>';
    refreshIcons();
    return;
  }
  elements.matrix.innerHTML = matrix.cells.map((cell) => `
    <button type="button" class="prompt-card ${cell.disabled ? "disabled" : ""} ${selected.has(cell.id) ? "selected" : ""}" data-id="${cell.id}" aria-pressed="${selected.has(cell.id)}" ${cell.disabled ? `disabled title="${escapeHtml(cell.disabledReason ?? "This schedule cell cannot generate an image")}"` : ""}>
      <span class="prompt-meta"><span>${escapeHtml(cell.week || "—")}</span><span>${escapeHtml(cell.themeColumn)}</span></span>
      <p class="prompt-text">${escapeHtml(cell.promptText)}</p>
      <span class="check-dot" aria-hidden="true">${selected.has(cell.id) ? '<i data-lucide="check"></i>' : ""}</span>
    </button>
  `).join("");
  refreshIcons();
  elements.matrix.querySelectorAll<HTMLElement>(".prompt-card:not(.disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset["id"];
      if (!id) return;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      renderMatrix();
      updateSelection();
    });
  });
}

function renderTelemetry(next: SessionTelemetry): void {
  session = next;
  document.querySelector<HTMLElement>(".telemetry")?.setAttribute("data-status", next.status);
  elements.sessionStatus.textContent = next.status.toUpperCase();
  elements.sessionMessage.textContent = next.message;
  const seconds = Math.floor(next.elapsedMs / 1000);
  elements.elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  elements.progress.textContent = `${next.completedCount} / ${next.totalPrompts}`;
  elements.tokens.textContent = `${formatNumber(next.inputTokens)} in · ${formatNumber(next.outputTokens)} out`;
  elements.sessionCost.textContent = `$${next.costUsd.toFixed(3)} · Rs. ${next.costPkr.toFixed(2)}`;
  elements.fxRate.textContent = `Rs. ${next.fxRate.toFixed(2)}`;
  elements.exportButton.disabled = false;
  const active = next.status === "pending" || next.status === "processing";
  elements.cancelButton.disabled = !active;
  elements.retryButton.disabled = next.status !== "failed" && next.status !== "completed";
  if (pollTimer !== null && ["completed", "failed"].includes(next.status)) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function attachReferenceFile(file: File): Promise<void> {
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
  if (!supportedTypes.has(mimeType)) {
    showToast("Choose a PNG, JPEG, or WebP image.", true);
    return;
  }
  if (file.size === 0) {
    showToast("That reference image is empty.", true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("Reference images must be 20 MB or smaller.", true);
    return;
  }
  elements.referenceBadge.textContent = "Uploading";
  elements.referenceDock.setAttribute("aria-busy", "true");
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buffer.length; i += chunk) {
      binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
    }
    const dataBase64 = btoa(binary);
    const result = await app.rpc!.request.uploadReferenceImage({
      dataBase64,
      filename: file.name,
      mimeType,
    });
    referenceImageFileId = result.fileId;
    elements.referenceDock.classList.add("has-image");
    elements.referenceTitle.textContent = file.name;
    elements.referenceHint.textContent = `Cached file_id ${result.fileId.slice(0, 12)}… · click to replace`;
    elements.referenceBadge.textContent = "Attached";
    showToast("Reference image uploaded once for this session.");
  } catch (error) {
    elements.referenceBadge.textContent = "Optional";
    showToast(error instanceof Error ? error.message : "Could not upload reference image", true);
  } finally {
    elements.referenceDock.removeAttribute("aria-busy");
    elements.referenceFile.value = "";
  }
}

function keyStatus(key: ApiKeyStats): { label: string; className: string } {
  if (key.currentSessionId) return { label: "In use", className: "current" };
  if (key.isRateLimited) return { label: "Rate limited", className: "limited" };
  if (!key.isActive) return { label: "Paused", className: "paused" };
  return { label: "Active", className: "" };
}

function keyApiLabel(key: ApiKeyStats): string {
  if (key.currentRunMode === "batch") return "OpenAI Batch API → /v1/images/generations";
  if (key.currentRunMode === "direct") return "OpenAI Images API → /v1/images/generations";
  return "OpenAI Images API";
}

async function loadKeys(): Promise<void> {
  const keys = await app.rpc!.request.listApiKeys({});
  const active = keys.filter((key) => key.isActive).length;
  const requests = keys.reduce((sum, key) => sum + key.totalRequests, 0);
  const tokens = keys.reduce((sum, key) => sum + key.inputTokens + key.outputTokens, 0);
  const spend = keys.reduce((sum, key) => sum + key.costUsd, 0);
  elements.keyCount.textContent = String(active);
  elements.activeKeyTotal.textContent = String(active);
  elements.keyRequestTotal.textContent = formatNumber(requests);
  elements.keyTokenTotal.textContent = formatNumber(tokens);
  elements.keySpendTotal.textContent = `$${spend.toFixed(3)}`;
  elements.keyList.innerHTML = keys.length ? keys.map((key) => {
    const status = keyStatus(key);
    const currentDetail = key.currentSessionId
      ? `<div><span>Current model</span><strong>${escapeHtml(key.currentModel ?? "Unknown")}</strong></div><div><span>Current progress</span><strong>${key.currentCompleted} / ${key.currentPrompts} prompts</strong></div>`
      : `<div><span>API route</span><strong>${escapeHtml(keyApiLabel(key))}</strong></div><div><span>Current activity</span><strong>Idle</strong></div>`;
    return `
      <article class="key-item ${key.currentSessionId ? "current" : ""}" data-key-id="${key.id}">
        <div class="key-item-head">
          <div class="key-identity"><div class="provider-mark"><i data-lucide="key-round" aria-hidden="true"></i></div><div><strong>${escapeHtml(key.label)}</strong><small>${escapeHtml(key.keyHint)} · ${key.provider}</small></div></div>
          <span class="status-badge ${status.className}">${status.label}</span>
        </div>
        <div class="key-current-api"><div><span>API currently involved</span><strong>${escapeHtml(keyApiLabel(key))}</strong></div>${currentDetail}</div>
        <div class="key-metrics">
          <div><span>App requests</span><strong>${formatNumber(key.totalRequests)}</strong></div>
          <div><span>Input tokens</span><strong>${formatNumber(key.inputTokens)}</strong></div>
          <div><span>Output tokens</span><strong>${formatNumber(key.outputTokens)}</strong></div>
          <div><span>Tracked cost</span><strong>$${key.costUsd.toFixed(3)} · Rs. ${key.costPkr.toFixed(2)}</strong></div>
        </div>
        <div class="key-footer"><span>Added ${formatDate(key.createdAt)} · Last used ${formatDate(key.lastUsedAt)}${key.isRateLimited ? ` · Retry after ${formatDate(key.rateLimitedUntil)}` : ""}</span><div class="key-actions"><button class="text-button toggle-key" data-key-id="${key.id}" data-active="${key.isActive}">${key.isActive ? "Pause" : "Resume"}</button><button class="text-button danger delete-key" data-key-id="${key.id}">Remove</button></div></div>
      </article>`;
  }).join("") : '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="key-round"></i></span><strong>No keys stored</strong><small>Add an encrypted OpenAI key to enable generation.</small></div>';
  refreshIcons();

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
  elements.sessionList.setAttribute("aria-busy", "true");
  elements.sessionList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="loader-circle"></i></span><strong>Loading sessions…</strong><small>Reading local run history.</small></div>';
  refreshIcons();
  try {
    const sessions: SessionSummary[] = await app.rpc!.request.listSessions({});
    elements.sessionList.innerHTML = sessions.length ? sessions.map((item) => `
      <article class="data-row">
        <div><strong>${escapeHtml(item.model)}</strong><span>${escapeHtml(item.sessionId.slice(0, 8))} · ${formatDate(item.startTime)}</span></div>
        <div><span>Status</span><strong class="status-badge ${item.status === "processing" ? "current" : item.status === "failed" ? "limited" : ""}">${escapeHtml(item.status)}</strong></div>
        <div><span>Mode</span><strong>${escapeHtml(item.runMode)}</strong></div>
        <div><span>Progress</span><strong>${item.completedCount} / ${item.totalPrompts}</strong></div>
        <div><span>API key / cost</span><strong>${escapeHtml(item.keyLabel ?? "Unassigned")} · $${item.costUsd.toFixed(3)}</strong></div>
      </article>`).join("") : '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="clock-3"></i></span><strong>No sessions yet</strong><small>Completed and active runs will appear here.</small></div>';
  } catch (error) {
    elements.sessionList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load sessions")}</div>`;
  } finally {
    elements.sessionList.removeAttribute("aria-busy");
    refreshIcons();
  }
}

async function loadExports(): Promise<void> {
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
  } catch (error) {
    elements.exportList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load exports")}</div>`;
  } finally {
    elements.exportList.removeAttribute("aria-busy");
    refreshIcons();
  }
}

function renderHistory(): void {
  historyImageObserver?.disconnect();
  const query = elements.historySearch.value.trim().toLowerCase();
  const visible = query ? historyItems.filter((item) => [
    item.promptText, item.model, item.themeColumn, item.week, item.scheduleDate, item.status,
  ].some((value) => value.toLowerCase().includes(query))) : historyItems;
  elements.clearHistory.disabled = historyItems.length === 0;
  elements.historyCount.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  elements.historyList.innerHTML = visible.length ? visible.map((item) => `
    <article class="history-card" data-prompt-id="${item.promptId}">
      <div class="history-image">
        ${item.assetId ? `<img alt="Generated output for: ${escapeHtml(item.promptText)}" data-asset-id="${item.assetId}" />` : ""}
        <div class="image-placeholder"><i data-lucide="${item.hasImage ? "loader-circle" : "image-off"}" aria-hidden="true"></i><strong>${item.hasImage ? "Loading preview" : "No image saved"}</strong><small>${item.hasImage ? "Stored locally" : "Prompt retained from this session"}</small></div>
      </div>
      <div class="history-card-body">
        <div class="history-card-meta"><span>${formatDate(item.createdAt)}</span><span class="status-badge ${item.status === "processing" ? "current" : item.status === "failed" ? "limited" : ""}">${escapeHtml(item.status)}</span></div>
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

  historyImageObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const image = entry.target as HTMLImageElement;
      const assetId = image.dataset["assetId"];
      observer.unobserve(image);
      if (!assetId) continue;
      void app.rpc!.request.getHistoryImage({ assetId }).then(({ dataUrl }) => {
        image.addEventListener("load", () => image.classList.add("loaded"), { once: true });
        image.src = dataUrl;
      }).catch((error: unknown) => {
        const placeholder = image.nextElementSibling as HTMLElement | null;
        if (placeholder) {
          placeholder.classList.add("history-load-error");
          placeholder.innerHTML = `<i data-lucide="circle-alert" aria-hidden="true"></i><strong>Preview unavailable</strong><small>${escapeHtml(error instanceof Error ? error.message : "Stored file is missing")}</small>`;
          refreshIcons();
        }
      });
    }
  }, { rootMargin: "160px" });
  elements.historyList.querySelectorAll<HTMLImageElement>("img[data-asset-id]").forEach((image) => historyImageObserver?.observe(image));

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
  elements.historyList.setAttribute("aria-busy", "true");
  elements.historyList.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true"><i data-lucide="loader-circle"></i></span><strong>Loading history…</strong><small>Reading locally stored prompts and images.</small></div>';
  refreshIcons();
  try {
    historyItems = await app.rpc!.request.listHistory({});
    renderHistory();
  } catch (error) {
    elements.historyList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load history")}</div>`;
  } finally {
    elements.historyList.removeAttribute("aria-busy");
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
  try {
    applyMatrix(await app.rpc!.request.importCSV({ csvText: await file.text(), sourceName: file.name }));
    showToast(`Loaded ${file.name}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not import CSV", true);
  }
}

async function bootstrap(): Promise<void> {
  const data: AppBootstrap = await app.rpc!.request.getBootstrap({});
  document.title = `${data.brand.appName} ${data.brand.version}`;
  elements.brandName.textContent = data.brand.appName;
  elements.brandVersion.textContent = data.brand.version;
  elements.platform.textContent = data.platform;
  elements.keyCount.textContent = String(data.keyCount);
  elements.fxRate.textContent = `Rs. ${data.fxRate.toFixed(2)}`;
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
  button.addEventListener("click", () => void setView(button.dataset["view"] as "generator" | "sessions" | "history" | "exports"));
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
  try {
    const picked = await app.rpc!.request.pickCsvFile({});
    if (!picked) return;
    applyMatrix(await app.rpc!.request.importCSV(picked));
    showToast(`Loaded ${picked.sourceName}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not open CSV", true);
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
  try {
    applyMatrix(await app.rpc!.request.parseManualPrompts({ text: elements.manualPrompts.value }));
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not parse prompts", true);
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
    renderMatrix();
    updateSelection();
  });
});
document.querySelectorAll<HTMLInputElement>('input[name="run-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".mode-option").forEach((label) => label.classList.remove("selected"));
    radio.closest(".mode-option")?.classList.add("selected");
    void refreshEstimate();
  });
});
elements.model.addEventListener("change", () => void refreshEstimate());
elements.quality.addEventListener("change", () => void refreshEstimate());

elements.referenceDock.addEventListener("click", () => elements.referenceFile.click());
elements.referenceDock.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.referenceFile.click();
  }
});
elements.referenceFile.addEventListener("change", () => {
  const file = elements.referenceFile.files?.[0];
  if (file) void attachReferenceFile(file);
});
["dragenter", "dragover"].forEach((eventName) => elements.referenceDock.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.referenceDock.classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => elements.referenceDock.addEventListener(eventName, (event) => {
  event.preventDefault();
  elements.referenceDock.classList.remove("dragging");
}));
elements.referenceDock.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void attachReferenceFile(file);
});
window.addEventListener("paste", (event) => {
  const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (file) {
    event.preventDefault();
    void attachReferenceFile(file);
  }
});

elements.runButton.addEventListener("click", async () => {
  if (!matrix) return;
  elements.runButton.disabled = true;
  elements.runButton.setAttribute("aria-busy", "true");
  try {
    const prompts = matrix.cells.filter((cell) => selected.has(cell.id)).map(({ promptText, week, scheduleDate, themeColumn }) => ({ promptText, week, scheduleDate, themeColumn }));
    const next = await app.rpc!.request.submitBatchRun({
      prompts,
      model: elements.model.value,
      mode: currentMode(),
      size: elements.size.value,
      quality: elements.quality.value as "low" | "medium" | "high",
      referenceImageFileId,
    });
    renderTelemetry(next);
    await loadKeys();
    if (next.status === "failed") showToast(next.message, true);
    if (next.status === "processing") {
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
    elements.runButton.disabled = selected.size === 0;
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
    if (!elements.keysDialog.open) {
      elements.keysDialog.showModal();
      byId<HTMLElement>("keys-title").focus();
    }
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
    elements.sessionMessage.textContent = `Exported to ${result.filePath}`;
    showToast("Session ZIP exported.");
    await loadExports();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not export session", true);
  } finally {
    elements.exportButton.disabled = false;
  }
});
elements.refreshSessions.addEventListener("click", () => void loadSessions());
elements.refreshHistory.addEventListener("click", () => void loadHistory());
elements.historySearch.addEventListener("input", renderHistory);
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

await bootstrap();
