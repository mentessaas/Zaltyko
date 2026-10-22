import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${process.env.USER ?? "postgres"}@127.0.0.1:5432/zaltyko_e2e_zal336`;
const databaseHost = new URL(databaseUrl).hostname;

if (!new Set(["127.0.0.1", "localhost", "::1"]).has(databaseHost)) {
  throw new Error(`ZAL-336 exige PostgreSQL local; host recibido: ${databaseHost}`);
}

// Override .env.local for this dedicated sandbox so the Next webServer and the
// SQL assertions use the exact same synthetic database.
process.env.E2E_DATABASE_URL = databaseUrl;
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/e2e-zaltyko-utm-signup.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-zal336" }]],
  use: {
    baseURL,
    navigationTimeout: 60_000,
    actionTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `E2E_MOCK_AUTH=1 DATABASE_URL_POOL=${databaseUrl} DATABASE_URL_DIRECT=${databaseUrl} DATABASE_URL=${databaseUrl} PORT=3000 pnpm dev`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
