import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const screenshotDir = resolve(
  process.cwd(),
  "output/playwright/pr-08-owner-insights"
);

test("owner insights preview is responsive, usable and WCAG A/AA clean", async ({
  page,
}) => {
  test.setTimeout(120_000);
  mkdirSync(screenshotDir, { recursive: true });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/owner/insights/preview", {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    await expect(
      page.getByRole("heading", { name: "Qué merece atención ahora" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Simular nuevo grupo" })
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: resolve(screenshotDir, `insights-${viewport.width}.png`),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByText("Evidencia y supuestos").first().click();
  await expect(page.getByText("Supuestos declarados").first()).toBeVisible();
  await page.getByText("No es relevante").first().click();
  const dismiss = page.getByRole("button", { name: "Descartar" }).first();
  await expect(dismiss).toBeDisabled();
  await page.getByLabel("Motivo del descarte").first().fill("No aplica al horario");
  await expect(dismiss).toBeEnabled();
});
