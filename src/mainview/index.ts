import Electrobun, { Electroview } from "electrobun/view";
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
  handlers: { requests: {}, messages: {} },
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
  manualPrompts: byId<HTMLTextAreaElement>("manual-prompts"),
  parseManual: byId<HTMLButtonElement>("parse-manual"),
  sourceName: byId("source-name"),
  sourceSummary: byId("source-summary"),
  warnings: byId("warnings"),
  matrix: byId("prompt-matrix"),
  model: byId<HTMLSelectElement>("model"),
  size: byId<HTMLSelectElement>("size"),
  quality: byId<HTMLSelectElement>("quality"),
  runButton: byId<HTMLButtonElement>("run-button"),
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
  elements.csvPanel.classList.toggle("hidden", !csv);
  elements.manualPanel.classList.toggle("hidden", csv);
}

async function setView(view: "generator" | "sessions" | "history" | "exports"): Promise<void> {
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset["view"] === view);
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

function updateSelection(): void {
  const count = selected.size;
  elements.selectedCount.textContent = String(count);
  elements.estimatedCost.textContent = count ? "API priced" : "$0.00";
  elements.runButton.disabled = count === 0;
  elements.runButton.querySelector("span")!.textContent = count ? `Generate ${count} selected` : "Generate selected";
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
    elements.matrix.innerHTML = '<div class="empty-state"><span>✦</span><strong>No prompts found</strong><small>Try another source format.</small></div>';
    return;
  }
  elements.matrix.innerHTML = matrix.cells.map((cell) => `
    <article class="prompt-card ${cell.disabled ? "disabled" : ""} ${selected.has(cell.id) ? "selected" : ""}" data-id="${cell.id}" aria-disabled="${cell.disabled}">
      <div class="prompt-meta"><span>${escapeHtml(cell.week || "—")}</span><span>${escapeHtml(cell.themeColumn)}</span></div>
      <p class="prompt-text">${escapeHtml(cell.promptText)}</p>
      <span class="check-dot">${selected.has(cell.id) ? "✓" : ""}</span>
    </article>
  `).join("");
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
  elements.sessionStatus.textContent = next.status.toUpperCase();
  elements.sessionMessage.textContent = next.message;
  const seconds = Math.floor(next.elapsedMs / 1000);
  elements.elapsed.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  elements.progress.textContent = `${next.completedCount} / ${next.totalPrompts}`;
  elements.tokens.textContent = `${formatNumber(next.inputTokens)} in · ${formatNumber(next.outputTokens)} out`;
  elements.sessionCost.textContent = `$${next.costUsd.toFixed(3)} · Rs. ${next.costPkr.toFixed(2)}`;
  elements.fxRate.textContent = `Rs. ${next.fxRate.toFixed(2)}`;
  elements.exportButton.disabled = false;
  if (pollTimer !== null && ["completed", "failed"].includes(next.status)) {
    window.clearInterval(pollTimer);
    pollTimer = null;
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
          <div class="key-identity"><div class="provider-mark">AI</div><div><strong>${escapeHtml(key.label)}</strong><small>${escapeHtml(key.keyHint)} · ${key.provider}</small></div></div>
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
  }).join("") : '<div class="empty-state"><strong>No keys stored</strong><small>Add one to enable generation.</small></div>';

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
  elements.sessionList.innerHTML = '<div class="empty-state"><strong>Loading sessions…</strong></div>';
  try {
    const sessions: SessionSummary[] = await app.rpc!.request.listSessions({});
    elements.sessionList.innerHTML = sessions.length ? sessions.map((item) => `
      <article class="data-row">
        <div><strong>${escapeHtml(item.model)}</strong><span>${escapeHtml(item.sessionId.slice(0, 8))} · ${formatDate(item.startTime)}</span></div>
        <div><span>Status</span><strong class="status-badge ${item.status === "processing" ? "current" : item.status === "failed" ? "limited" : ""}">${escapeHtml(item.status)}</strong></div>
        <div><span>Mode</span><strong>${escapeHtml(item.runMode)}</strong></div>
        <div><span>Progress</span><strong>${item.completedCount} / ${item.totalPrompts}</strong></div>
        <div><span>API key / cost</span><strong>${escapeHtml(item.keyLabel ?? "Unassigned")} · $${item.costUsd.toFixed(3)}</strong></div>
      </article>`).join("") : '<div class="empty-state"><strong>No sessions yet</strong><small>Completed and active runs will appear here.</small></div>';
  } catch (error) {
    elements.sessionList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load sessions")}</div>`;
  }
}

async function loadExports(): Promise<void> {
  elements.exportList.innerHTML = '<div class="empty-state"><strong>Loading exports…</strong></div>';
  try {
    const exports: ExportSummary[] = await app.rpc!.request.listExports({});
    elements.exportList.innerHTML = exports.length ? exports.map((item) => `
      <article class="data-row">
        <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.filePath)}</span></div>
        <div><span>Type</span><strong>ZIP archive</strong></div>
        <div><span>Size</span><strong>${formatBytes(item.sizeBytes)}</strong></div>
        <div><span>Modified</span><strong>${formatDate(item.modifiedAt)}</strong></div>
        <div><span>Location</span><strong>App exports folder</strong></div>
      </article>`).join("") : '<div class="empty-state"><strong>No exports yet</strong><small>Exported session ZIPs will appear here.</small></div>';
  } catch (error) {
    elements.exportList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load exports")}</div>`;
  }
}

function renderHistory(): void {
  historyImageObserver?.disconnect();
  const query = elements.historySearch.value.trim().toLowerCase();
  const visible = query ? historyItems.filter((item) => [
    item.promptText, item.model, item.themeColumn, item.week, item.scheduleDate, item.status,
  ].some((value) => value.toLowerCase().includes(query))) : historyItems;
  elements.historyCount.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  elements.historyList.innerHTML = visible.length ? visible.map((item) => `
    <article class="history-card" data-prompt-id="${item.promptId}">
      <div class="history-image">
        ${item.assetId ? `<img alt="Generated output for: ${escapeHtml(item.promptText)}" data-asset-id="${item.assetId}" />` : ""}
        <div class="image-placeholder"><b>${item.hasImage ? "◌" : "◇"}</b><strong>${item.hasImage ? "Loading preview" : "No image saved"}</strong><small>${item.hasImage ? "Stored locally" : "Prompt retained from this session"}</small></div>
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
    </article>`).join("") : `<div class="empty-state"><strong>${query ? "No matching history" : "History is empty"}</strong><small>${query ? "Try a broader search." : "Submitted prompts and generated images will appear here."}</small></div>`;

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
          placeholder.innerHTML = `<b>!</b><strong>Preview unavailable</strong><small>${escapeHtml(error instanceof Error ? error.message : "Stored file is missing")}</small>`;
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
  elements.historyList.innerHTML = '<div class="empty-state"><strong>Loading history…</strong></div>';
  try {
    historyItems = await app.rpc!.request.listHistory({});
    renderHistory();
  } catch (error) {
    elements.historyList.innerHTML = `<div class="warnings">${escapeHtml(error instanceof Error ? error.message : "Could not load history")}</div>`;
  }
}

async function importCsvFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    showToast("Choose a CSV file.", true);
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
  document.documentElement.style.setProperty("--brand-primary", data.brand.accentColor);
  document.documentElement.style.setProperty("--brand-secondary", data.brand.accentSecondary);
  document.title = `${data.brand.appName} ${data.brand.version}`;
  elements.brandName.textContent = data.brand.appName;
  elements.brandVersion.textContent = data.brand.version;
  elements.platform.textContent = data.platform;
  elements.keyCount.textContent = String(data.keyCount);
  elements.model.innerHTML = data.models.models.map((model) =>
    `<option value="${escapeHtml(model.id)}" ${model.enabled ? "" : "disabled"}>${escapeHtml(model.label)}</option>`,
  ).join("");
  elements.model.value = data.models.defaultModel;
}

document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => void setView(button.dataset["view"] as "generator" | "sessions" | "history" | "exports"));
});
elements.csvTab.addEventListener("click", () => setTab("csv"));
elements.manualTab.addEventListener("click", () => setTab("manual"));
elements.csvFile.addEventListener("change", () => {
  const file = elements.csvFile.files?.[0];
  if (file) void importCsvFile(file);
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
  });
});

elements.runButton.addEventListener("click", async () => {
  if (!matrix) return;
  elements.runButton.disabled = true;
  try {
    const prompts = matrix.cells.filter((cell) => selected.has(cell.id)).map(({ promptText, week, scheduleDate, themeColumn }) => ({ promptText, week, scheduleDate, themeColumn }));
    const mode = document.querySelector<HTMLInputElement>('input[name="run-mode"]:checked')?.value as RunMode ?? "batch";
    const next = await app.rpc!.request.submitBatchRun({
      prompts,
      model: elements.model.value,
      mode,
      size: elements.size.value,
      quality: elements.quality.value as "low" | "medium" | "high",
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
    elements.runButton.disabled = selected.size === 0;
  }
});

elements.manageKeys.addEventListener("click", async () => {
  try {
    await loadKeys();
    if (!elements.keysDialog.open) elements.keysDialog.showModal();
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
    const result = await app.rpc!.request.exportSessionZip({ sessionId: session.sessionId });
    elements.sessionMessage.textContent = `Exported to ${result.filePath}`;
    showToast("Session ZIP exported.");
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
