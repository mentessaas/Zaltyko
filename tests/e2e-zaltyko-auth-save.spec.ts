import { mkdirSync } from "node:fs";

import { chromium, expect, test } from "@playwright/test";

test("save auth state", async () => {
  test.setTimeout(120_000);
  const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;

  test.skip(!email || !password, "Set E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD to generate .auth/user.json.");

  mkdirSync(".auth", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/auth/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/auth\/login$/, { timeout: 60_000 });
  await context.storageState({ path: ".auth/user.json" });
  await browser.close();
});
