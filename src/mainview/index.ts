import Electrobun, { Electroview } from "electrobun/view";
import type { AppBootstrap, AppRPC, PromptCell, PromptMatrix, RunMode, SessionTelemetry } from "../shared/contracts";

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
  brandLogo: byId<HTMLImageElement>("brand-logo"),
  brandName: byId("brand-name"),
  brandVersion: byId("brand-version"),
  platform: byId("platform"),
  keyCount: byId("key-count"),
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
  keyList: byId("key-list"),
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
};

let matrix: PromptMatrix | null = null;
let selected = new Set<string>();
let session: SessionTelemetry | null = null;
let pollTimer: number | null = null;

function escapeHtml(value: string): string {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
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
  elements.tokens.textContent = `${next.inputTokens} in · ${next.outputTokens} out`;
  elements.sessionCost.textContent = `$${next.costUsd.toFixed(3)} · Rs. ${next.costPkr.toFixed(2)}`;
  elements.fxRate.textContent = `Rs. ${next.fxRate.toFixed(2)}`;
  elements.exportButton.disabled = false;
  if (pollTimer !== null && ["completed", "failed"].includes(next.status)) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function loadKeys(): Promise<void> {
  const keys = await app.rpc!.request.listApiKeys({});
  elements.keyCount.textContent = String(keys.filter((key) => key.isActive).length);
  elements.keyList.innerHTML = keys.length
    ? keys.map((key) => `<div class="key-item"><strong>${escapeHtml(key.label)}</strong><span>${key.isActive ? "Active" : "Paused"}</span></div>`).join("")
    : '<div class="empty-state"><strong>No keys stored</strong><small>Add one to enable generation.</small></div>';
}

async function bootstrap(): Promise<void> {
  const data: AppBootstrap = await app.rpc!.request.getBootstrap({});
  document.documentElement.style.setProperty("--brand-primary", data.brand.accentColor);
  document.documentElement.style.setProperty("--brand-secondary", data.brand.accentSecondary);
  document.title = `${data.brand.appName} ${data.brand.version}`;
  elements.brandName.textContent = data.brand.appName;
  elements.brandVersion.textContent = data.brand.version;
  elements.brandLogo.src = data.brand.logoPath;
  elements.platform.textContent = data.platform;
  elements.keyCount.textContent = String(data.keyCount);
  elements.model.innerHTML = data.models.models.map((model) =>
    `<option value="${escapeHtml(model.id)}" ${model.enabled ? "" : "disabled"}>${escapeHtml(model.label)}</option>`,
  ).join("");
  elements.model.value = data.models.defaultModel;
}

elements.csvTab.addEventListener("click", () => setTab("csv"));
elements.manualTab.addEventListener("click", () => setTab("manual"));
elements.csvFile.addEventListener("change", async () => {
  const file = elements.csvFile.files?.[0];
  if (!file) return;
  applyMatrix(await app.rpc!.request.importCSV({ csvText: await file.text(), sourceName: file.name }));
});
elements.parseManual.addEventListener("click", async () => {
  applyMatrix(await app.rpc!.request.parseManualPrompts({ text: elements.manualPrompts.value }));
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
  elements.runButton.disabled = selected.size === 0;
  if (next.status === "processing") {
    pollTimer = window.setInterval(async () => {
      if (session) renderTelemetry(await app.rpc!.request.pollBatchStatus({ sessionId: session.sessionId }));
    }, 10_000);
  }
});

elements.manageKeys.addEventListener("click", async () => {
  await loadKeys();
  elements.keysDialog.showModal();
});
elements.keyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.keyError.classList.add("hidden");
  try {
    await app.rpc!.request.addApiKey({ label: elements.keyLabel.value, key: elements.apiKey.value });
    elements.apiKey.value = "";
    elements.keyLabel.value = "";
    await loadKeys();
  } catch (error) {
    elements.keyError.textContent = error instanceof Error ? error.message : "Could not save key";
    elements.keyError.classList.remove("hidden");
  }
});
elements.exportButton.addEventListener("click", async () => {
  if (!session) return;
  const result = await app.rpc!.request.exportSessionZip({ sessionId: session.sessionId });
  elements.sessionMessage.textContent = `Exported to ${result.filePath}`;
});

await bootstrap();
