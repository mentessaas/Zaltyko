import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * vitest.qa.config.ts
 *
 * Config dedicada a las suites de QA hardening (ZAL-565 / ZAL-957). Las
 * pruebas bajo `tests/qa/**` están excluidas del run por defecto
 * (`pnpm test`) porque duplican cobertura de seguridad que ya está en las
 * suites web y disparan ruido cuando fallan por motivos no relacionados al
 * código bajo revisión.
 *
 * Ejecutar bajo demanda con:
 *
 *   pnpm test:qa
 *
 * Equivalente a:
 *
 *   pnpm vitest run --config vitest.qa.config.ts
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
    include: ["tests/qa/**/*.test.ts", "tests/qa/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "coverage"],
  },
});