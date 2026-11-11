import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Contract for the monthly-invoice boundary in eslint.config.mjs: only the
 * facade monthly-invoice-service.ts and the modules of
 * src/modules/billing/application/monthly-invoice/ may import those modules.
 * The issuance lock order is only guaranteed through issueMonthlyInvoice.
 *
 * Two layers:
 * - The real ESLint configuration, through the ESLint API, on sample files in
 *   src/, tests/ and scripts/. It fails if the rule disappears, becomes a
 *   warning, stops matching an import form, or if a later config object
 *   overrides it (no-restricted-imports options do not merge).
 * - A scan of the repository sources, because `pnpm lint` in CI only lints
 *   src/: tests/ and scripts/ are checked here, including vi.mock specifiers.
 */

const INTERNAL_DIR = "src/modules/billing/application/monthly-invoice/";
const FACADE = "src/modules/billing/application/monthly-invoice-service.ts";
const FACADE_SPECIFIER = "@/modules/billing/application/monthly-invoice-service";
const RULE = "no-restricted-imports";

/**
 * Files the source scan skips: file → reason. Real internal imports from
 * tests/ or scripts/ also need an entry in
 * monthlyInvoiceInternalImportExceptions (eslint.config.mjs); that list is
 * empty today.
 */
const ALLOWED_INTERNAL_IMPORTERS: Record<string, string> = {
  // This file embeds sample internal imports as strings for the ESLint API.
  "tests/monthly-invoice-internal-boundary.test.ts":
    "Fixtures de texto para la API de ESLint; no importa ningún módulo interno.",
};

type LintMessage = { ruleId: string | null; severity: number; message: string };
type LintEngine = {
  lintText(
    code: string,
    options: { filePath: string; warnIgnored?: boolean }
  ): Promise<Array<{ messages: LintMessage[] }>>;
};

let engine: LintEngine;

async function restrictedImports(filePath: string, code: string) {
  const [result] = await engine.lintText(code, { filePath, warnIgnored: true });
  return result.messages.filter((message) => message.ruleId === RULE);
}

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
    ["tests/sample-internal.test.ts", `import { lockQuotedRows } from "@/modules/billing/application/monthly-invoice/issue-locks";\nvoid lockQuotedRows;\n`],
    ["tests/sample-internal-type.test.ts", `import type { MonthlyIssueResult } from "@/modules/billing/application/monthly-invoice/replay";\nexport type R = MonthlyIssueResult;\n`],
    ["scripts/sample-internal.ts", `import { replayByPeriod } from "../src/modules/billing/application/monthly-invoice/replay";\nvoid replayByPeriod;\n`],
    ["src/lib/sample-internal.ts", `export { loadInvoice } from "@/modules/billing/application/monthly-invoice/issued-reads";\n`],
    ["src/app/api/v1/owner/sample/route.ts", `import { buildMonthlyInvoiceOptions } from "@/modules/billing/application/monthly-invoice/quote";\nvoid buildMonthlyInvoiceOptions;\n`],
    ["src/components/owner-dashboard/SampleInternal.tsx", `import { lockIssuanceScope } from "@/modules/billing/application/monthly-invoice/issue-locks";\nvoid lockIssuanceScope;\n`],
    ["src/modules/billing/application/sample-sibling.ts", `import { replayByIdempotencyKey } from "./monthly-invoice/replay";\nvoid replayByIdempotencyKey;\n`],
    ["src/modules/billing/application/nested/sample.ts", `import { loadInvoice } from "../monthly-invoice/issued-reads";\nvoid loadInvoice;\n`],
    ["src/modules/billing/domain/sample.ts", `import { lockQuotedRows } from "../application/monthly-invoice/issue-locks";\nvoid lockQuotedRows;\n`],
  ])("rechaza importar monthly-invoice/* desde %s", async (filePath, code) => {
    const messages = await restrictedImports(filePath, code);
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].message).toContain(FACADE_SPECIFIER);
    expect(messages[0].message).toContain("issueMonthlyInvoice");
  });

  it.each([
    ["tests/sample-facade.test.ts"],
    ["scripts/sample-facade.ts"],
    ["src/app/api/v1/owner/sample-facade/route.ts"],
    ["src/components/owner-dashboard/SampleFacade.tsx"],
  ])("permite la fachada desde %s", async (filePath) => {
    const messages = await restrictedImports(
      filePath,
      `import { issueMonthlyInvoice } from "${FACADE_SPECIFIER}";\nvoid issueMonthlyInvoice;\n`
    );
    expect(messages).toEqual([]);
  });

  it("permite que la fachada y los módulos internos se importen entre sí", async () => {
    expect(
      await restrictedImports(
        FACADE,
        `export { issueMonthlyInvoice } from "./monthly-invoice/issue";\n`
      )
    ).toEqual([]);
    expect(
      await restrictedImports(
        `${INTERNAL_DIR}issue.ts`,
        `import { buildMonthlyInvoiceOptions } from "./quote";\nimport { loadInvoice } from "@/modules/billing/application/monthly-invoice/issued-reads";\nvoid buildMonthlyInvoiceOptions;\nvoid loadInvoice;\n`
      )
    ).toEqual([]);
  });

  it("mantiene la restricción del esquema heredado en el código canónico, la fachada y los módulos internos", async () => {
    for (const filePath of [
      "src/app/api/v1/owner/sample-legacy/route.ts",
      FACADE,
      `${INTERNAL_DIR}quote.ts`,
    ]) {
      const messages = await restrictedImports(
        filePath,
        `import { athletes } from "@/db/schema";\nvoid athletes;\n`
      );
      expect(messages, filePath).toHaveLength(1);
      expect(messages[0].severity, filePath).toBe(2);
    }
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

/** Import, re-export, dynamic import and vi.mock / vi.doMock specifiers. */
function specifiers(source: string): string[] {
  return [
    ...source.matchAll(
      /(?:\bfrom|\bimport|\bvi\.(?:do)?[mM]ock)\s*\(?\s*["']([^"']+)["']/g
    ),
  ].map((match) => match[1]);
}

/** Same targets as the ESLint pattern group. */
function isInternalSpecifier(specifier: string): boolean {
  return (
    /(?:^|\/)billing\/application\/monthly-invoice$/.test(specifier) ||
    /(?:^|\/)monthly-invoice\//.test(specifier)
  );
}

describe("monthly-invoice internal boundary (fuentes)", () => {
  const files = ["src", "tests", "scripts"]
    .flatMap((root) => sourceFiles(join(process.cwd(), root)))
    .map((file) => relative(process.cwd(), file).split(sep).join("/"));

  it("recorre src, tests y scripts", () => {
    expect(files.some((file) => file.startsWith("tests/"))).toBe(true);
    expect(files.some((file) => file.startsWith("scripts/"))).toBe(true);
    expect(files).toContain(FACADE);
  });

  it("solo la fachada y los módulos internos importan monthly-invoice/*", () => {
    const violations = files
      .filter(
        (file) =>
          file !== FACADE &&
          !file.startsWith(INTERNAL_DIR) &&
          !(file in ALLOWED_INTERNAL_IMPORTERS)
      )
      .flatMap((file) =>
        specifiers(readFileSync(join(process.cwd(), file), "utf8"))
          .filter(isInternalSpecifier)
          .map((specifier) => `${file}: ${specifier}`)
      );
    expect(violations).toEqual([]);
  });

  it("reconoce las formas de importación", () => {
    expect(
      specifiers(
        `import a from "x";\nexport { b } from "y";\nconst c = await import("z");\nvi.mock("w", () => ({}));\nvi.doMock('v');\n`
      )
    ).toEqual(["x", "y", "z", "w", "v"]);
    expect(isInternalSpecifier("@/modules/billing/application/monthly-invoice/quote")).toBe(true);
    expect(isInternalSpecifier("./monthly-invoice/quote")).toBe(true);
    expect(isInternalSpecifier("../src/modules/billing/application/monthly-invoice")).toBe(true);
    expect(isInternalSpecifier(FACADE_SPECIFIER)).toBe(false);
    expect(isInternalSpecifier("@/components/owner-dashboard/monthly-invoice-retry-storage")).toBe(false);
    expect(isInternalSpecifier("/api/v1/owner/billing/monthly-invoices/issue")).toBe(false);
  });
});
