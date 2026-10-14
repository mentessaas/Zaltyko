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
      page.getByRole("heading", { name: "Crea tu academia" })
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "No se creará ninguna academia ni se guardará tu aceptación"
    );
    await expect(
      page.getByRole("button", { name: "Crear espacio de dirección" })
    ).toBeDisabled();
    await expect(
      page.getByRole("checkbox", {
        name: /Acepto los términos y condiciones y he leído la política de privacidad/,
      })
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", {
        name: /Acepto los términos y condiciones y he leído la política de privacidad/,
      })
    ).toBeDisabled();
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
