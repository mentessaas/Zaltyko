import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  testIgnore: [
    ".claude/**",
    ".worktrees/**",
    "node_modules/**",
  ],
  // En CI habilitamos paralelismo para reducir tiempo de ejecucion.
  // En local mantenemos 2 workers para no saturar la laptop del dev.
  fullyParallel: isCI,
  workers: isCI ? 3 : 2,
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
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
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
