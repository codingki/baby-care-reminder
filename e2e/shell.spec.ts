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
