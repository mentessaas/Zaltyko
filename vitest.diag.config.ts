import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * vitest.diag.config.ts
 *
 * Config permanente para suites de diagnóstico que NO corren con el run por
 * defecto (`pnpm test`). Se ejecutan bajo demanda con:
 *
 *   pnpm vitest run --config vitest.diag.config.ts
 *
 * Suites incluidas:
 *   - tests/api/cron-class-reminders.test.ts
 *       Cobertura del fix per-academia try/catch (ZAL-169 §4 / Refactor #2).
 *       Excluida del main por requerir flags de runtime de cron.
 *   - tests/lib/stripe-refund-service.test.ts
 *       Cobertura de la reconciliación idempotente charge.refunded
 *       (Refactor #6 — ubicación canónica).
 *
 * Suites excluidas del main pero rotas en origin/main (no incluidas aquí,
 * ver la lista en vitest.config.ts projects[]).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15000,
    include: [
      "tests/api/cron-class-reminders.test.ts",
      "tests/lib/stripe-refund-service.test.ts",
    ],
    exclude: ["node_modules", ".next", "coverage"],
  },
});