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
    server: {
      // Externaliza RN/Expo/Supabase: sus entrypoints traen Flow o native
      // bindings que rolldown no puede parsear en el sandbox de vitest.
      // El código bajo test que toca estos módulos no se ejecuta en unit
      // tests puros (parseOAuthCallback es función pura sin imports de
      // supabase); los flujos que sí los usan requieren jest-expo/RN-TL,
      // fuera de alcance de este set inicial.
      deps: {
        external: [
          "react-native",
          "react-native-gesture-handler",
          "react-native-reanimated",
          "react-native-safe-area-context",
          "react-native-screens",
          "react-native-web",
          "react-native-worklets",
          "@react-native-async-storage/async-storage",
          "@supabase/supabase-js",
          /^expo-/,
        ],
      },
    },
  },
});
