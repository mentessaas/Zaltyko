import { resolve } from "node:path";

import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;

const academyPaths = ["dashboard", "athletes"] as const;
const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "390px", width: 390, height: 844 },
  { name: "320px", width: 320, height: 568 },
] as const;

async function gotoAcademy(page: Page, path: string) {
  await page.goto(`${baseURL}/app/${academyId}/${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => undefined);
}

async function expectNoRouteError(page: Page) {
  await expect(
    page.getByText(/Failed query|This page could not be found|Application error/i),
  ).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `Horizontal overflow: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectKeyboardNavigation(page: Page, path: string) {
  // Focus the first focusable element in the main content area and tab through
  // at least 5 focusable stops, asserting every focused element is visible and
  // not display:none / visibility:hidden.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 5; i += 1) {
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 80),
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0,
        role: el.getAttribute("role"),
        ariaLabel: el.getAttribute("aria-label"),
      };
    });
    expect(active, `path=${path} step=${i} activeElement is body`).not.toBeNull();
    expect(active?.visible, `path=${path} step=${i} ${active?.tag} "${active?.text}" not visible`).toBe(true);
    await page.keyboard.press("Tab");
  }
}

test.describe("ZAL-604: academy a11y focal — navigation, keyboard, overflow", () => {
  test.skip(!academyId, "Set E2E_ACADEMY_ID to run academy a11y focal checks.");
  test.skip(!storageState, "Set E2E_STORAGE_STATE to run academy a11y focal checks.");
  test.use({ storageState });
  test.describe.configure({ mode: "serial" });
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of viewports) {
    for (const path of academyPaths) {
      test(`@${viewport.name} /app/${path} renders without route error`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
          await expect(page).not.toHaveURL(/\/auth\/login/);
        } finally {
          await context.close();
        }
      });

      test(`@${viewport.name} /app/${path} no horizontal overflow`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
          await expectNoHorizontalOverflow(page);
        } finally {
          await context.close();
        }
      });

      test(`@${viewport.name} /app/${path} keyboard tab order reaches visible focusable elements`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          storageState,
        });
        const page = await context.newPage();
        try {
          await gotoAcademy(page, path);
          await expectNoRouteError(page);
          await expectKeyboardNavigation(page, path);
        } finally {
          await context.close();
        }
      });
    }
  }
});
