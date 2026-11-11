import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Contract for the monthly-invoice boundary in eslint.config.mjs: only the
 * facade monthly-invoice-service.ts and the modules of
 * src/modules/billing/application/monthly-invoice/ may import those modules.
 * The issuance lock order is only guaranteed through issueMonthlyInvoice.
 *
 * Three layers:
 * - The real ESLint configuration, through the ESLint API, on sample files. It
 *   fails if a rule disappears, becomes a warning, stops matching an import
 *   form, or is overridden by a later config object (no-restricted-imports and
 *   no-restricted-syntax options do not merge).
 * - The reviewed exceptions in eslint.monthly-invoice-exceptions.json.
 * - A scan of the repository sources that resolves every specifier against
 *   its file. `pnpm lint` in CI only lints src/ and the root files, so this is
 *   the barrier for tests/ and scripts/, and it also covers the relative paths
 *   and template specifiers ESLint cannot resolve.
 */

const INTERNAL_DIR = "src/modules/billing/application/monthly-invoice";
const FACADE = "src/modules/billing/application/monthly-invoice-service.ts";
const FACADE_SPECIFIER = "@/modules/billing/application/monthly-invoice-service";
const EXCEPTIONS_FILE = "eslint.monthly-invoice-exceptions.json";
/** Root files linted by `lint:app` (package.json). */
const ROOT_FILE = /^(?:middleware\.ts|instrumentation[^/]*\.ts|sentry\.[^/]*\.ts)$/;
/** This file embeds internal specifiers as text for the ESLint samples. */
const SELF = "tests/monthly-invoice-internal-boundary.test.ts";

type Exception = { file: string; reason: string };
function readExceptions(): Exception[] {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), EXCEPTIONS_FILE), "utf8")
  ) as { exceptions?: unknown };
  expect(Array.isArray(parsed.exceptions), EXCEPTIONS_FILE).toBe(true);
  return parsed.exceptions as Exception[];
}

type LintMessage = { ruleId: string | null; severity: number; message: string };
type LintEngine = {
  lintText(
    code: string,
    options: { filePath: string; warnIgnored?: boolean }
  ): Promise<Array<{ messages: LintMessage[] }>>;
};

let engine: LintEngine;

async function boundaryMessages(filePath: string, code: string) {
  const [result] = await engine.lintText(code, { filePath, warnIgnored: true });
  return result.messages.filter(
    (message) =>
      (message.ruleId === "no-restricted-imports" ||
        message.ruleId === "no-restricted-syntax") &&
      message.message.includes(FACADE_SPECIFIER)
  );
}

async function legacySchemaMessages(filePath: string, code: string) {
  const [result] = await engine.lintText(code, { filePath, warnIgnored: true });
  return result.messages.filter(
    (message) =>
      message.ruleId === "no-restricted-imports" &&
      message.message.includes("@/db/zaltyko-schema")
  );
}

const INTERNAL = "@/modules/billing/application/monthly-invoice";

describe("monthly-invoice internal boundary (ESLint)", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    // ESLint 8.57: loadESLint({ useFlatConfig: true }) returns the flat-config
    // engine, which reads eslint.config.mjs from the repository root like
    // `pnpm lint` does.
    const { loadESLint } = (await import("eslint")) as unknown as {
      loadESLint: (options: {
        useFlatConfig: boolean;
        cwd: string;
      }) => Promise<new (options: { cwd: string }) => LintEngine>;
    };
    const FlatESLint = await loadESLint({
      useFlatConfig: true,
      cwd: process.cwd(),
    });
    engine = new FlatESLint({ cwd: process.cwd() });
  }, 120_000);

  it.each([
    // Static imports and re-exports (no-restricted-imports).
    ["tests/sample-internal.test.ts", `import { lockQuotedRows } from "${INTERNAL}/issue-locks";\nvoid lockQuotedRows;\n`, "no-restricted-imports"],
    ["tests/sample-internal-type.test.ts", `import type { MonthlyIssueResult } from "${INTERNAL}/replay";\nexport type R = MonthlyIssueResult;\n`, "no-restricted-imports"],
    ["tests/sample-index.test.ts", `import * as internals from "${INTERNAL}/index";\nvoid internals;\n`, "no-restricted-imports"],
    ["tests/sample-dir.test.ts", `import * as internals from "${INTERNAL}";\nvoid internals;\n`, "no-restricted-imports"],
    ["scripts/sample-internal.ts", `import { replayByPeriod } from "../src/modules/billing/application/monthly-invoice/replay";\nvoid replayByPeriod;\n`, "no-restricted-imports"],
    ["scripts/sample-internal.mjs", `import { loadInvoice } from "../src/modules/billing/application/monthly-invoice/issued-reads.ts";\nvoid loadInvoice;\n`, "no-restricted-imports"],
    ["src/lib/sample-internal.ts", `export { loadInvoice } from "${INTERNAL}/issued-reads";\n`, "no-restricted-imports"],
    ["src/lib/sample-star.ts", `export * from "${INTERNAL}/issue-locks";\n`, "no-restricted-imports"],
    ["src/lib/sample-star-ns.ts", `export * as locks from "${INTERNAL}/issue-locks";\n`, "no-restricted-imports"],
    ["src/lib/sample-internal.js", `import { buildMonthlyInvoiceOptions } from "${INTERNAL}/quote";\nvoid buildMonthlyInvoiceOptions;\n`, "no-restricted-imports"],
    ["src/app/api/v1/owner/sample/route.ts", `import { buildMonthlyInvoiceOptions } from "${INTERNAL}/quote";\nvoid buildMonthlyInvoiceOptions;\n`, "no-restricted-imports"],
    ["src/components/owner-dashboard/SampleInternal.tsx", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    ["middleware.ts", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    ["instrumentation.ts", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    ["instrumentation-client.ts", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    ["sentry.server.config.ts", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    ["sentry.edge.config.ts", `import { lockIssuanceScope } from "${INTERNAL}/issue-locks";\nvoid lockIssuanceScope;\n`, "no-restricted-imports"],
    // Relative spellings, exact for each billing scope.
    ["src/modules/billing/sample.ts", `import { loadInvoice } from "./application/monthly-invoice/issued-reads";\nvoid loadInvoice;\n`, "no-restricted-imports"],
    ["src/modules/billing/domain/sample.ts", `import { lockQuotedRows } from "../application/monthly-invoice/issue-locks";\nvoid lockQuotedRows;\n`, "no-restricted-imports"],
    ["src/modules/billing/application/sample-sibling.ts", `import { replayByIdempotencyKey } from "./monthly-invoice/replay";\nvoid replayByIdempotencyKey;\n`, "no-restricted-imports"],
    ["src/modules/billing/application/sample-sibling-dir.ts", `import * as internals from "./monthly-invoice";\nvoid internals;\n`, "no-restricted-imports"],
    ["src/modules/billing/application/nested/sample.ts", `import { loadInvoice } from "../monthly-invoice/issued-reads";\nvoid loadInvoice;\n`, "no-restricted-imports"],
    // Dynamic forms (no-restricted-syntax).
    ["tests/sample-dynamic.test.ts", `export const load = () => import("${INTERNAL}/quote");\n`, "no-restricted-syntax"],
    ["tests/sample-dynamic-template.test.ts", "export const load = () => import(`" + INTERNAL + "/quote`);\n", "no-restricted-syntax"],
    ["scripts/sample-require.cjs", `const { loadInvoice } = require("../src/modules/billing/application/monthly-invoice/issued-reads");\nvoid loadInvoice;\n`, "no-restricted-syntax"],
    ["scripts/sample-require-template.ts", "const internals = require(`../src/modules/billing/application/monthly-invoice`);\nvoid internals;\n", "no-restricted-syntax"],
    ["scripts/sample-import-equals.ts", `import internals = require("../src/modules/billing/application/monthly-invoice/quote");\nvoid internals;\n`, "no-restricted-syntax"],
    ["tests/sample-mock.test.ts", `vi.mock("${INTERNAL}/issue-locks", () => ({}));\n`, "no-restricted-syntax"],
    ["tests/sample-do-mock.test.ts", `vi.doMock("${INTERNAL}/issue-locks");\n`, "no-restricted-syntax"],
    ["tests/sample-import-actual.test.ts", `export const actual = () => vi.importActual("${INTERNAL}/issue-locks");\n`, "no-restricted-syntax"],
    ["tests/sample-import-mock.test.ts", `export const mocked = () => vi.importMock("${INTERNAL}/replay");\n`, "no-restricted-syntax"],
    ["src/modules/billing/application/sample-dynamic.ts", `export const load = () => import("./monthly-invoice/quote");\n`, "no-restricted-syntax"],
  ])("rechaza monthly-invoice/* desde %s", async (filePath, code, ruleId) => {
    const messages = await boundaryMessages(filePath, code);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(ruleId);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].message).toContain("issueMonthlyInvoice");
  });

  it.each([
    ["tests/sample-facade.test.ts", `import { issueMonthlyInvoice } from "${FACADE_SPECIFIER}";\nvoid issueMonthlyInvoice;\nvi.mock("${FACADE_SPECIFIER}");\n`],
    ["scripts/sample-facade.mjs", `export * from "${FACADE_SPECIFIER}";\nexport const load = () => import("${FACADE_SPECIFIER}");\n`],
    ["src/app/api/v1/owner/sample-facade/route.ts", `import { issueMonthlyInvoice } from "${FACADE_SPECIFIER}";\nvoid issueMonthlyInvoice;\n`],
    ["middleware.ts", `import { issueMonthlyInvoice } from "${FACADE_SPECIFIER}";\nvoid issueMonthlyInvoice;\n`],
    // Unrelated folders that happen to be called monthly-invoice.
    ["src/components/billing-ui/Sample.tsx", `import { Row } from "./monthly-invoice/row";\nimport { Cell } from "@/components/billing-ui/monthly-invoice/cell";\nvoid Row;\nvoid Cell;\n`],
    ["src/lib/sample-unrelated.ts", `export * from "../features/monthly-invoice";\nexport const load = () => import("./monthly-invoice/x");\n`],
    ["src/components/owner-dashboard/SampleStorage.tsx", `import { PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY } from "./monthly-invoice-retry-storage";\nvoid PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY;\n`],
  ])("permite la fachada y otras carpetas desde %s", async (filePath, code) => {
    expect(await boundaryMessages(filePath, code)).toEqual([]);
  });

  it("permite que la fachada y los módulos internos se importen entre sí", async () => {
    expect(
      await boundaryMessages(
        FACADE,
        `export { issueMonthlyInvoice } from "./monthly-invoice/issue";\nexport * from "./monthly-invoice/reference";\n`
      )
    ).toEqual([]);
    expect(
      await boundaryMessages(
        `${INTERNAL_DIR}/issue.ts`,
        `import { buildMonthlyInvoiceOptions } from "./quote";\nimport { loadInvoice } from "${INTERNAL}/issued-reads";\nexport const load = () => import("./replay");\nvoid buildMonthlyInvoiceOptions;\nvoid loadInvoice;\n`
      )
    ).toEqual([]);
  });

  it("mantiene la restricción del esquema heredado en el código canónico, la fachada y los módulos internos", async () => {
    for (const filePath of [
      "src/app/api/v1/owner/sample-legacy/route.ts",
      "src/modules/billing/application/sample-legacy.ts",
      "src/modules/billing/domain/sample-legacy.ts",
      FACADE,
      `${INTERNAL_DIR}/quote.ts`,
    ]) {
      const messages = await legacySchemaMessages(
        filePath,
        `import { athletes } from "@/db/schema";\nvoid athletes;\n`
      );
      expect(messages, filePath).toHaveLength(1);
      expect(messages[0].severity, filePath).toBe(2);
    }
  });
});

describe("monthly-invoice internal boundary (excepciones)", () => {
  it("solo admite ficheros concretos de tests/ o scripts/ con motivo", () => {
    for (const exception of readExceptions()) {
      expect(Object.keys(exception).sort(), JSON.stringify(exception)).toEqual([
        "file",
        "reason",
      ]);
      expect(exception.file, exception.file).toMatch(/^(?:tests|scripts)\/[^*?{}[\]!]+$/);
      expect(exception.file, exception.file).not.toContain("..");
      expect(existsSync(join(process.cwd(), exception.file)), exception.file).toBe(true);
      expect(typeof exception.reason).toBe("string");
      expect(exception.reason.trim().length, exception.file).toBeGreaterThan(10);
    }
  });

  it("valida el formato de las excepciones", () => {
    const valid = /^(?:tests|scripts)\/[^*?{}[\]!]+$/;
    expect("tests/monthly-invoice-replay-state.test.ts").toMatch(valid);
    expect("scripts/verify-zaltyko-monthly-invoice.ts").toMatch(valid);
    expect("src/modules/billing/x.ts").not.toMatch(valid);
    expect("tests/**/*.test.ts").not.toMatch(valid);
    expect("scripts/{a,b}.ts").not.toMatch(valid);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

/**
 * Specifiers of static imports and re-exports, `import()`, `require()`,
 * `import x = require()`, and vi.mock / vi.doMock / vi.unmock / vi.doUnmock /
 * vi.importActual / vi.importMock, in single, double or back quotes.
 */
function specifiers(source: string): string[] {
  // Two passes so that a generic such as vi.importActual<typeof import("x")>
  // yields both its type import and its argument.
  const plain =
    /(?:\bfrom|\bimport|\brequire|\bvi\.(?:do)?(?:[mM]ock|[uU]nmock)|\bvi\.import(?:Actual|Mock))\s*\(?\s*(["'`])([^"'`]+)\1/g;
  const generic = /\bvi\.import(?:Actual|Mock)\s*<[^>]*>\s*\(\s*(["'`])([^"'`]+)\1/g;
  return [...source.matchAll(plain), ...source.matchAll(generic)].map(
    (match) => match[2]
  );
}

/** Repository path a specifier points to, or null for packages. */
function resolveSpecifier(file: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return posix.normalize(`src/${specifier.slice(2)}`);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return posix.normalize(posix.join(posix.dirname(file), specifier));
  }
  return null;
}

function reachesInternalDir(file: string, specifier: string): boolean {
  const target = resolveSpecifier(file, specifier);
  return target !== null && (target === INTERNAL_DIR || target.startsWith(`${INTERNAL_DIR}/`));
}

describe("monthly-invoice internal boundary (fuentes)", () => {
  const files = [
    ...["src", "tests", "scripts"].flatMap((root) =>
      sourceFiles(join(process.cwd(), root))
    ),
    ...readdirSync(process.cwd())
      .filter((name) => ROOT_FILE.test(name))
      .map((name) => join(process.cwd(), name)),
  ].map((file) => relative(process.cwd(), file).split(sep).join("/"));

  it("recorre src, tests, scripts y los ficheros de raíz de lint:app", () => {
    expect(files.some((file) => file.startsWith("tests/"))).toBe(true);
    expect(files.some((file) => file.startsWith("scripts/"))).toBe(true);
    expect(files).toContain(FACADE);
    expect(files).toContain("middleware.ts");
    expect(files).toContain("instrumentation.ts");
    expect(files).toContain("sentry.server.config.ts");
  });

  it("solo la fachada, los módulos internos y las excepciones importan monthly-invoice/*", () => {
    const allowed = new Set([
      FACADE,
      SELF,
      ...readExceptions().map((exception) => exception.file),
    ]);
    const violations = files
      .filter((file) => !allowed.has(file) && !file.startsWith(`${INTERNAL_DIR}/`))
      .flatMap((file) =>
        specifiers(readFileSync(join(process.cwd(), file), "utf8"))
          .filter((specifier) => reachesInternalDir(file, specifier))
          .map((specifier) => `${file}: ${specifier}`)
      );
    expect(violations).toEqual([]);
  });

  it("reconoce las formas de importación", () => {
    expect(
      specifiers(
        [
          `import a from "a";`,
          `import "b";`,
          `export { c } from 'c';`,
          `export * from "d";`,
          `export * as e from "e";`,
          `const f = await import("f");`,
          "const g = await import(`g`);",
          `const h = require("h");`,
          "const i = require(`i`);",
          `import j = require("j");`,
          `vi.mock("k", () => ({}));`,
          `vi.doMock('l');`,
          `vi.unmock("m");`,
          `vi.doUnmock("n");`,
          `const o = await vi.importActual("o");`,
          `const p = await vi.importActual<typeof import("q")>("p");`,
          "const r = await vi.importMock(`r`);",
        ].join("\n")
      ).sort()
    ).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r"]);
  });

  it("resuelve cada especificador contra su fichero", () => {
    const yes: Array<[string, string]> = [
      ["tests/x.test.ts", `${INTERNAL}/quote`],
      ["tests/x.test.ts", INTERNAL],
      ["tests/x.test.ts", `${INTERNAL}/index`],
      ["scripts/x.ts", "../src/modules/billing/application/monthly-invoice/replay"],
      ["scripts/lib/x.ts", "../../src/modules/billing/application/monthly-invoice"],
      ["src/modules/billing/application/x.ts", "./monthly-invoice/quote"],
      ["src/modules/billing/application/a/b/x.ts", "../../monthly-invoice/quote"],
      ["src/modules/billing/domain/x.ts", "../application/monthly-invoice"],
      ["src/modules/x.ts", "./billing/application/monthly-invoice/issue"],
      ["middleware.ts", "./src/modules/billing/application/monthly-invoice/issue"],
    ];
    const no: Array<[string, string]> = [
      ["tests/x.test.ts", FACADE_SPECIFIER],
      ["src/components/billing-ui/x.tsx", "./monthly-invoice/row"],
      ["src/modules/billing/application/x.ts", "./monthly-invoice-service"],
      ["src/modules/billing/application/a/x.ts", "./monthly-invoice/quote"],
      ["tests/x.test.ts", "@/components/owner-dashboard/monthly-invoice-retry-storage"],
      ["tests/x.test.ts", "monthly-invoice/quote"],
      ["tests/x.test.ts", "/api/v1/owner/billing/monthly-invoices/issue"],
    ];
    for (const [file, specifier] of yes) {
      expect(reachesInternalDir(file, specifier), `${file}: ${specifier}`).toBe(true);
    }
    for (const [file, specifier] of no) {
      expect(reachesInternalDir(file, specifier), `${file}: ${specifier}`).toBe(false);
    }
  });
});
