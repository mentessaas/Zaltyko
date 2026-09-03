import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        test: {
          name: "web",
          root: ".",
          environment: "node",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          // API-heavy suites import large route graphs. Two workers keep module
          // transforms below the existing hook/test budgets on local and CI runners;
          // four workers produced deterministic CPU starvation in the release gate.
          maxWorkers: 2,
          minWorkers: 1,
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          // Las suites Web no deben descubrir las pruebas del proyecto Mobile.
          exclude: ["node_modules", ".next", "coverage", "mobile/**"],
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
      },
      {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./mobile", import.meta.url)),
          },
        },
        test: {
          name: "mobile",
          root: "./mobile",
          environment: "node",
          globals: true,
          include: ["**/*.test.ts"],
          exclude: ["node_modules", "dist", ".expo", "android", "ios"],
        },
      },
    ],
  },
});
