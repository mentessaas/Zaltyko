/**
 * ZAL-336 — Playwright config local para el E2E de signup con UTM.
 *
 * Override del config raíz: la ruta por defecto ignora `.claude/**`, lo
 * cual bloquea los tests dentro de worktrees (donde trabaja este agent).
 * Levantamos `webServer` con `reuseExistingServer: true` para reusar
 * el `pnpm dev` que el orquestador ya arrancó.
 */

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["node_modules/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report-zal336" }],
  ],
  use: {
    baseURL,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // ZAL-336 [E2E]: el CSP de next.config.mjs sólo permite
    // https://*.supabase.co en connect-src. Para que el form de signup
    // pueda llamar a `supabase.auth.signUp` apuntando a
    // http://127.0.0.1:54321 (Supabase local) hay que saltarse el CSP en el
    // contexto del test. Esto es estrictamente E2E-local; no afecta prod.
    bypassCSP: true,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "echo 'reusing pnpm dev already running on :3000' && sleep 1",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});