import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
    // API-heavy suites import large route graphs. Two workers keep module
    // transforms below the existing hook/test budgets on local and CI runners;
    // four workers produced deterministic CPU starvation in the release gate.
    maxWorkers: 2,
    minWorkers: 1,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Todas las suites del repositorio forman parte del gate normal. Las APIs
    // sensibles usan mocks contractuales; RLS real se prueba por separado en
    // PostgreSQL efímero con `pnpm test:rls:local`.
    exclude: ["node_modules", ".next", "coverage"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.stories.tsx",
        "src/**/index.ts",
        "src/types/**",
      ],
    },
  },
});
