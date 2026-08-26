import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 15000,
    reporters: ["dot"],
    include: ["tests/qa/**/*.test.ts", "tests/qa/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "coverage"],
  },
});
