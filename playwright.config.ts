import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "node:path";

import { assertLocalPlaywrightTarget } from "./scripts/lib/e2e-sandbox-target";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const isCI = Boolean(process.env.CI);

const isPublicReadOnlyRun = process.env.E2E_PUBLIC_READ_ONLY === "true";

if (isPublicReadOnlyRun) {
  const targetHost = new URL(baseURL).hostname;
  const allowedReadOnlyHosts = new Set([
    "zaltyko.com",
    "localhost",
    "127.0.0.1",
    "::1",
  ]);
  if (!allowedReadOnlyHosts.has(targetHost)) {
    throw new Error(
      "Read-only public E2E is restricted to Zaltyko production or localhost."
    );
  }
} else {
  assertLocalPlaywrightTarget({
    baseUrl: baseURL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    databaseUrl: process.env.DATABASE_URL ?? "",
    databaseUrlPool: process.env.DATABASE_URL_POOL,
    databaseUrlDirect: process.env.DATABASE_URL_DIRECT,
    expectedProjectRef: process.env.E2E_TARGET_SUPABASE_PROJECT_REF,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
}

export default defineConfig({
  testDir: "./tests",
  // Route assertions must allow in-flight browser navigation to settle before reporting missing UI.
  expect: { timeout: 15_000 },
  // Playwright suites use .spec.ts; Vitest contracts use .test.ts and must
  // never be loaded by the Playwright collector.
  testMatch: isPublicReadOnlyRun
    ? "**/e2e-zaltyko-public.spec.ts"
    : "**/*.spec.ts",
  testIgnore: [".claude/**", ".worktrees/**", "node_modules/**"],
  // En CI habilitamos paralelismo para reducir tiempo de ejecucion.
  // The authenticated academy suite compiles data-heavy routes in `next dev`.
  // A single local worker avoids cross-browser compilation starvation; CI
  // keeps its isolated parallel capacity.
  fullyParallel: isCI,
  workers: isCI ? 3 : 1,
  retries: isCI ? 2 : 1,
  // Limite de fail-fast para no quemar minutos en CI si el setup falla.
  maxFailures: isCI ? 5 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["github" as never],
  ],
  use: {
    baseURL,
    ...(isPublicReadOnlyRun ? { serviceWorkers: "block" as const } : {}),
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "pnpm start" : "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
