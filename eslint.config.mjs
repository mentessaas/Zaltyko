import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// The rebuilt domain reads `@/db/zaltyko-schema` (or its zaltyko-* files).
// Several canonical names replace legacy concepts on purpose, so canonical
// code must not reach the legacy barrel by accident. Mirrored by
// tests/canonical-schema-boundary.test.ts.
const canonicalFiles = [
  "src/modules/**/*.{ts,tsx}",
  "src/app/owner/**/*.{ts,tsx}",
  "src/app/familia/**/*.{ts,tsx}",
  "src/components/owner-dashboard/**/*.{ts,tsx}",
  "src/components/family-portal/**/*.{ts,tsx}",
  "src/app/api/v1/**/*.{ts,tsx}",
];
const legacySchemaPaths = [{
  name: "@/db/schema",
  message: "Canonical code imports @/db/zaltyko-schema, not the legacy schema barrel.",
}];
const legacySchemaPatterns = [{
  group: ["@/db/schema/*", "!@/db/schema/zaltyko-*", "!@/db/schema/owner-signup-consent"],
  message: "Canonical code imports @/db/zaltyko-schema, not legacy schema tables.",
}];

// Monthly invoicing is split into internal modules under
// src/modules/billing/application/monthly-invoice/. Only the facade
// monthly-invoice-service.ts and those modules may import them: the issuance
// lock order (site, family, athletes, quoted rows) is only guaranteed through
// issueMonthlyInvoice. Covers the alias, deep relative paths and
// `./monthly-invoice/*` / `../monthly-invoice/*`. Mirrored by
// tests/monthly-invoice-internal-boundary.test.ts.
const monthlyInvoiceInternalFiles = [
  "src/modules/billing/application/monthly-invoice-service.ts",
  "src/modules/billing/application/monthly-invoice/**/*.{ts,tsx}",
];
// Reviewed exceptions (tests/ or scripts/ only), each with its reason. Empty:
// every test and script goes through the facade. Add a file here only with a
// comment explaining why the facade is not enough; never widen the globs.
const monthlyInvoiceInternalImportExceptions = [];
const monthlyInvoiceInternalPattern = {
  group: [
    "**/billing/application/monthly-invoice",
    "**/monthly-invoice/*",
  ],
  message:
    "monthly-invoice/* es interno. Importa desde @/modules/billing/application/monthly-invoice-service: el orden de bloqueos de la emisión solo se garantiza a través de issueMonthlyInvoice.",
};
const sourceExtensions = "{ts,tsx,js,jsx,mjs,cjs}";

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
// no-restricted-imports options do not merge across config objects: for each
// file the last matching object wins. Order: every file (monthly-invoice
// boundary), then canonical code (legacy schema + boundary), then the facade
// and the internal modules (legacy schema only).
{
  files: [
    `src/**/*.${sourceExtensions}`,
    `tests/**/*.${sourceExtensions}`,
    `scripts/**/*.${sourceExtensions}`,
  ],
  ignores: [
    ...monthlyInvoiceInternalFiles,
    ...monthlyInvoiceInternalImportExceptions,
  ],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [monthlyInvoiceInternalPattern],
    }],
  },
},
{
  files: canonicalFiles,
  ignores: monthlyInvoiceInternalFiles,
  rules: {
    "no-restricted-imports": ["error", {
      paths: legacySchemaPaths,
      patterns: [...legacySchemaPatterns, monthlyInvoiceInternalPattern],
    }],
  },
},
{
  files: monthlyInvoiceInternalFiles,
  rules: {
    "no-restricted-imports": ["error", {
      paths: legacySchemaPaths,
      patterns: legacySchemaPatterns,
    }],
  },
},
{
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".worktrees/**"]
},
];

export default eslintConfig;
