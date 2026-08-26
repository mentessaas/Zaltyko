import { expect, test } from "@playwright/test";

const PREVIEW_ORIGIN = "https://zaltyko-9d3lj2w4n-mentessaas-projects.vercel.app";
const PUBLIC_ORIGIN = "https://zaltyko.com";
const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-security-policy",
] as const;

test.describe("ZAL-882 live browser security gate", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("preview public routes expose security headers and no CSP console violations", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(`[${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => consoleMessages.push(`[pageerror] ${error.message}`));

    for (const path of ["/", "/pricing", "/contact", "/es/gimnasia-artistica"]) {
      const response = await page.goto(`${PREVIEW_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
      const headers = response?.headers() ?? {};
      const missing = REQUIRED_HEADERS.filter((name) => !headers[name]);
      console.log(JSON.stringify({ path, status: response?.status(), finalUrl: page.url(), missing, headers }));
      console.log(JSON.stringify({ path, status: response?.status(), finalUrl: page.url(), requiredHeaders: Object.fromEntries(REQUIRED_HEADERS.map((name) => [name, headers[name] ?? null])) }));
      await page.screenshot({ path: `test-results/zal-882-preview-${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}.png`, fullPage: true });
      expect(response?.status(), `${path} preview response`).toBe(200);
      expect(missing, `${path} missing required security headers`).toEqual([]);
    }

    const violations = consoleMessages.filter((message) => /Refused to |Content Security Policy/i.test(message));
    console.log(JSON.stringify({ consoleMessages, cspViolations: violations }));
    expect(violations, "CSP browser console violations").toEqual([]);
  });

  test("www redirects to apex with one 301 and apex remains non-www", async ({ request }) => {
    const www = await request.get(`${PUBLIC_ORIGIN}/`, { maxRedirects: 0 });
    console.log(JSON.stringify({ wwwStatus: www.status(), wwwLocation: www.headers().location ?? null }));
    expect(www.status()).toBe(301);
    expect(www.headers().location).toBe(`${PUBLIC_ORIGIN}/`);

    const apex = await request.get(`${PUBLIC_ORIGIN}/`, { maxRedirects: 5 });
    console.log(JSON.stringify({ apexStatus: apex.status(), apexUrl: apex.url() }));
    expect(apex.url()).not.toContain("www.");
  });
});
