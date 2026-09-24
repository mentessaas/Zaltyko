import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Cubre solo lógica pura (cliente API, auth helpers, role routing).
// Los componentes RN (.tsx) necesitan jest-expo/RN Testing Library;
// fuera de alcance para este set inicial — ver README de mobile/.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", ".expo", "android", "ios"],
  },
});
