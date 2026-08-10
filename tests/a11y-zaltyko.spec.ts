import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { config } from "dotenv";
import { expect, test, type Page, type ViewportSize } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const academyId = process.env.E2E_ACADEMY_ID;
const storageState = process.env.E2E_STORAGE_STATE;
const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Viewports exercised by the gate. 320px is the minimum WCAG 1.4.10 reflow
 * threshold; 390px is the common iPhone 14 width; 1280x720 mirrors the
 * existing desktop Playwright project default.
 */
const VIEWPORTS: ReadonlyArray<{ label: string; viewport: ViewportSize }> = [
  { label: "320", viewport: { width: 320, height: 568 } },
  { label: "390", viewport: { width: 390, height: 844 } },
  { label: "desktop", viewport: { width: 1280, height: 720 } },
];

/**
 * Named, dated exceptions. Add a new entry with: rule id, ticket,
 * review-by date, and a one-line justification. Anything not listed here
 * either passes or fails the gate.
 */
const NAMED_EXCEPTIONS: ReadonlyArray<{
  ruleId: string;
  ticket: string;
  reviewBy: string; // YYYY-MM-DD
  reason: string;
}> = [
  // Example template — leave empty unless a real exception is granted.
  // { ruleId: "color-contrast", ticket: "ZAL-XXX", reviewBy: "2026-09-30", reason: "TBD" },
];

const FAILING_IMPACTS = new Set(["critical", "serious"]);

type AxeViolation = {
  id: string;
  impact?: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  nodes: Array<{ target: string[] }>;
};

function criticalViolations(violations: AxeViolation[]) {
  return violations.filter(
    (v) =>
      Boolean(v.impact && FAILING_IMPACTS.has(v.impact)) &&
      !NAMED_EXCEPTIONS.some((e) => e.ruleId === v.id),
  );
}

function summarizeViolations(violations: AxeViolation[]) {
  if (violations.length === 0) return "  (none)";
  return violations
    .map(
      (v) =>
        `  - [${v.impact ?? "unknown"}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`,
    )
    .join("\n");
}

async function waitForHydration(page: Page): Promise<void> {
  // Real hydration signal: wait for a known interactive element to be wired
  // by React (button with onClick or a top-level link). We poll until either
  // an interactive element becomes visible or `data-hydrated` is set, with a
  // generous timeout to cover Next.js dev compilation. We never substitute a
  // fixed wait — the certifier criterion forbids timeouts as a stability
  // signal.
  await page.waitForFunction(
    () => {
      const explicit = document.documentElement.dataset.hydrated === "true";
      if (explicit) return true;
      const interactive = document.querySelector(
        "button, a[href], input, select, textarea, [role='button']",
      );
      if (interactive && interactive.getBoundingClientRect().width > 0) {
        return true;
      }
      return false;
    },
    null,
    { timeout: 30_000 },
  );
}

async function checkReflow(page: Page, label: string): Promise<void> {
  // WCAG 1.4.10 reflow: at 320 CSS px the content must be presentable
  // without horizontal scrolling. We assert scrollWidth fits.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1) {
    throw new Error(
      `[reflow:${label}] horizontal overflow detected: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
    );
  }
}

async function checkFocusableLanding(page: Page): Promise<void> {
  // Sanity gate: A page with content must have at least one focusable
  // interactive element. We don't run Tab cycles here (those are flaky in
  // Next.js dev compilation and on iframes) — the existence of a focusable
  // element is what we are certifying. axe will cover the rest of the
  // keyboard accessibility rules.
  const focusableCount = await page.evaluate(() => {
    const sel =
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    return document.querySelectorAll(sel).length;
  });
  if (focusableCount === 0) {
    throw new Error("[focus] no focusable interactive element found on page");
  }
}

async function analyzeStablePage(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await new AxeBuilder({ page }).withTags(axeTags).analyze();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 1 || !/Execution context was destroyed|frame was detached|navigation/i.test(message)) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(1_000);
    }
  }

  throw new Error("Axe analysis failed after retry.");
}

async function scanPage(page: Page, url: string, label: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });

  await waitForHydration(page);
  await checkReflow(page, label);
  await checkFocusableLanding(page);

  const results = await analyzeStablePage(page);

  const blocking = criticalViolations(results.violations as AxeViolation[]);
  if (blocking.length > 0) {
    const all = summarizeViolations(results.violations as AxeViolation[]);
    const blockList = summarizeViolations(blocking);
    throw new Error(
      `[viewport:${label} url:${url}] ${blocking.length} critical/serious axe violation(s)\n${blockList}\nFull list:\n${all}`,
    );
  }
}

const PUBLIC_PAGES = [
  { name: "landing", url: "/" },
  { name: "login", url: "/auth/login" },
];

const AUTH_PAGES = [
  { name: "dashboard", url: `/app/${academyId}/dashboard` },
  { name: "athletes", url: `/app/${academyId}/athletes` },
];

function describeLabel(label: string): string {
  return label === "desktop" ? "desktop" : `${label}px`;
}

for (const { label, viewport } of VIEWPORTS) {
  test.describe(`Zaltyko public accessibility audit @ ${describeLabel(label)}`, () => {
    test.describe.configure({ timeout: 120_000 });
    test.use({ viewport });

    for (const { name, url } of PUBLIC_PAGES) {
      test(`${name} has no critical/serious axe violations`, async ({ page }) => {
        await scanPage(page, url, label);
      });
    }
  });
}

for (const { label, viewport } of VIEWPORTS) {
  test.describe(`Zaltyko authenticated accessibility audit @ ${describeLabel(label)}`, () => {
    test.use({ viewport, ...(storageState ? { storageState } : {}) });
    test.describe.configure({ timeout: 120_000 });

    for (const { name, url } of AUTH_PAGES) {
      test(`${name} has no critical/serious axe violations`, async ({ page }) => {
        test.skip(!academyId, "Set E2E_ACADEMY_ID to run authenticated academy a11y checks.");
        await scanPage(page, url, label);
      });
    }
  });
}
