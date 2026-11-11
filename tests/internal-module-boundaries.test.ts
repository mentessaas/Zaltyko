import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Contract for the internal-module boundaries in eslint.config.mjs, defined in
 * eslint.internal-boundaries.json: for each split service, only its facade and
 * the modules of its directory may import those modules (monthly-invoice:
 * issuance lock order; reconciliation: lease, fencing and lock order;
 * athlete-progress: authorization by role, site and athlete, dormant-storage
 * detection and one transaction per operation).
 *
 * Three layers:
 * - The real ESLint configuration, through the ESLint API, on sample files. It
 *   fails if a rule disappears, becomes a warning, stops matching an import
 *   form, or is overridden by a later config object (no-restricted-imports and
 *   no-restricted-syntax options do not merge).
 * - The boundary definitions and reviewed exceptions in
 *   eslint.internal-boundaries.json.
 * - A scan of the repository sources that resolves every specifier against
 *   its file. `pnpm lint` in CI only lints src/ and the root files, so this is
 *   the barrier for tests/ and scripts/, and it also covers the relative paths
 *   and template specifiers ESLint cannot resolve.
 */

const BOUNDARIES_FILE = "eslint.internal-boundaries.json";
/** Root files linted by `lint:app` (package.json). */
const ROOT_FILE = /^(?:middleware\.ts|instrumentation[^/]*\.ts|sentry\.[^/]*\.ts)$/;
/** This file embeds internal specifiers as text for the ESLint samples. */
const SELF = "tests/internal-module-boundaries.test.ts";

type Exception = { file: string; reason: string };
type Boundary = {
  name: string;
  dir: string;
  facade: string;
  facadeSpecifier: string;
  message: string;
  exceptions: Exception[];
};
function readBoundaries(): Boundary[] {
  const parsed = JSON.parse(
    readFileSync(join(process.cwd(), BOUNDARIES_FILE), "utf8")
  ) as { boundaries?: unknown };
  expect(Array.isArray(parsed.boundaries), BOUNDARIES_FILE).toBe(true);
  return parsed.boundaries as Boundary[];
}
function boundaryNamed(name: string): Boundary {
  const boundary = readBoundaries().find((candidate) => candidate.name === name);
  if (!boundary) throw new Error(`Missing boundary ${name} in ${BOUNDARIES_FILE}`);
  return boundary;
}

const MONTHLY = boundaryNamed("monthly-invoice");
const RECONCILIATION = boundaryNamed("reconciliation");
const ATHLETE_PROGRESS = boundaryNamed("athlete-progress");
const INTERNAL_DIR = MONTHLY.dir;
const FACADE = MONTHLY.facade;
const FACADE_SPECIFIER = MONTHLY.facadeSpecifier;

type LintMessage = { ruleId: string | null; severity: number; message: string };
type LintEngine = {
  lintText(
    code: string,
    options: { filePath: string; warnIgnored?: boolean }
  ): Promise<Array<{ messages: LintMessage[] }>>;
};

let engine: LintEngine;

async function boundaryMessages(
  filePath: string,
  code: string,
  facadeSpecifier = FACADE_SPECIFIER
) {
  const [result] = await engine.lintText(code, { filePath, warnIgnored: true });
  return result.messages.filter(
    (message) =>
      (message.ruleId === "no-restricted-imports" ||
        message.ruleId === "no-restricted-syntax") &&
      message.message.includes(facadeSpecifier)
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

type LintCase = [filePath: string, code: string, ruleId: "no-restricted-imports" | "no-restricted-syntax"];

/**
 * The same import forms the monthly-invoice matrix checks, generated for
 * another boundary: static imports and re-exports from every lint:app root,
 * the exact relative spellings of each scope, and every dynamic form
 * (import(), template literals without expressions, require(), import x =
 * require(), vi.mock / vi.doMock / vi.importActual / vi.importMock).
 */
function parityCases(boundary: Boundary, internalModule: string, label: string): LintCase[] {
  const alias = `@/${boundary.dir.slice("src/".length)}`;
  const [, , moduleName, layer, name] = boundary.dir.split("/");
  const moduleRoot = `src/modules/${moduleName}`;
  const layerDir = `${moduleRoot}/${layer}`;
  const target = `${alias}/${internalModule}`;
  const fromScripts = `../${boundary.dir}`;
  const imports = "no-restricted-imports" as const;
  const syntax = "no-restricted-syntax" as const;
  const use = "import { x } from";
  return [
    [`tests/sample-${label}.test.ts`, `${use} "${target}";\nvoid x;\n`, imports],
    [`tests/sample-${label}-type.test.ts`, `import type { T } from "${target}";\nexport type R = T;\n`, imports],
    [`tests/sample-${label}-index.test.ts`, `import * as internals from "${alias}/index";\nvoid internals;\n`, imports],
    [`tests/sample-${label}-dir.test.ts`, `import * as internals from "${alias}";\nvoid internals;\n`, imports],
    [`scripts/sample-${label}.ts`, `${use} "${fromScripts}/${internalModule}";\nvoid x;\n`, imports],
    [`scripts/sample-${label}.mjs`, `${use} "${fromScripts}/${internalModule}.ts";\nvoid x;\n`, imports],
    [`src/lib/sample-${label}.ts`, `export { x } from "${target}";\n`, imports],
    [`src/lib/sample-${label}-star.ts`, `export * from "${target}";\n`, imports],
    [`src/lib/sample-${label}-star-ns.ts`, `export * as internals from "${target}";\n`, imports],
    [`src/lib/sample-${label}.js`, `${use} "${target}";\nvoid x;\n`, imports],
    [`src/app/api/v1/owner/sample-${label}/route.ts`, `${use} "${target}";\nvoid x;\n`, imports],
    [`src/components/owner-dashboard/Sample${label}.tsx`, `${use} "${target}";\nvoid x;\n`, imports],
    ...["middleware.ts", "instrumentation.ts", "instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"].map(
      (file): LintCase => [file, `${use} "${target}";\nvoid x;\n`, imports]
    ),
    [`${moduleRoot}/sample-${label}.ts`, `${use} "./${layer}/${name}/${internalModule}";\nvoid x;\n`, imports],
    [`${moduleRoot}/domain/sample-${label}.ts`, `${use} "../${layer}/${name}/${internalModule}";\nvoid x;\n`, imports],
    [`${layerDir}/sample-${label}-sibling.ts`, `${use} "./${name}/${internalModule}";\nvoid x;\n`, imports],
    [`${layerDir}/sample-${label}-sibling-dir.ts`, `import * as internals from "./${name}";\nvoid internals;\n`, imports],
    [`${layerDir}/nested/sample-${label}.ts`, `${use} "../${name}/${internalModule}";\nvoid x;\n`, imports],
    [`tests/sample-${label}-dynamic.test.ts`, `export const load = () => import("${target}");\n`, syntax],
    [`tests/sample-${label}-dynamic-template.test.ts`, "export const load = () => import(`" + target + "`);\n", syntax],
    [`scripts/sample-${label}-require.cjs`, `const { x } = require("${fromScripts}/${internalModule}");\nvoid x;\n`, syntax],
    [`scripts/sample-${label}-require-template.ts`, "const internals = require(`" + fromScripts + "`);\nvoid internals;\n", syntax],
    [`scripts/sample-${label}-import-equals.ts`, `import internals = require("${fromScripts}/${internalModule}");\nvoid internals;\n`, syntax],
    [`tests/sample-${label}-mock.test.ts`, `vi.mock("${target}", () => ({}));\n`, syntax],
    [`tests/sample-${label}-do-mock.test.ts`, `vi.doMock("${target}");\n`, syntax],
    [`tests/sample-${label}-import-actual.test.ts`, `export const actual = () => vi.importActual("${target}");\n`, syntax],
    [`tests/sample-${label}-import-mock.test.ts`, `export const mocked = () => vi.importMock("${target}");\n`, syntax],
    [`${layerDir}/sample-${label}-dynamic.ts`, `export const load = () => import("./${name}/${internalModule}");\n`, syntax],
  ];
}

describe("internal-module boundaries (ESLint)", { timeout: 120_000 }, () => {
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

  // -------------------------------------------------------------------------
  // reconciliation/* (saas-billing) and the two boundaries together
  // -------------------------------------------------------------------------

  const REC = "@/modules/saas-billing/application/reconciliation";
  const REC_FACADE = RECONCILIATION.facadeSpecifier;

  it.each([
    ["tests/sample-rec.test.ts", `import { lockClaimedState } from "${REC}/lease";\nvoid lockClaimedState;\n`, "no-restricted-imports"],
    ["tests/sample-rec-type.test.ts", `import type { DecisionRecord } from "${REC}/model";\nexport type D = DecisionRecord;\n`, "no-restricted-imports"],
    ["tests/sample-rec-dir.test.ts", `import * as internals from "${REC}";\nvoid internals;\n`, "no-restricted-imports"],
    ["scripts/sample-rec.ts", `import { applyDecision } from "../src/modules/saas-billing/application/reconciliation/apply";\nvoid applyDecision;\n`, "no-restricted-imports"],
    ["src/lib/sample-rec-star.ts", `export * from "${REC}/consumer";\n`, "no-restricted-imports"],
    ["src/app/api/v1/admin/saas/webhooks/[eventId]/reconciliation/sample/route.ts", `import { claimsFrom } from "${REC}/preview-token";\nvoid claimsFrom;\n`, "no-restricted-imports"],
    ["middleware.ts", `import { finishEvent } from "${REC}/lease";\nvoid finishEvent;\n`, "no-restricted-imports"],
    ["src/modules/saas-billing/sample.ts", `import { applyDecision } from "./application/reconciliation/apply";\nvoid applyDecision;\n`, "no-restricted-imports"],
    ["src/modules/saas-billing/domain/sample.ts", `import { lockClaimedState } from "../application/reconciliation/lease";\nvoid lockClaimedState;\n`, "no-restricted-imports"],
    ["src/modules/saas-billing/application/sample-sibling.ts", `import { closeStaleDecision } from "./reconciliation/outcomes";\nvoid closeStaleDecision;\n`, "no-restricted-imports"],
    ["src/modules/saas-billing/application/nested/sample.ts", `import * as internals from "../reconciliation";\nvoid internals;\n`, "no-restricted-imports"],
    ["tests/sample-rec-dynamic.test.ts", `export const load = () => import("${REC}/lease");\n`, "no-restricted-syntax"],
    ["tests/sample-rec-mock.test.ts", `vi.mock("${REC}/lease", () => ({}));\n`, "no-restricted-syntax"],
    ["scripts/sample-rec-require.cjs", `const { scheduleRetry } = require("../src/modules/saas-billing/application/reconciliation/lease");\nvoid scheduleRetry;\n`, "no-restricted-syntax"],
    ["src/modules/saas-billing/application/sample-rec-dynamic.ts", `export const load = () => import("./reconciliation/apply");\n`, "no-restricted-syntax"],
    // A monthly-invoice internal module still cannot reach reconciliation/*.
    [`${INTERNAL_DIR}/issue.ts`, `import { lockClaimedState } from "${REC}/lease";\nvoid lockClaimedState;\n`, "no-restricted-imports"],
    [`${INTERNAL_DIR}/issue.ts`, `export const load = () => import("${REC}/apply");\n`, "no-restricted-syntax"],
  ])("rechaza reconciliation/* desde %s", async (filePath, code, ruleId) => {
    const messages = await boundaryMessages(filePath, code, REC_FACADE);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(ruleId);
    expect(messages[0].severity).toBe(2);
    expect(messages[0].message).toContain("consumeSaasReconciliationBatch");
  });

  it.each([
    [`${RECONCILIATION.dir}/apply.ts`, `import { lockQuotedRows } from "${INTERNAL}/issue-locks";\nvoid lockQuotedRows;\n`, "no-restricted-imports"],
    [`${RECONCILIATION.dir}/apply.ts`, `export const load = () => import("${INTERNAL}/quote");\n`, "no-restricted-syntax"],
    [RECONCILIATION.facade, `export * from "${INTERNAL}/issue";\n`, "no-restricted-imports"],
  ])("un módulo de reconciliation tampoco alcanza monthly-invoice/* (%s)", async (filePath, code, ruleId) => {
    const messages = await boundaryMessages(filePath, code);
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(ruleId);
    expect(messages[0].severity).toBe(2);
  });

  it.each([
    ["tests/sample-rec-facade.test.ts", `import { consumeSaasReconciliationBatch } from "${REC_FACADE}";\nvoid consumeSaasReconciliationBatch;\nvi.mock("${REC_FACADE}");\n`],
    ["src/app/api/v1/admin/saas/webhooks/[eventId]/reconciliation/sample-facade/route.ts", `import { previewSaasReconciliation } from "${REC_FACADE}";\nimport { noStore } from "../route-utils";\nvoid previewSaasReconciliation;\nvoid noStore;\n`],
    ["src/modules/saas-billing/application/sample-time.ts", `import { sameInstant } from "./reconciliation-time";\nexport * from "./reconciliation-service";\nvoid sameInstant;\n`],
    [RECONCILIATION.facade, `export * from "./reconciliation/consumer";\nexport { previewSaasReconciliation } from "${REC}/preview";\n`],
    [`${RECONCILIATION.dir}/apply.ts`, `import { lockClaimedState } from "./lease";\nimport type { DecisionRecord } from "${REC}/model";\nexport const load = () => import("./outcomes");\nvoid lockClaimedState;\nexport type D = DecisionRecord;\n`],
  ])("permite la fachada de reconciliation y sus módulos entre sí (%s)", async (filePath, code) => {
    expect(await boundaryMessages(filePath, code, REC_FACADE)).toEqual([]);
  });

  it("mantiene el esquema heredado en reconciliation/* y respeta la excepción revisada de operator.ts", async () => {
    const messages = await legacySchemaMessages(
      `${RECONCILIATION.dir}/reads.ts`,
      `import { athletes } from "@/db/schema";\nvoid athletes;\n`
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].severity).toBe(2);

    const operator = `${RECONCILIATION.dir}/operator.ts`;
    const source = readFileSync(join(process.cwd(), operator), "utf8");
    expect(source).toContain('from "@/db/schema/profiles"');
    expect(await legacySchemaMessages(operator, source)).toEqual([]);
    expect(await boundaryMessages(operator, source, REC_FACADE)).toEqual([]);
  });

  it("la matriz de paridad cubre las mismas formas que monthly-invoice", () => {
    const cases = parityCases(RECONCILIATION, "lease", "parity");
    expect(cases).toHaveLength(32);
    const codes = cases.map(([, code]) => code).join("\n");
    for (const form of ["vi.importActual(", "vi.importMock(", "vi.doMock(", "import(`", "require(`", "import internals = require("]) {
      expect(codes, form).toContain(form);
    }
  });

  it.each(parityCases(RECONCILIATION, "lease", "rec-parity"))(
    "rechaza reconciliation/* con todas las formas desde %s",
    async (filePath, code, ruleId) => {
      const messages = await boundaryMessages(filePath, code, REC_FACADE);
      expect(messages, code).toHaveLength(1);
      expect(messages[0].ruleId).toBe(ruleId);
      expect(messages[0].severity).toBe(2);
    }
  );

  // -------------------------------------------------------------------------
  // athlete-progress/* (P2 #17) and the three boundaries together
  // -------------------------------------------------------------------------

  const AP = "@/modules/athlete-progress/application/athlete-progress";
  const AP_FACADE = ATHLETE_PROGRESS.facadeSpecifier;

  it.each(parityCases(ATHLETE_PROGRESS, "access", "ap"))(
    "rechaza athlete-progress/* desde %s",
    async (filePath, code, ruleId) => {
      const messages = await boundaryMessages(filePath, code, AP_FACADE);
      expect(messages, code).toHaveLength(1);
      expect(messages[0].ruleId).toBe(ruleId);
      expect(messages[0].severity).toBe(2);
      expect(messages[0].message).toContain("athlete-progress/* es interno");
    }
  );

  it.each([
    // Las fronteras de monthly-invoice y reconciliation siguen vigentes dentro de athlete-progress/*.
    [`${ATHLETE_PROGRESS.dir}/access.ts`, `import { lockQuotedRows } from "${INTERNAL}/issue-locks";\nvoid lockQuotedRows;\n`, FACADE_SPECIFIER, "no-restricted-imports"],
    [`${ATHLETE_PROGRESS.dir}/reads.ts`, `export const load = () => vi.importActual("${INTERNAL}/quote");\n`, FACADE_SPECIFIER, "no-restricted-syntax"],
    [ATHLETE_PROGRESS.facade, `export * from "${REC}/lease";\n`, REC_FACADE, "no-restricted-imports"],
    [`${ATHLETE_PROGRESS.dir}/storage.ts`, `export const load = () => import("${REC}/apply");\n`, REC_FACADE, "no-restricted-syntax"],
    // Y los módulos internos de las otras fronteras no alcanzan athlete-progress/*.
    [`${INTERNAL_DIR}/issue.ts`, `import { authorizeMember } from "${AP}/access";\nvoid authorizeMember;\n`, AP_FACADE, "no-restricted-imports"],
    [`${RECONCILIATION.dir}/apply.ts`, "export const load = () => import(`" + AP + "/reads`);\n", AP_FACADE, "no-restricted-syntax"],
    [RECONCILIATION.facade, `export * from "${AP}/storage";\n`, AP_FACADE, "no-restricted-imports"],
  ])("las tres fronteras se aplican entre sí (%s)", async (filePath, code, facadeSpecifier, ruleId) => {
    const messages = await boundaryMessages(filePath, code, facadeSpecifier);
    expect(messages, code).toHaveLength(1);
    expect(messages[0].ruleId).toBe(ruleId);
    expect(messages[0].severity).toBe(2);
  });

  it.each([
    ["tests/sample-ap-facade.test.ts", `import { getAthleteProgress } from "${AP_FACADE}";\nvoid getAthleteProgress;\nvi.mock("${AP_FACADE}");\n`],
    ["src/app/owner/sample-ap/page.tsx", `import { isAthleteProgressAvailableForPage } from "${AP_FACADE}";\nvoid isAthleteProgressAvailableForPage;\n`],
    ["src/app/api/v1/owner/sample-ap/route.ts", `import { createAthleteObjective } from "${AP_FACADE}";\nexport const load = () => import("${AP_FACADE}");\nvoid createAthleteObjective;\n`],
    // Dominio, infraestructura y el cliente de UI no son internos.
    ["src/components/owner-dashboard/SampleApClient.tsx", `import { OBJECTIVE_STATUSES } from "@/modules/athlete-progress/domain/athlete-progress";\nimport { fetchAthleteProgress } from "./owner-athlete-progress-client";\nvoid OBJECTIVE_STATUSES;\nvoid fetchAthleteProgress;\n`],
    ["src/modules/athlete-progress/domain/sample-ap.ts", `import { athleteObjectives } from "../infrastructure/athlete-progress-schema";\nexport * from "../application/athlete-progress-service";\nvoid athleteObjectives;\n`],
    ["src/modules/athlete-progress/application/sample-ap-sibling.ts", `export * from "./athlete-progress-service";\n`],
  ])("permite la fachada de athlete-progress y lo que no es interno (%s)", async (filePath, code) => {
    expect(await boundaryMessages(filePath, code, AP_FACADE)).toEqual([]);
  });

  it("permite que la fachada de athlete-progress y sus módulos internos se importen entre sí", async () => {
    expect(
      await boundaryMessages(
        ATHLETE_PROGRESS.facade,
        `export { getAthleteProgress } from "./athlete-progress/reads";\nexport * from "./athlete-progress/storage";\n`,
        AP_FACADE
      )
    ).toEqual([]);
    expect(
      await boundaryMessages(
        `${ATHLETE_PROGRESS.dir}/reads.ts`,
        `import { authorizeMember } from "./access";\nimport { isAthleteProgressStorageAvailable } from "${AP}/storage";\nexport const load = () => import("./objectives");\nvoid authorizeMember;\nvoid isAthleteProgressStorageAvailable;\n`,
        AP_FACADE
      )
    ).toEqual([]);
  });

  it("mantiene el esquema heredado en la fachada, los módulos internos y el dominio de athlete-progress", async () => {
    for (const filePath of [
      ATHLETE_PROGRESS.facade,
      `${ATHLETE_PROGRESS.dir}/access.ts`,
      "src/modules/athlete-progress/domain/sample-legacy.ts",
      "src/modules/athlete-progress/application/sample-legacy.ts",
    ]) {
      const messages = await legacySchemaMessages(filePath, `import { athletes } from "@/db/schema";\nvoid athletes;\n`);
      expect(messages, filePath).toHaveLength(1);
      expect(messages[0].severity, filePath).toBe(2);
    }
  });
});

describe("internal-module boundaries (definiciones y excepciones)", () => {
  it("define cada frontera con su directorio, fachada y mensaje", () => {
    const boundaries = readBoundaries();
    expect(boundaries.map((boundary) => boundary.name)).toEqual([
      "monthly-invoice",
      "reconciliation",
      "athlete-progress",
    ]);
    for (const boundary of boundaries) {
      expect(Object.keys(boundary).sort(), boundary.name).toEqual([
        "dir",
        "exceptions",
        "facade",
        "facadeSpecifier",
        "message",
        "name",
      ]);
      expect(boundary.dir, boundary.name).toMatch(/^src\/modules\/[^/]+\/[^/]+\/[^/]+$/);
      expect(boundary.dir.split("/").at(-1), boundary.name).toBe(boundary.name);
      expect(existsSync(join(process.cwd(), boundary.dir)), boundary.dir).toBe(true);
      expect(existsSync(join(process.cwd(), boundary.facade)), boundary.facade).toBe(true);
      expect(`src/${boundary.facadeSpecifier.slice(2)}.ts`, boundary.name).toBe(boundary.facade);
      expect(boundary.facadeSpecifier.startsWith("@/"), boundary.name).toBe(true);
      expect(boundary.message, boundary.name).toContain(boundary.facadeSpecifier);
      expect(boundary.message, boundary.name).toContain(`${boundary.name}/* es interno`);
      expect(Array.isArray(boundary.exceptions), boundary.name).toBe(true);
    }
  });

  it("solo admite excepciones de ficheros concretos de tests/ o scripts/ con motivo", () => {
    for (const exception of readBoundaries().flatMap((boundary) => boundary.exceptions)) {
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

function reachesDir(dir: string, file: string, specifier: string): boolean {
  const target = resolveSpecifier(file, specifier);
  return target !== null && (target === dir || target.startsWith(`${dir}/`));
}

function reachesInternalDir(file: string, specifier: string): boolean {
  return reachesDir(INTERNAL_DIR, file, specifier);
}

describe("internal-module boundaries (fuentes)", () => {
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

  it.each(readBoundaries().map((boundary) => [boundary.name, boundary] as const))(
    "solo la fachada, los módulos internos y las excepciones importan %s/*",
    (_name, boundary) => {
      const allowed = new Set([
        boundary.facade,
        SELF,
        ...boundary.exceptions.map((exception) => exception.file),
      ]);
      const violations = files
        .filter((file) => !allowed.has(file) && !file.startsWith(`${boundary.dir}/`))
        .flatMap((file) =>
          specifiers(readFileSync(join(process.cwd(), file), "utf8"))
            .filter((specifier) => reachesDir(boundary.dir, file, specifier))
            .map((specifier) => `${file}: ${specifier}`)
        );
      expect(violations).toEqual([]);
    }
  );

  it("encuentra los módulos internos de cada frontera", () => {
    for (const boundary of readBoundaries()) {
      expect(
        files.filter((file) => file.startsWith(`${boundary.dir}/`)).length,
        boundary.name
      ).toBeGreaterThan(1);
      expect(files, boundary.name).toContain(boundary.facade);
    }
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
    const reconciliation: Array<[string, string, boolean]> = [
      ["tests/x.test.ts", "@/modules/saas-billing/application/reconciliation/lease", true],
      ["src/modules/saas-billing/application/webhook-service.ts", "./reconciliation", true],
      ["src/modules/saas-billing/domain/x.ts", "../application/reconciliation/apply", true],
      ["tests/x.test.ts", RECONCILIATION.facadeSpecifier, false],
      ["src/modules/saas-billing/application/x.ts", "./reconciliation-time", false],
      [
        "src/app/api/v1/admin/saas/webhooks/[eventId]/reconciliation/confirm/route.ts",
        "../route-utils",
        false,
      ],
    ];
    for (const [file, specifier, expected] of reconciliation) {
      expect(reachesDir(RECONCILIATION.dir, file, specifier), `${file}: ${specifier}`).toBe(expected);
    }
    const athleteProgress: Array<[string, string, boolean]> = [
      ["tests/x.test.ts", "@/modules/athlete-progress/application/athlete-progress/access", true],
      ["tests/x.test.ts", "@/modules/athlete-progress/application/athlete-progress", true],
      ["src/modules/athlete-progress/application/x.ts", "./athlete-progress/storage", true],
      ["src/modules/athlete-progress/domain/x.ts", "../application/athlete-progress/reads", true],
      ["scripts/x.ts", "../src/modules/athlete-progress/application/athlete-progress/objectives", true],
      ["tests/x.test.ts", ATHLETE_PROGRESS.facadeSpecifier, false],
      ["src/modules/athlete-progress/application/x.ts", "./athlete-progress-service", false],
      ["src/components/owner-dashboard/x.tsx", "@/modules/athlete-progress/domain/athlete-progress", false],
      ["src/components/owner-dashboard/x.tsx", "./owner-athlete-progress-client", false],
      ["tests/x.test.ts", "@/modules/athlete-progress/infrastructure/athlete-progress-schema", false],
    ];
    for (const [file, specifier, expected] of athleteProgress) {
      expect(reachesDir(ATHLETE_PROGRESS.dir, file, specifier), `${file}: ${specifier}`).toBe(expected);
    }
  });
});
