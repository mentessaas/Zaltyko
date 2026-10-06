import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("owner clean-start setup is responsive and WCAG A/AA clean", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/owner/setup/preview", {
      waitUntil: "networkidle",
      timeout: 120_000,
    });
    await expect(
      page.getByRole("heading", { name: "Crea tu espacio de dirección" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )
    ).toBe(false);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
