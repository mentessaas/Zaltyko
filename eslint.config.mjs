import { FlatCompat } from "@eslint/eslintrc";
import { readFileSync } from "fs";
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
// issueMonthlyInvoice. Mirrored by tests/monthly-invoice-internal-boundary.test.ts.
//
// What ESLint covers, on src/, tests/, scripts/ and the root files of lint:app:
// - Static imports, `import type`, `export … from` and `export * from`
//   (no-restricted-imports), with any specifier that spells the real path
//   `…/billing/application/monthly-invoice[/…]`, plus the relative forms that
//   reach the directory from src/modules/billing at depths 0–2 (see
//   monthlyInvoiceRelativeScopes).
// - `import()`, `require()`, `import x = require()`, vi.mock / vi.doMock /
//   vi.unmock / vi.doUnmock / vi.importActual / vi.importMock, with a string or
//   a template without expressions (no-restricted-syntax), for the same
//   specifiers.
// Not covered by ESLint (no path resolution in either rule): deeper relative
// paths, or specifiers built at runtime. The source scan in the contract test
// resolves every specifier against its file and covers them for the
// repository's own files.
const sourceExtensions = "{ts,tsx,js,jsx,mjs,cjs}";
const monthlyInvoiceDir = "src/modules/billing/application/monthly-invoice";
const monthlyInvoiceInternalFiles = [
  "src/modules/billing/application/monthly-invoice-service.ts",
  `${monthlyInvoiceDir}/**/*.${sourceExtensions}`,
];
// Reviewed exceptions: tests/ or scripts/ files only, each with its reason, in
// eslint.monthly-invoice-exceptions.json (validated by the contract test).
// Empty today: every test and script goes through the facade.
const monthlyInvoiceInternalImportExceptions = JSON.parse(
  readFileSync(new URL("./eslint.monthly-invoice-exceptions.json", import.meta.url), "utf8")
).exceptions.map((exception) => exception.file);
const monthlyInvoiceBoundaryMessage =
  "monthly-invoice/* es interno. Importa desde @/modules/billing/application/monthly-invoice-service: el orden de bloqueos de la emisión solo se garantiza a través de issueMonthlyInvoice.";
// Relative spellings of the internal directory that are exact for the files
// of each scope. Elsewhere `./monthly-invoice` may be an unrelated folder.
const monthlyInvoiceRelativeScopes = [
  {
    files: [`src/modules/billing/*.${sourceExtensions}`],
    ignores: [],
    prefixes: ["./application/monthly-invoice"],
  },
  {
    files: [`src/modules/billing/*/*.${sourceExtensions}`],
    ignores: ["src/modules/billing/application/**"],
    prefixes: ["../application/monthly-invoice"],
  },
  {
    files: [`src/modules/billing/application/*.${sourceExtensions}`],
    ignores: monthlyInvoiceInternalFiles,
    prefixes: ["./monthly-invoice"],
  },
  {
    files: [`src/modules/billing/application/*/*.${sourceExtensions}`],
    ignores: monthlyInvoiceInternalFiles,
    prefixes: ["../monthly-invoice"],
  },
];

function monthlyInvoiceImportPattern(prefixes = []) {
  return {
    group: [
      "**/billing/application/monthly-invoice",
      "**/billing/application/monthly-invoice/**",
      ...prefixes.flatMap((prefix) => [prefix, `${prefix}/**`]),
    ],
    message: monthlyInvoiceBoundaryMessage,
  };
}

// esquery regexes cannot contain "/", so it is written as \x2F.
function monthlyInvoiceSpecifierRegex(prefixes = []) {
  const slash = "\\x2F";
  const escape = (text) =>
    text.replaceAll(".", "\\.").replaceAll("/", slash);
  return [
    `(^|${slash})billing${slash}application${slash}monthly-invoice($|${slash})`,
    ...prefixes.map((prefix) => `^${escape(prefix)}($|${slash})`),
  ].join("|");
}

function monthlyInvoiceSyntaxRestrictions(prefixes = []) {
  const regex = monthlyInvoiceSpecifierRegex(prefixes);
  const firstArgument = (call) => [
    `${call} > Literal.arguments:first-child[value=/${regex}/]`,
    `${call} > TemplateLiteral.arguments:first-child[expressions.length=0] > TemplateElement[value.raw=/${regex}/]`,
  ];
  return [
    `ImportExpression > Literal.source[value=/${regex}/]`,
    `ImportExpression > TemplateLiteral.source[expressions.length=0] > TemplateElement[value.raw=/${regex}/]`,
    `TSExternalModuleReference > Literal.expression[value=/${regex}/]`,
    ...firstArgument('CallExpression[callee.type="Identifier"][callee.name="require"]'),
    ...firstArgument(
      'CallExpression[callee.type="MemberExpression"][callee.object.name="vi"][callee.property.name=/^(mock|doMock|unmock|doUnmock|importActual|importMock)$/]'
    ),
  ].map((selector) => ({ selector, message: monthlyInvoiceBoundaryMessage }));
}

function monthlyInvoiceBoundaryRules({ canonical, prefixes = [] }) {
  return {
    "no-restricted-imports": ["error", {
      ...(canonical ? { paths: legacySchemaPaths } : {}),
      patterns: [
        ...(canonical ? legacySchemaPatterns : []),
        monthlyInvoiceImportPattern(prefixes),
      ],
    }],
    "no-restricted-syntax": ["error", ...monthlyInvoiceSyntaxRestrictions(prefixes)],
  };
}

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
// no-restricted-imports and no-restricted-syntax options do not merge across
// config objects: for each file the last matching object wins. Order: every
// file (boundary), canonical code (legacy schema + boundary), the billing
// scopes with relative spellings (legacy schema + boundary + relative), then
// the facade and the internal modules (legacy schema only, no boundary).
{
  files: [
    `src/**/*.${sourceExtensions}`,
    `tests/**/*.${sourceExtensions}`,
    `scripts/**/*.${sourceExtensions}`,
    // Root files linted by lint:app.
    "middleware.ts",
    "instrumentation*.ts",
    "sentry.*.ts",
  ],
  ignores: [
    ...monthlyInvoiceInternalFiles,
    ...monthlyInvoiceInternalImportExceptions,
  ],
  rules: monthlyInvoiceBoundaryRules({ canonical: false }),
},
{
  files: canonicalFiles,
  ignores: monthlyInvoiceInternalFiles,
  rules: monthlyInvoiceBoundaryRules({ canonical: true }),
},
...monthlyInvoiceRelativeScopes.map((scope) => ({
  files: scope.files,
  ignores: scope.ignores,
  rules: monthlyInvoiceBoundaryRules({ canonical: true, prefixes: scope.prefixes }),
})),
{
  files: monthlyInvoiceInternalFiles,
  rules: {
    "no-restricted-imports": ["error", {
      paths: legacySchemaPaths,
      patterns: legacySchemaPatterns,
    }],
    "no-restricted-syntax": "off",
  },
},
{
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".worktrees/**"]
},
];

export default eslintConfig;
