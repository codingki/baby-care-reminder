import { expect, test } from "@playwright/test";

test("nav sits on the viewport bottom after date and number fields", async ({ page }) => {
  await page.goto("/shell-check");
  await page.getByRole("button", { name: "Add baby" }).click();
  await page.getByLabel("Birth date").focus();
  await page.getByLabel("Weight").focus();
  await page.locator("[data-slot=dialog-backdrop]").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog")).toBeHidden();
  const nav = page.getByRole("navigation");
  const box = await nav.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThanOrEqual(1);
});

test("quick log tiles can scroll above the nav", async ({ page }) => {
  await page.goto("/shell-check");
  const last = page.locator("[data-tile=Weight]");
  await last.scrollIntoViewIfNeeded();
  const tile = await last.boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(tile).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(tile!.y + tile!.height).toBeLessThanOrEqual(nav!.y + 1);
});

test("date fields do not widen the sheet", async ({ page }) => {
  for (const [width, height] of [
    [360, 640],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/shell-check");
    await page.getByRole("button", { name: "Add baby" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const before = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      frame: document.getElementById("app-frame")?.clientWidth ?? 0,
    }));
    for (const name of ["Birth date", "When"]) {
      const field = page.getByLabel(name);
      await field.focus();
      await field.fill(name === "When" ? "2024-06-01T09:15" : "2024-06-01");
      const focused = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        frame: document.getElementById("app-frame")?.clientWidth ?? 0,
        input: (document.activeElement as HTMLElement | null)?.getBoundingClientRect().width ?? 0,
      }));
      expect(focused.scroll).toBeLessThanOrEqual(focused.frame + 1);
      expect(focused.frame).toBe(before.frame);
      expect(focused.input).toBeLessThanOrEqual(before.frame);
      await field.blur();
    }
    const after = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(after).toBeLessThanOrEqual(before.frame + 1);
  }
});

test("date text lines up with neighboring inputs", async ({ page }) => {
  for (const [width, height] of [
    [360, 640],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/shell-check");
    await page.getByRole("button", { name: "Add baby" }).click();
    const metrics = await page.evaluate(() => {
      const date = document.querySelector<HTMLInputElement>("input[type='date']");
      const text = document.querySelector<HTMLInputElement>("input[aria-label='Weight']");
      if (!date || !text) return null;
      const dateStyle = getComputedStyle(date);
      const textStyle = getComputedStyle(text);
      const valueStyle = getComputedStyle(date, "::-webkit-date-and-time-value");
      const editStyle = getComputedStyle(date, "::-webkit-datetime-edit");
      return {
        dateH: date.getBoundingClientRect().height,
        textH: text.getBoundingClientRect().height,
        display: dateStyle.display,
        align: dateStyle.alignItems,
        padTop: dateStyle.paddingTop,
        padBottom: dateStyle.paddingBottom,
        textAlign: dateStyle.textAlign,
        valueAlign: valueStyle.textAlign,
        valueMargin: valueStyle.marginTop,
        valueLine: valueStyle.lineHeight,
        editDisplay: editStyle.display,
        editPad: editStyle.paddingTop,
        textLine: textStyle.lineHeight,
      };
    });
    expect(metrics).not.toBeNull();
    expect(Math.abs(metrics!.dateH - metrics!.textH)).toBeLessThanOrEqual(1);
    expect(metrics!.display).toBe("flex");
    expect(metrics!.align).toBe("center");
    expect(metrics!.padTop).toBe("0px");
    expect(metrics!.padBottom).toBe("0px");
    expect(metrics!.textAlign).toBe("left");
    if (metrics!.valueAlign) expect(metrics!.valueAlign).toBe("left");
    if (metrics!.valueMargin) expect(parseFloat(metrics!.valueMargin)).toBe(0);
    if (metrics!.editPad) expect(metrics!.editPad).toBe("0px");
    if (metrics!.editDisplay) expect(metrics!.editDisplay).toBe("flex");
  }
});

test("long sheets keep the footer visible and scroll inside", async ({ page }) => {
  for (const [width, height] of [
    [360, 640],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/shell-check");
    await page.getByRole("button", { name: "Store milk" }).click();
    const dialog = page.getByRole("dialog");
    const panel = page.locator("[data-slot='dialog-panel']");
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => panel.evaluate((node) => node.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(height + 1);
    const layout = await page.evaluate(() => {
      const panel = document.querySelector("[data-slot='dialog-panel']");
      const scroll = document.querySelector("[data-slot='dialog-scroll']");
      const save = [...document.querySelectorAll("button")].find((button) => button.textContent === "Save");
      const frame = document.getElementById("app-frame");
      if (!panel || !scroll || !save || !frame) return null;
      const panelBox = panel.getBoundingClientRect();
      const saveBox = save.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      return {
        panelBottom: panelBox.bottom,
        frameBottom: frameBox.bottom,
        saveTop: saveBox.top,
        saveBottom: saveBox.bottom,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        pageScroll: document.documentElement.scrollWidth,
        frameWidth: frame.clientWidth,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.panelBottom).toBeLessThanOrEqual(layout!.frameBottom + 1);
    expect(layout!.saveBottom).toBeLessThanOrEqual(layout!.frameBottom + 1);
    expect(layout!.saveTop).toBeGreaterThan(0);
    expect(layout!.scrollHeight).toBeGreaterThan(layout!.clientHeight + 8);
    expect(layout!.pageScroll).toBeLessThanOrEqual(layout!.frameWidth + 1);

    const scroll = page.locator("[data-slot='dialog-scroll']");
    await scroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const last = await page.locator("[data-last]").boundingBox();
    const scrollBox = await scroll.boundingBox();
    expect(last).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(last!.y).toBeGreaterThanOrEqual(scrollBox!.y - 1);
    expect(last!.y + last!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 1);
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    await scroll.evaluate((node) => {
      node.scrollTop = 160;
    });
    const before = await scroll.evaluate((node) => node.scrollTop);
    const box = await scroll.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 24, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 24, box!.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(1);
    expect(before).toBeGreaterThan(1);

    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    const top = await scroll.boundingBox();
    expect(top).not.toBeNull();
    await page.mouse.move(top!.x + 24, top!.y + 40);
    await page.mouse.down();
    await page.mouse.move(top!.x + 24, top!.y + 180, { steps: 8 });
    await page.mouse.up();
    await expect(dialog).toBeHidden();
  }
});

async function showKeyboard(page: import("@playwright/test").Page, height = 470) {
  await page.evaluate((nextHeight) => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("missing visualViewport");
    Object.defineProperty(viewport, "height", { configurable: true, get: () => nextHeight });
    Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => 0 });
    viewport.dispatchEvent(new Event("resize"));
  }, height);
  await page.waitForTimeout(350);
}

test("focused fields stay above a simulated keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shell-check");

  await page.getByRole("button", { name: "Store milk" }).click();
  const panel = page.locator("[data-slot='dialog-panel']");
  await expect
    .poll(async () => panel.evaluate((node) => node.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(845);
  await page.getByLabel("Note").focus();
  await showKeyboard(page);
  const note = await fieldMetrics(page, "Note");
  expect(note.top).toBeGreaterThanOrEqual(note.visibleTop - 1);
  expect(note.bottom).toBeLessThanOrEqual(note.visibleBottom + 1);
  expect(note.bottom - note.top).toBeGreaterThan(20);
  const save = await fieldMetrics(page, "Save", "button");
  expect(save.bottom).toBeLessThanOrEqual(save.visibleBottom + 1);
  expect(note.frameH).toBeGreaterThan(800);

  await page.locator("[data-slot=dialog-backdrop]").click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kb").trim())).toBe("0px");

  await page.getByRole("button", { name: "Add baby" }).click();
  await page.getByLabel("Weight").focus();
  await showKeyboard(page);
  const weight = await fieldMetrics(page, "Weight");
  expect(weight.top).toBeGreaterThanOrEqual(weight.visibleTop - 1);
  expect(weight.bottom).toBeLessThanOrEqual(weight.visibleBottom + 1);

  await page.locator("[data-slot=dialog-backdrop]").click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByLabel("Your name").focus();
  await showKeyboard(page);
  const name = await fieldMetrics(page, "Your name");
  expect(name.top).toBeGreaterThanOrEqual(name.visibleTop - 1);
  expect(name.bottom).toBeLessThanOrEqual(name.visibleBottom + 1);
  const nav = await page.getByRole("navigation").boundingBox();
  expect(nav).not.toBeNull();
  expect(Math.abs(nav!.y + nav!.height - 844)).toBeLessThanOrEqual(2);
});

function fieldMetrics(page: import("@playwright/test").Page, label: string, tag = "input") {
  return page.evaluate(
    ({ label, tag }) => {
      const field =
        tag === "button"
          ? [...document.querySelectorAll("button")].find((button) => button.textContent === label)
          : document.querySelector(`${tag}[aria-label="${label}"]`);
      if (!(field instanceof HTMLElement)) return { top: -1, bottom: -1, visibleTop: 0, visibleBottom: 0, frameH: 0 };
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const rect = field.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        visibleTop: offsetTop,
        visibleBottom: offsetTop + height,
        frameH: document.getElementById("app-frame")?.getBoundingClientRect().height ?? 0,
      };
    },
    { label, tag },
  );
}

test("backdrop closes the dialog and inside controls do not", async ({ page }) => {
  await page.goto("/shell-check");
  await page.getByRole("button", { name: "Add baby" }).click();
  await page.getByLabel("Birth date").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("option", { name: "Female" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("[data-slot=dialog-backdrop]").click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole("dialog")).toBeHidden();
});
