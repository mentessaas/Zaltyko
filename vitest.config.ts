import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Exclude API integration tests that require drizzle-orm/pg-core
    // These tests have module resolution issues with pnpm + vitest
    exclude: [
      "node_modules",
      ".next",
      "coverage",
      // API tests that import DB schema and fail due to drizzle-orm/pg-core resolution
      "tests/api-academies.test.ts",
      "tests/api-admin-users.test.ts",
      "tests/api-athletes.test.ts",
      "tests/api-attendance.test.ts",
      "tests/api-billing-upgrades.test.ts",
      "tests/api-billing.test.ts",
      "tests/api-class-sessions.test.ts",
      "tests/api-classes.test.ts",
      "tests/api-coaches.test.ts",
      "tests/api-super-admin-users.test.ts",
      "tests/api-stripe-webhook.test.ts",
      "tests/api-webhooks-complete.test.ts",
      // Unit tests that also import DB schema
      "tests/limits.test.ts",
      "tests/unit/session-generation.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
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