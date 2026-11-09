import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
  ...compat.config({
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-require-imports": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "prefer-const": "warn",
    "@typescript-eslint/no-unused-expressions": "warn",
    "react/no-unescaped-entities": "warn",
    "react/jsx-key": "warn",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/immutability": "warn",
    "react-hooks/preserve-manual-memoization": "warn",
    "react-hooks/purity": "warn",
    "react-hooks/refs": "warn",
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/static-components": "warn",
  },
}),
{
  // The rebuilt domain reads `@/db/zaltyko-schema` (or its zaltyko-* files).
  // Several canonical names replace legacy concepts on purpose, so canonical
  // code must not reach the legacy barrel by accident. Mirrored by
  // tests/canonical-schema-boundary.test.ts.
  files: [
    "src/modules/**/*.{ts,tsx}",
    "src/app/owner/**/*.{ts,tsx}",
    "src/components/owner-dashboard/**/*.{ts,tsx}",
    "src/app/api/v1/**/*.{ts,tsx}",
  ],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "@/db/schema",
        message: "Canonical code imports @/db/zaltyko-schema, not the legacy schema barrel.",
      }],
      patterns: [{
        group: ["@/db/schema/*", "!@/db/schema/zaltyko-*", "!@/db/schema/owner-signup-consent"],
        message: "Canonical code imports @/db/zaltyko-schema, not legacy schema tables.",
      }],
    }],
  },
},
{
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".worktrees/**"]
},
];

export default eslintConfig;
