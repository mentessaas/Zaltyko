import { expect, test } from "@playwright/test";

// Read-only audit of the deployed public surfaces. No signup or contact writes.
for (const width of [375, 1280]) {
  test.describe(`public layout ${width}px`, () => {
    test.use({ viewport: { width, height: 812 } });
    for (const path of ["/", "/auth/login", "/pricing", "/marketplace"]) {
      test(`${path} renders without horizontal overflow`, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBeLessThan(400);
        await expect(page.getByRole("heading").first()).toBeVisible();
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
        const layout = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
        await page.screenshot({ path: test.info().outputPath("public-layout.png"), fullPage: true });
      });
    }
  });
}
