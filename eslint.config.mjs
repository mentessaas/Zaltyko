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

// Internal-module boundaries (P2 #19). A large service is split into internal
// modules behind a public facade; only the facade and the modules of that
// directory may import them, because the lock order and the invariants of the
// service are only guaranteed through the facade. Each boundary (directory,
// facade, message and reviewed exceptions) is defined once in
// eslint.internal-boundaries.json and mirrored by
// tests/internal-module-boundaries.test.ts.
//
// What ESLint covers, on src/, tests/, scripts/ and the root files of lint:app:
// - Static imports, `import type`, `export … from` and `export * from`
//   (no-restricted-imports), with any specifier that spells the real path
//   `…/<module>/<layer>/<name>[/…]`, plus the relative forms that reach the
//   directory from src/modules/<module> at depths 0–2 (relativeScopes).
// - `import()`, `require()`, `import x = require()`, vi.mock / vi.doMock /
//   vi.unmock / vi.doUnmock / vi.importActual / vi.importMock, with a string or
//   a template without expressions (no-restricted-syntax), for the same
//   specifiers.
// Not covered by ESLint (no path resolution in either rule): deeper relative
// paths, or specifiers built at runtime. The source scan in the contract test
// resolves every specifier against its file and covers them for the
// repository's own files.
const sourceExtensions = "{ts,tsx,js,jsx,mjs,cjs}";
const internalBoundaries = JSON.parse(
  readFileSync(new URL("./eslint.internal-boundaries.json", import.meta.url), "utf8")
).boundaries.map((boundary) => {
  // dir is src/modules/<module>/<layer>/<name>.
  const segments = boundary.dir.split("/");
  if (segments.length !== 5 || segments[0] !== "src" || segments[1] !== "modules") {
    throw new Error(`Invalid internal boundary directory: ${boundary.dir}`);
  }
  const [, , module, layer, name] = segments;
  const parent = segments.slice(0, 4).join("/");
  const grandparent = segments.slice(0, 3).join("/");
  const internalFiles = [boundary.facade, `${boundary.dir}/**/*.${sourceExtensions}`];
  return {
    ...boundary,
    internalFiles,
    exceptionFiles: boundary.exceptions.map((exception) => exception.file),
    path: `${module}/${layer}/${name}`,
    // Relative spellings of the directory that are exact for the files of each
    // scope. Elsewhere `./<name>` may be an unrelated folder.
    relativeScopes: [
      { files: [`${grandparent}/*.${sourceExtensions}`], ignores: [], prefixes: [`./${layer}/${name}`] },
      { files: [`${grandparent}/*/*.${sourceExtensions}`], ignores: [`${parent}/**`], prefixes: [`../${layer}/${name}`] },
      { files: [`${parent}/*.${sourceExtensions}`], ignores: internalFiles, prefixes: [`./${name}`] },
      { files: [`${parent}/*/*.${sourceExtensions}`], ignores: internalFiles, prefixes: [`../${name}`] },
    ],
  };
});
const allInternalFiles = internalBoundaries.flatMap((boundary) => boundary.internalFiles);
const allExceptionFiles = internalBoundaries.flatMap((boundary) => boundary.exceptionFiles);

function boundaryImportPattern(boundary, prefixes = []) {
  return {
    group: [
      `**/${boundary.path}`,
      `**/${boundary.path}/**`,
      ...prefixes.flatMap((prefix) => [prefix, `${prefix}/**`]),
    ],
    message: boundary.message,
  };
}

// esquery regexes cannot contain "/", so it is written as \x2F.
function boundarySpecifierRegex(boundary, prefixes = []) {
  const slash = "\\x2F";
  const escape = (text) =>
    text.replaceAll(".", "\\.").replaceAll("/", slash);
  return [
    `(^|${slash})${escape(boundary.path)}($|${slash})`,
    ...prefixes.map((prefix) => `^${escape(prefix)}($|${slash})`),
  ].join("|");
}

function boundarySyntaxRestrictions(boundary, prefixes = []) {
  const regex = boundarySpecifierRegex(boundary, prefixes);
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
  ].map((selector) => ({ selector, message: boundary.message }));
}

// Complete options for one file group: no-restricted-imports and
// no-restricted-syntax options do not merge across config objects, so every
// group restates the legacy-schema restriction (canonical code) and every
// boundary that applies to it. `prefixes` adds the relative spellings of one
// boundary for its scopes.
function boundaryRules({ canonical, boundaries, prefixes = { name: null, list: [] } }) {
  const prefixesOf = (boundary) => (boundary.name === prefixes.name ? prefixes.list : []);
  return {
    "no-restricted-imports": ["error", {
      ...(canonical ? { paths: legacySchemaPaths } : {}),
      patterns: [
        ...(canonical ? legacySchemaPatterns : []),
        ...boundaries.map((boundary) => boundaryImportPattern(boundary, prefixesOf(boundary))),
      ],
    }],
    "no-restricted-syntax": [
      "error",
      ...boundaries.flatMap((boundary) => boundarySyntaxRestrictions(boundary, prefixesOf(boundary))),
    ],
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
// Internal-module boundaries and legacy schema. For each file the last
// matching object wins, so the order is: every file (all boundaries), canonical
// code (legacy schema + all boundaries), the relative scopes of each boundary
// (legacy schema + all boundaries + that boundary's relative spellings), each
// boundary's facade and internal modules (legacy schema + the other
// boundaries), and each boundary's reviewed exceptions (the other boundaries).
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
  ignores: [...allInternalFiles, ...allExceptionFiles],
  rules: boundaryRules({ canonical: false, boundaries: internalBoundaries }),
},
{
  files: canonicalFiles,
  ignores: allInternalFiles,
  rules: boundaryRules({ canonical: true, boundaries: internalBoundaries }),
},
...internalBoundaries.flatMap((boundary) =>
  boundary.relativeScopes.map((scope) => ({
    files: scope.files,
    ignores: [...scope.ignores, ...allInternalFiles],
    rules: boundaryRules({
      canonical: true,
      boundaries: internalBoundaries,
      prefixes: { name: boundary.name, list: scope.prefixes },
    }),
  }))
),
...internalBoundaries.map((boundary) => ({
  files: boundary.internalFiles,
  rules: boundaryRules({
    canonical: true,
    boundaries: internalBoundaries.filter((other) => other !== boundary),
  }),
})),
...internalBoundaries
  .filter((boundary) => boundary.exceptionFiles.length > 0)
  .map((boundary) => ({
    files: boundary.exceptionFiles,
    rules: boundaryRules({
      canonical: false,
      boundaries: internalBoundaries.filter((other) => other !== boundary),
    }),
  })),
{
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".worktrees/**"]
},
];

export default eslintConfig;
