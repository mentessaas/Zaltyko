import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    // API-heavy suites import large route graphs. Keep one worker globally;
    // project-level configs do not accept maxWorkers/minWorkers.
    maxWorkers: 1,
    minWorkers: 1,
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
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          // Las suites Web no deben descubrir las pruebas del proyecto Mobile.
          exclude: ["node_modules", ".next", "coverage", "mobile/**"],
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
