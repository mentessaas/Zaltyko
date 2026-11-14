import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn(), fetch: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES, CANONICAL_EXPORT_TABLES, EXCLUDED_CANONICAL_SCOPED_TABLES,
  EXCLUDED_CANONICAL_TABLES, OPTIONAL_DISCOVERY_EXPORT_TABLES, OPTIONAL_INCLUDED_EXPORT_TABLES, OPTIONAL_TEAM_ACCESS_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";
import { activatedCatalogRows, activatedRowsByTable } from "./helpers/activated-module-rows";
import { planCanonicalAcademyDisposition } from "@/modules/data-rights/application/plan-canonical-academy-disposition";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";
import { CanonicalDispositionPlanError, type CanonicalDispositionInput } from "@/modules/data-rights/domain/canonical-disposition-contract";

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;
const id = (n: number) => `20000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const organizationId = id(1);
const marker = "SYNTHETIC_PRIVATE_DISPOSITION_VALUE_784e";
const timestamp = "2026-11-06 12:00:00.123456+00";

function fixture(): Rows {
  const dates = { created_at: timestamp, updated_at: timestamp };
  return {
    organizations: [{ id: organizationId, name: marker, legal_name: null, status: "active", country_code: "ES", default_currency: "EUR", default_timezone: "Europe/Madrid", ...dates }],
    locations: [10, 11].map((n) => ({ id: id(n), organization_id: organizationId, code: `synthetic-${n}`, name: marker, timezone: "Europe/Madrid", is_active: true, ...dates })),
    people: [{ id: id(20), organization_id: organizationId, given_name: marker, family_name: "Synthetic", preferred_name: null, date_of_birth: null, ...dates }],
    athletes: [{ id: id(30), organization_id: organizationId, person_id: id(20), external_reference: "https://example.invalid/private-synthetic-reference", is_active: false, ...dates }],
  };
}

async function archive(options: { discovery?: boolean; team?: boolean; activated?: boolean; counts?: Record<string, number | string> } = {}): Promise<string> {
  const rows: Rows = { ...fixture(), ...(options.activated ? activatedRowsByTable(organizationId) : {}) };
  const included = [...CANONICAL_EXPORT_TABLES, ...(options.activated ? OPTIONAL_INCLUDED_EXPORT_TABLES : [])];
  const optional = [...(options.discovery ? OPTIONAL_DISCOVERY_EXPORT_TABLES : []), ...(options.team ? OPTIONAL_TEAM_ACCESS_EXPORT_TABLES : [])];
  for (let i = 0; i < 4; i++) mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.execute
    .mockResolvedValueOnce({ rows: [{ organization_status: "active", member_status: "active", role: "owner", location_scope_mode: "all" }] })
    .mockResolvedValueOnce({ rows: [
      ...ALL_KNOWN_CANONICAL_TABLE_NAMES.flatMap((table_name) => {
        const spec = CANONICAL_EXPORT_TABLES.find((entry) => entry.name === table_name);
        return (spec?.expectedColumns ?? ["id"]).map((column_name) => ({ table_name, column_name, data_type: "text" }));
      }),
      ...optional.flatMap((table) => table.columns.map((column_name) => ({ table_name: table.table, column_name, data_type: "text" }))),
      ...(options.activated ? activatedCatalogRows() : []),
    ] })
    .mockResolvedValueOnce({ rows: [{ snapshot_at: "2026-11-06T12:00:00.000Z" }] })
    .mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...optional.map((table) => table.table)].map((table_name) => ({ table_name, row_count: options.counts?.[table_name] ?? 0 })) })
    .mockResolvedValueOnce({ rows: included.map((table) => ({ table_name: table.name, row_count: (rows[table.name] ?? []).length, estimated_bytes: (rows[table.name] ?? []).length * 128 })) });
  for (const table of included) {
    if (rows[table.name]?.length) mocks.execute.mockResolvedValueOnce({ rows: rows[table.name] });
  }
  return (await exportCanonicalAcademyData({ userId: id(2), organizationId })).body;
}

/** Reseal adversarial fixtures so semantic checks cannot pass on hash failure. */
function reseal(body: string, change: (archive: { data: Rows; coverage: { includedRowCount: number; includedTables: Array<{ table: string; rowCount: number; checksumSha256: string }>; excludedTables: Array<Record<string, unknown>> } }) => void): string {
  const value = JSON.parse(body);
  change(value);
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  value.coverage.includedRowCount = 0;
  for (const table of value.coverage.includedTables) {
    const rows = value.data[table.table] as Row[];
    table.rowCount = rows.length;
    table.checksumSha256 = digest(rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
    value.coverage.includedRowCount += rows.length;
  }
  const { integrity, ...base } = value;
  return JSON.stringify({ ...base, integrity: { ...integrity, bundleChecksumSha256: digest(JSON.stringify(base)) } });
}

function plan(body: string) {
  const input = Object.freeze({ body, organizationId });
  const before = JSON.stringify(input);
  const calls = [mocks.transaction.mock.calls.length, mocks.execute.mock.calls.length, mocks.fetch.mock.calls.length];
  const result = planCanonicalAcademyDisposition(input);
  expect(JSON.stringify(input)).toBe(before);
  expect([mocks.transaction.mock.calls.length, mocks.execute.mock.calls.length, mocks.fetch.mock.calls.length]).toEqual(calls);
  return result;
}

function refused(input: unknown) {
  const calls = [mocks.transaction.mock.calls.length, mocks.execute.mock.calls.length, mocks.fetch.mock.calls.length];
  try {
    planCanonicalAcademyDisposition(input as CanonicalDispositionInput);
    throw new Error("Expected refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(CanonicalDispositionPlanError);
    expect(String(error)).not.toContain(marker);
    expect(String(error)).not.toContain(organizationId);
    expect(String(error)).not.toContain("example.invalid");
  }
  expect([mocks.transaction.mock.calls.length, mocks.execute.mock.calls.length, mocks.fetch.mock.calls.length]).toEqual(calls);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(() => { throw new Error("Unexpected database access"); });
  mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) => callback({ execute: mocks.execute }));
  mocks.fetch.mockImplementation(() => { throw new Error("Unexpected network access"); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("pure canonical disposition review plan", () => {
  it("builds a deterministic metadata-only plan from the unmodified real generator, never approval", async () => {
    const body = await archive();
    const result = plan(body);
    expect(result).toMatchObject({ status: "blocked", partial: true, executable: false, restorable: false, authenticityVerified: false, authorizationVerified: false, currentStateVerified: false, sourceCompletenessVerified: false, archiveChecksumsVerified: true, projectedSourceRelations: "consistent", projectedSourceUniqueness: "consistent" });
    expect(plan(body)).toEqual(result);
    expect(result.tables.filter((table) => table.coverage === "projected_values")).toHaveLength(46);
    expect(result.tables.find((table) => table.table === "people")).toMatchObject({ rowCount: 1, countEvidence: "projected_archive_rows" });
    expect(result.tables.find((table) => table.table === "organization_members")?.missingDecisions).toContain("shared_identity_scope");
    expect(result.tables.find((table) => table.table === "invoices")?.missingDecisions).toContain("financial_history_and_provider_effects");
    expect(result.tables.find((table) => table.table === "waitlist_entries")?.missingDecisions).toContain("nested_content_classification");
    for (const item of [...result.tables, ...result.sources]) {
      expect(item).toMatchObject({ decision: "pending", eligibleForDeletion: false, hold: "unknown", retention: "unknown" });
      expect(item.missingDecisions).toContain("hold_status_and_release");
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toMatch(/[0-9a-f]{64}/i);
    expect(result.dependencyDiagnostics.every((entry) => !("sampleRowOrdinals" in entry))).toBe(true);
  });

  it("keeps declared zero, uncounted shared sources and unreported modules distinct", async () => {
    const result = plan(await archive());
    expect(result.tables.find((table) => table.table === "organization_entitlement_changes")).toMatchObject({ rowCount: 0, coverage: "excluded_values", countEvidence: "declared_organization_count", eligibleForDeletion: false, hold: "unknown" });
    expect(result.tables.find((table) => table.table === "owner_signup_consents")).toMatchObject({ rowCount: null, countEvidence: "unknown" });
    for (const optional of [...OPTIONAL_DISCOVERY_EXPORT_TABLES, ...OPTIONAL_TEAM_ACCESS_EXPORT_TABLES]) {
      expect(result.tables.find((table) => table.table === optional.table)).toMatchObject({ rowCount: null, coverage: "optional_not_reported", countEvidence: "optional_not_reported" });
    }
    expect(result.sources).toHaveLength(6);
    expect(result.sources.every((source) => source.rowCount === null)).toBe(true);
    expect(result.sources.filter((source) => source.coverage === "external_uninventoried")).toHaveLength(3);
    expect(result.blockers).toContain("retention_and_holds_unresolved");
  });

  it.each([[true, false], [false, true], [true, true]] as const)("handles independently reported discovery=%s/team=%s without changing eligibility", async (discovery, team) => {
    const result = plan(await archive({ discovery, team }));
    for (const [group, present] of [[OPTIONAL_DISCOVERY_EXPORT_TABLES, discovery], [OPTIONAL_TEAM_ACCESS_EXPORT_TABLES, team]] as const) {
      for (const table of group) {
        expect(result.tables.find((entry) => entry.table === table.table)).toMatchObject({ rowCount: present ? 0 : null, countEvidence: present ? "declared_organization_count" : "optional_not_reported", eligibleForDeletion: false });
      }
    }
  });

  it("projects activated modules when the archive carries them and never reports them as zero otherwise", async () => {
    const absent = plan(await archive());
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) {
      expect(absent.tables.find((entry) => entry.table === table.name)).toMatchObject({ rowCount: null, coverage: "optional_not_reported", countEvidence: "optional_not_reported", eligibleForDeletion: false });
    }
    const present = plan(await archive({ activated: true }));
    expect(present.tables.filter((table) => table.coverage === "projected_values")).toHaveLength(46 + OPTIONAL_INCLUDED_EXPORT_TABLES.length);
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) {
      expect(present.tables.find((entry) => entry.table === table.name)).toMatchObject({ rowCount: 1, coverage: "projected_values", countEvidence: "projected_archive_rows", decision: "pending", eligibleForDeletion: false, retention: "unknown" });
    }
    expect(present.tables.find((entry) => entry.table === "admission_links")?.omittedColumns).toEqual(["token"]);
    expect(present.tables.find((entry) => entry.table === "admission_links")?.missingDecisions).toContain("excluded_values_and_delivery_channel");
    const serialized = JSON.stringify(present);
    expect(serialized).not.toContain("family@example.invalid");
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("preserves exact excluded int8 counts without Number conversion", async () => {
    const result = plan(await archive({ counts: { audit_log: "9223372036854775807" } }));
    expect(result.tables.find((table) => table.table === "audit_log")?.rowCount).toBe("9223372036854775807");
  });

  it("surfaces a resealed orphan through the existing projected dependency checks", async () => {
    const body = reseal(await archive(), (value) => { value.data.people = []; });
    expect(validateCanonicalAcademyArchive({ body, organizationId }).valid).toBe(true);
    const result = plan(body);
    expect(result.projectedSourceRelations).toBe("violations");
    expect(result.dependencyDiagnostics).toContainEqual(expect.objectContaining({ table: "athletes", code: "foreign_key_missing", occurrences: 1 }));
    expect(result.executable).toBe(false);
  });

  it("does not turn an empty archive into a deletion certificate and preserves the missing-root diagnostic", async () => {
    const body = reseal(await archive(), (value) => {
      for (const table of Object.keys(value.data)) value.data[table] = [];
    });
    expect(validateCanonicalAcademyArchive({ body, organizationId }).valid).toBe(true);
    const result = plan(body);
    expect(result.projectedSourceRelations).toBe("violations");
    expect(result.dependencyDiagnostics.some((issue) => issue.code === "organization_root_missing")).toBe(true);
    expect(result.tables.filter((table) => table.coverage === "projected_values").every((table) => table.rowCount === 0 && !table.eligibleForDeletion)).toBe(true);
    expect(result.currentStateVerified).toBe(false);
    expect(result.executable).toBe(false);
  });

  it("surfaces resealed uniqueness conflicts instead of hiding them behind blocked status", async () => {
    const body = reseal(await archive(), (value) => { value.data.locations![1]!.code = value.data.locations![0]!.code; });
    expect(validateCanonicalAcademyArchive({ body, organizationId }).valid).toBe(true);
    const result = plan(body);
    expect(result.projectedSourceUniqueness).toBe("violations");
    expect(result.dependencyDiagnostics.some((issue) => issue.code === "source_unique_collision")).toBe(true);
  });

  it("rejects tampering and foreign organization scope, including resealed row tampering", async () => {
    const body = await archive();
    refused({ body: body.replace(marker, "ALTERED_SYNTHETIC_VALUE"), organizationId });
    refused({ body, organizationId: id(99) });
    const foreign = reseal(body, (value) => { value.data.people![0]!.organization_id = id(99); });
    refused({ body: foreign, organizationId });
  });

  it("rejects a resealed partial optional module rather than treating its missing table as zero", async () => {
    const body = reseal(await archive({ team: true }), (value) => {
      value.coverage.excludedTables = value.coverage.excludedTables.filter((table) => table.table !== "organization_member_invitation_scopes");
    });
    refused({ body, organizationId });
  });

  it.each([{ authorized: true }, { retention: false }, { hold: false }, { destination: {} }, { execute: true }])("rejects caller-supplied authority or policy %j", async (extra) => {
    refused({ body: await archive(), organizationId, ...extra });
  });

  it("rejects malformed input and accessor/symbol fields without evaluating them", async () => {
    const body = await archive();
    for (const input of [null, [], "private", { body }, { body: 1, organizationId }, { body: "{}", organizationId }]) refused(input);
    const accessor = vi.fn(() => body);
    const input = { organizationId, get body() { return accessor(); } };
    refused(input);
    expect(accessor).not.toHaveBeenCalled();
    refused({ body, organizationId, [Symbol("authorized")]: true });
  });

  it("fails closed on an unreviewed exclusion category without mutating catalog policy", async () => {
    const body = await archive();
    const entry = EXCLUDED_CANONICAL_TABLES[0]!;
    const previous = entry.category;
    try {
      entry.category = "unreviewed_synthetic_category";
      refused({ body, organizationId });
    } finally { entry.category = previous; }
    expect(plan(body).status).toBe("blocked");
  });
});
