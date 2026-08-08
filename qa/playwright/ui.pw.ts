import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Generate images." })).toBeVisible();
});

test("generator remains accessible and keyboard operable", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("usage page shows app-scoped totals, limits, modes, and pricing", async ({ page }) => {
  await page.getByRole("button", { name: "Usage" }).click();
  await expect(page.locator("#usage-view").getByRole("heading", { name: "Usage & limits" })).toBeVisible();
  await expect(page.getByText("This app only — local requests, tokens, and calculated cost.")).toBeVisible();
  await expect(page.locator("#usage-summary-grid .usage-kpi")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Direct vs Batch" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pricing reference" })).toBeVisible();
  await expect(page.getByText("Add an Admin key in API keys to load project limits. Generation keys still track this app’s usage.")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("renders at most 100 rows and selects across 1,000 prompts", async ({ page }) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill(Array.from({ length: 1_000 }, (_, index) => `Prompt ${index + 1}`).join("\n"));
  await page.getByRole("button", { name: "Add prompts" }).click();
  await expect(page.locator(".prompt-card")).toHaveCount(100);
  const duration = await page.evaluate(() => {
    const started = performance.now();
    (document.querySelector('[data-pick="all"]') as HTMLButtonElement).click();
    return performance.now() - started;
  });
  expect(duration).toBeLessThan(100);
  await expect(page.locator("#selected-count")).toHaveText("1000");
  await expect(page.locator(".prompt-card").last()).toHaveAttribute("aria-pressed", "true");
});

test("reveals editable batch waves only after prompts are selected", async ({ page }) => {
  await expect(page.locator("#wave-controls")).toBeHidden();
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill(Array.from({ length: 230 }, (_, index) => `Prompt ${index + 1}`).join("\n"));
  await page.getByRole("button", { name: "Add prompts" }).click();
  await page.locator('button[data-pick="all"]').click();
  await expect(page.locator("#wave-controls")).toBeVisible();
  await expect.poll(() => page.locator("#wave-list input").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(["10", "100", "100", "20"]);
  await page.getByRole("button", { name: "Add wave" }).click();
  await expect(page.locator("#wave-list input")).toHaveCount(5);
});

test("restores an active session into the Generator status area", async ({ page }) => {
  await page.goto("/?restore-active");
  await expect(page.locator(".telemetry")).toBeVisible();
  await expect(page.locator("#progress")).toHaveText("42 / 100");
  await expect(page.locator("#session-message")).toContainText("Restored active batch.");
});

test("shows queued guided waves in the live bar and runs the ready wave", async ({ page }) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill("Prompt one\nPrompt two\nPrompt three");
  await page.getByRole("button", { name: "Add prompts" }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Generate 3", exact: true }).click();

  const queue = page.locator("#wave-queue");
  await expect(queue).toBeVisible();
  await expect(queue).toContainText("Batch 2 is ready to run");
  await expect(queue.locator(".wave-queue-item")).toHaveCount(2);
  await expect(queue.locator(".wave-queue-item.awaiting-run")).toHaveCount(1);
  await queue.getByRole("button", { name: "Run batch 2" }).click();
  await expect(queue.locator(".wave-run")).toHaveCount(0);
  await expect(queue.locator(".wave-queue-item").nth(1)).toHaveClass(/status-processing/);
});

test("cancels unstarted guided waves from the live bar and keeps completed output", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill("Prompt one\nPrompt two\nPrompt three");
  await page.getByRole("button", { name: "Add prompts" }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Generate 3", exact: true }).click();

  const queue = page.locator("#wave-queue");
  await expect(queue.getByRole("button", { name: "Cancel remaining" })).toBeVisible();
  await queue.getByRole("button", { name: "Cancel remaining" }).click();
  await expect(queue).toBeHidden();
  await expect(page.locator("#session-status")).toHaveText("CANCELLED");
  await expect(page.locator("#session-message")).toContainText("Stopped after saving 2 of 3 images.");
});

test("row selection preserves the imported-list viewport", async ({ page }) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill(Array.from({ length: 160 }, (_, index) => `Prompt ${index + 1}`).join("\n"));
  await page.getByRole("button", { name: "Add prompts" }).click();
  await expect(page.locator(".prompt-card")).toHaveCount(100);
  const result = await page.evaluate(() => {
    const matrix = document.querySelector<HTMLElement>("#prompt-matrix")!;
    matrix.scrollTop = 360;
    const before = matrix.scrollTop;
    const observer = new MutationObserver(() => undefined);
    observer.observe(matrix, { childList: true });
    matrix.querySelectorAll<HTMLButtonElement>(".prompt-card")[15]!.click();
    const directChildMutations = observer.takeRecords().length;
    observer.disconnect();
    return { before, after: matrix.scrollTop, directChildMutations };
  });
  expect(result.after).toBe(result.before);
  expect(result.directChildMutations).toBe(0);
  await expect(page.locator("#selected-count")).toHaveText("1");
  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.locator("#prompt-matrix")).toHaveClass(/view-cards/);
});

test("weekly CSV rows can be selected as groups or as individual prompts", async ({ page }) => {
  const csv = [
    "Week #,Week Start Date,Wednesday | Technology,Thursday | Teams",
    'Week 1,05 Aug 2026,"05 AUG 2026 — First prompt","06 AUG 2026 — Second prompt"',
    'Week 2,12 Aug 2026,"12 AUG 2026 — Third prompt","NO IMAGE — Outside the approved planning period"',
  ].join("\n");
  await page.locator("#csv-file").setInputFiles({
    name: "weekly-calendar.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  await expect(page.locator(".prompt-group-header")).toHaveCount(2);
  await expect(page.locator("#source-summary")).toHaveText("3 prompts · 2 weeks · 1 unavailable");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const firstWeek = page.locator('.prompt-group[data-group-id="week-1"]');
  const firstWeekSelect = firstWeek.locator(".week-select");
  await expect(firstWeekSelect).toContainText("Select week");
  await expect(firstWeekSelect).toContainText("0/2");

  await firstWeekSelect.click();
  await expect(page.locator("#selected-count")).toHaveText("2");
  await expect(firstWeekSelect).toHaveAttribute("aria-pressed", "true");
  await expect(firstWeek.locator(".prompt-card")).toHaveCount(2);
  expect(await firstWeek.locator(".prompt-card").evaluateAll((cards) => cards.every((card) => card.getAttribute("aria-pressed") === "true"))).toBe(true);

  await firstWeek.locator(".prompt-card").first().click();
  await expect(page.locator("#selected-count")).toHaveText("1");
  await expect(firstWeekSelect).toHaveAttribute("aria-pressed", "mixed");
  await expect(firstWeekSelect).toContainText("Select week");

  await firstWeekSelect.click();
  await expect(page.locator("#selected-count")).toHaveText("2");
  await firstWeekSelect.click();
  await expect(page.locator("#selected-count")).toHaveText("0");
});

test("preview supports pointer-centred zoom and full one-click prompt copy", async ({ page }) => {
  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "Preview image" }).first().click();
  await expect(page.locator("#lightbox")).toBeVisible();
  await expect(page.locator(".lightbox-prompt-text")).toContainText("A geometric blue bird on a muted slate studio backdrop");
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();

  const viewport = page.locator("#lightbox-viewport");
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.35);
  await page.mouse.wheel(0, -180);
  await expect(page.locator("#lightbox-zoom")).not.toHaveText("100%");
  await expect(page.locator("#lightbox-image")).toHaveCSS("transform", /matrix/);
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.locator("#lightbox-zoom")).toHaveText("100%");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.locator("#toast-message")).toHaveText("Prompt copied.");
});

test("deselects, deletes selected rows, deletes one row, and clears the imported matrix", async ({ page }) => {
  await page.getByRole("tab", { name: "Manual" }).click();
  await page.getByLabel("Manual prompts").fill("Prompt one\nPrompt two\nPrompt three");
  await page.getByRole("button", { name: "Add prompts" }).click();

  await expect(page.locator(".prompt-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.locator("#selected-count")).toHaveText("3");

  await page.getByRole("button", { name: "Deselect all", exact: true }).click();
  await expect(page.locator("#selected-count")).toHaveText("0");
  await expect(page.locator(".prompt-card")).toHaveCount(3);

  await page.locator(".prompt-card").first().click();
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.locator(".prompt-card")).toHaveCount(2);
  await expect(page.locator("#source-summary")).toHaveText("2 prompts");

  await page.locator(".prompt-delete").first().click();
  await expect(page.locator(".prompt-card")).toHaveCount(1);
  await expect(page.locator("#source-summary")).toHaveText("1 prompt");

  await page.getByRole("button", { name: "Clear imported" }).click();
  await expect(page.getByText("No prompts loaded")).toBeVisible();
  await expect(page.locator("#source-name")).toHaveText("No prompts yet");
  await expect(page.getByRole("button", { name: "Clear imported" })).toBeDisabled();
});

test("keeps image paste explicit to the reference section", async ({ page }) => {
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator("#reference-file").setInputFiles([
    { name: "brand portrait.png", mimeType: "image/png", buffer: pixel },
    { name: "product.png", mimeType: "image/png", buffer: pixel },
  ]);
  await expect(page.locator(".reference-item")).toHaveCount(2);
  await expect(page.locator("#reference-badge")).toHaveText("2/16");

  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "should-not-auto-attach.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  }, pixel.toString("base64"));
  await expect(page.locator(".reference-item")).toHaveCount(2);

  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator(".reference-item")).toHaveCount(4);
  await expect(page.locator("#reference-badge")).toHaveText("4/16");
  await expect(page.locator("#reference-dock")).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Remove brand portrait.png" }).click();
  await expect(page.locator(".reference-item")).toHaveCount(3);
  await expect(page.locator("#reference-badge")).toHaveText("3/16");
  await expect(page.locator("#reference-dock")).toBeEnabled();
});

test("Converter keeps quick conversion simple and exposes per-image rules", async ({ page }) => {
  await page.getByRole("button", { name: "Converter" }).click();
  await expect(page.getByRole("heading", { name: "Convert images." })).toBeVisible();
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator("#converter-file").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: pixel },
    { name: "second.png", mimeType: "image/png", buffer: pixel },
    { name: "third.png", mimeType: "image/png", buffer: pixel },
  ]);
  await expect(page.locator(".converter-queue-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Output rules Optional" }).click();
  await page.locator("#converter-rule-type").selectOption("nth");
  await page.locator("#converter-rule-value").fill("3");
  await page.locator("#converter-rule-format").selectOption("avif");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Every 3rd image → AVIF")).toBeVisible();
  await expect(page.locator(".converter-queue-item").nth(2).locator("b")).toHaveText("AVIF");
  await expect(page.getByRole("button", { name: "Convert", exact: true })).toBeEnabled();
  await expect(page.locator("#converter-view")).toHaveScreenshot("converter-with-queue.png", { animations: "disabled" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 840 }, { width: 900, height: 640 }]) {
  test(`layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await expect(page.locator("body")).toHaveScreenshot(`generator-${viewport.width}x${viewport.height}.png`, { animations: "disabled", maxDiffPixels: 10 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("body *")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, id: element.id, className: element.className, left: rect.left, right: rect.right };
      }).filter((item) => item.left < -0.5 || item.right > document.documentElement.clientWidth + 0.5).slice(0, 10),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBe(layout.clientWidth);
    const rail = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>(".run-panel")?.getBoundingClientRect();
      const footer = document.querySelector<HTMLElement>(".run-panel-footer")?.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>(".workspace-grid")?.getBoundingClientRect();
      const generator = document.querySelector<HTMLElement>(".generator-view")?.getBoundingClientRect();
      const content = document.querySelector<HTMLElement>(".view-content")?.getBoundingClientRect();
      return { panelBottom: panel?.bottom ?? 0, footerBottom: footer?.bottom ?? 0, workspaceBottom: workspace?.bottom ?? 0, generatorBottom: generator?.bottom ?? 0, contentBottom: content?.bottom ?? 0, viewportHeight: window.innerHeight };
    });
    expect(rail.footerBottom).toBeGreaterThan(0);
    expect(rail.footerBottom).toBeLessThanOrEqual(rail.panelBottom + 0.5);
    expect(rail.footerBottom).toBeLessThanOrEqual(rail.viewportHeight + 0.5);
  });
}

for (const viewport of [
  { width: 900, height: 540 },
  { width: 1024, height: 576 },
  { width: 1280, height: 600 },
  { width: 1366, height: 600 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  test(`generator stays within the window at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>(".run-panel-footer")?.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".run-panel")?.getBoundingClientRect();
      const actionElements = ["#header-stats", "#rate-limits-line", ".run-actions", ".privacy-note"]
        .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect));
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        footerBottom: footer?.bottom ?? 0,
        panelBottom: panel?.bottom ?? 0,
        viewportHeight: window.innerHeight,
        actionElements: actionElements.map((rect) => ({ top: rect.top, bottom: rect.bottom, height: rect.height })),
      };
    });
    expect(layout.scrollWidth, JSON.stringify(layout)).toBe(layout.clientWidth);
    expect(layout.footerBottom).toBeGreaterThan(0);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.panelBottom + 0.5);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight + 0.5);
    expect(layout.actionElements).toHaveLength(4);
    for (const element of layout.actionElements) {
      expect(element.height).toBeGreaterThan(0);
      expect(element.top).toBeGreaterThanOrEqual(0);
      expect(element.bottom).toBeLessThanOrEqual(layout.viewportHeight + 0.5);
    }
    await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeVisible();
    await expect(page.locator(".privacy-note")).toBeVisible();
  });
}
