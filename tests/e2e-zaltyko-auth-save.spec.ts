import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const authStates = [
  {
    label: "owner",
    email: process.env.E2E_AUTH_EMAIL,
    password: process.env.E2E_AUTH_PASSWORD,
    path: process.env.E2E_OWNER_STORAGE_STATE ?? process.env.E2E_STORAGE_STATE ?? ".auth/user.json",
  },
  {
    label: "coach",
    email: process.env.E2E_COACH_EMAIL ?? "e2e-coach@zaltyko.test",
    password: process.env.E2E_COACH_PASSWORD ?? process.env.E2E_AUTH_PASSWORD,
    path: process.env.E2E_COACH_STORAGE_STATE ?? ".auth/coach.json",
  },
  {
    label: "super-admin",
    email: process.env.E2E_SUPER_ADMIN_EMAIL ?? "e2e-super-admin@zaltyko.test",
    password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? process.env.E2E_AUTH_PASSWORD,
    path: process.env.E2E_SUPER_ADMIN_STORAGE_STATE ?? ".auth/super-admin.json",
  },
];

test.describe.configure({ mode: "serial" });

for (const authState of authStates) {
  test(`save ${authState.label} auth state`, async ({ page, context, browserName }) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "Storage state generation only needs one browser.");

    const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

    test.skip(
      !authState.email || !authState.password || !authState.path,
      `Set credentials and storage path for ${authState.label}.`
    );

    mkdirSync(".auth", { recursive: true });
    await page.goto(`${baseURL}/auth/login`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await emailInput.fill(authState.email!);
    await passwordInput.fill(authState.password!);
    await expect(emailInput).toHaveValue(authState.email!);
    await expect(passwordInput).toHaveValue(authState.password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/auth\/(login|redirect)/, { timeout: 60_000 });
    await expect
      .poll(async () => {
        const cookies = await context.cookies();
        return cookies.some((cookie) => cookie.name.includes("auth-token"));
      }, { timeout: 60_000 })
      .toBe(true);
    await context.storageState({ path: authState.path });
  });
}
