import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn(), fetch: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import { ALL_KNOWN_CANONICAL_TABLE_NAMES, CANONICAL_EXPORT_TABLES, EXCLUDED_CANONICAL_SCOPED_TABLES } from "@/modules/data-rights/application/catalog";
import { CANONICAL_RECOVERY_POLICY } from "@/modules/data-rights/application/canonical-recovery-policy";
import { preflightCanonicalAcademyRecovery } from "@/modules/data-rights/application/preflight-canonical-academy-recovery";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";
import { CanonicalRecoveryPreflightError, type CanonicalRecoveryIssueCode } from "@/modules/data-rights/domain/canonical-recovery-contract";

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;
const id = (n: number): string => `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const organizationId = id(1);
const actorId = id(2);
const marker = "SYNTHETIC_PRIVATE_RECORD_VALUE_7d12a8";
const timestamp = "2026-11-05 12:00:00+00";

/** Synthetic projected rows only. Real generator supplies metadata and hashes. */
function row(table: string, key: number, values: Row = {}): Row {
  const spec = CANONICAL_EXPORT_TABLES.find((t) => t.name === table)!;
  return Object.fromEntries(spec.exportColumns.map((column) => {
    let value: unknown = marker;
    if (column === "id") value = id(key);
    else if (column === "organization_id") value = organizationId;
    else if (column.endsWith("_id")) value = id(9999);
    else if (column.startsWith("is_") || column.startsWith("can_") || column === "contactable") value = true;
    else if (["capacity", "capacity_override", "iso_weekday", "version", "priority", "quantity", "formula_version", "entitlement_revision"].includes(column)) value = 1;
    else if (column.endsWith("_cents")) value = table === "price_plans" ? 100 : "100";
    else if (column.endsWith("_at_local")) value = column.startsWith("ends_") ? "13:00:00" : "12:00:00";
    else if (column.endsWith("_at")) value = timestamp;
    else if (column.endsWith("_on") || column === "date_of_birth" || column.startsWith("effective_") || column.startsWith("period_") || column.startsWith("service_period_")) value = "2026-11-01";
    else if (column === "currency" || column === "default_currency") value = "EUR";
    else if (column === "country_code") value = "ES";
    else if (column === "status") value = "active";
    return [column, Object.prototype.hasOwnProperty.call(values, column) ? values[column] : value];
  }));
}

function fixture(): Rows {
  return {
    organizations: [row("organizations", 1)],
    locations: [row("locations", 10, { code: "one" }), row("locations", 11, { code: "two" })],
    people: [row("people", 20), row("people", 21), row("people", 22)],
    athletes: [row("athletes", 30, { person_id: id(20) }), row("athletes", 31, { person_id: id(21) })],
    families: [row("families", 40), row("families", 41)],
    guardians: [row("guardians", 50, { person_id: id(21) }), row("guardians", 51, { person_id: id(22) })],
    family_guardians: [row("family_guardians", 60, { family_id: id(40), guardian_id: id(50) }), row("family_guardians", 61, { family_id: id(41), guardian_id: id(51) })],
    family_payers: [row("family_payers", 70, { family_id: id(40), guardian_id: id(50), ends_on: null }), row("family_payers", 71, { family_id: id(41), guardian_id: id(51), ends_on: null })],
    organization_members: [row("organization_members", 80, { role: "owner", location_scope_mode: "all" })],
    staff_profiles: [row("staff_profiles", 81, { person_id: id(22), member_id: id(80) })],
    class_templates: [row("class_templates", 90, { location_id: id(10), program_id: null, default_space_id: null }), row("class_templates", 91, { location_id: id(11), program_id: null, default_space_id: null })],
    sessions: [row("sessions", 100, { location_id: id(10), class_template_id: id(90), space_id: null, ends_at: "2026-11-05 13:00:00+00" }), row("sessions", 101, { location_id: id(11), class_template_id: id(91), space_id: null, ends_at: "2026-11-05 13:00:00+00" })],
    price_plans: [row("price_plans", 110), row("price_plans", 111, { currency: "MXN" })],
    enrollments: [row("enrollments", 120, { location_id: id(10), athlete_id: id(30), class_template_id: id(90), price_plan_id: id(110), source: "owner", source_entity_id: null, ends_on: null }), row("enrollments", 121, { location_id: id(11), athlete_id: id(30), class_template_id: id(91), price_plan_id: id(111), source: "owner", source_entity_id: null, ends_on: null })],
    enrollment_price_assignments: [row("enrollment_price_assignments", 130, { location_id: id(10), enrollment_id: id(120), price_plan_id: id(110), ends_on: null }), row("enrollment_price_assignments", 131, { location_id: id(11), enrollment_id: id(121), price_plan_id: id(111), currency: "MXN", ends_on: null })],
    invoices: [row("invoices", 140, { location_id: id(10), family_id: id(40), family_payer_id: id(70), reference: "SYNTHETIC-ONE" }), row("invoices", 141, { location_id: id(11), family_id: id(41), family_payer_id: id(71), currency: "MXN", reference: "SYNTHETIC-TWO" })],
    invoice_lines: [row("invoice_lines", 150, { location_id: id(10), athlete_id: id(30), invoice_id: id(140), enrollment_id: null, price_plan_id: id(110), line_type: "monthly_fee" }), row("invoice_lines", 151, { location_id: id(11), athlete_id: id(30), invoice_id: id(141), enrollment_id: null, price_plan_id: id(111), currency: "MXN", line_type: "monthly_fee" })],
    invoice_line_enrollments: [row("invoice_line_enrollments", 0, { location_id: id(10), athlete_id: id(30), invoice_line_id: id(150), price_plan_id: id(110), enrollment_id: id(120), class_template_id: id(90), price_assignment_id: id(130) })],
    charges: [row("charges", 160, { location_id: id(10), invoice_id: id(140), invoice_line_id: id(150), family_id: id(40), family_payer_id: id(70), enrollment_id: null }), row("charges", 161, { location_id: id(11), invoice_id: id(141), invoice_line_id: id(151), family_id: id(41), family_payer_id: id(71), enrollment_id: null, currency: "MXN" })],
    payments: [row("payments", 170, { location_id: id(10), family_id: id(40), family_payer_id: id(70), source: "manual", manual_method: "cash", manual_reference: null }), row("payments", 171, { location_id: id(11), family_id: id(41), family_payer_id: id(71), source: "manual", manual_method: "cash", manual_reference: null, currency: "MXN" })],
    payment_allocations: [row("payment_allocations", 180, { payment_id: id(170), charge_id: id(160) }), row("payment_allocations", 181, { payment_id: id(171), charge_id: id(161), currency: "MXN" })],
    refunds: [row("refunds", 190, { payment_id: id(170), payment_allocation_id: id(180) })],
  };
}

function ordered(table: typeof CANONICAL_EXPORT_TABLES[number], rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const left = JSON.stringify(table.orderBy.map((c) => String(a[c]).toLowerCase()));
    const right = JSON.stringify(table.orderBy.map((c) => String(b[c]).toLowerCase()));
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

async function archive(rows: Rows = fixture()): Promise<string> {
  for (let n = 0; n < 4; n++) mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.execute
    .mockResolvedValueOnce({ rows: [{ organization_status: "active", member_status: "active", role: "owner", location_scope_mode: "all" }] })
    .mockResolvedValueOnce({ rows: ALL_KNOWN_CANONICAL_TABLE_NAMES.flatMap((table_name) => {
      const spec = CANONICAL_EXPORT_TABLES.find((t) => t.name === table_name);
      return (spec?.expectedColumns ?? ["id"]).map((column_name) => ({ table_name, column_name, data_type: "text" }));
    }) })
    .mockResolvedValueOnce({ rows: [{ snapshot_at: "2026-11-05T12:00:00.000Z" }] })
    .mockResolvedValueOnce({ rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map((table_name) => ({ table_name, row_count: 0 })) })
    .mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map((t) => ({ table_name: t.name, row_count: (rows[t.name] ?? []).length, estimated_bytes: (rows[t.name] ?? []).length * 128 })) });
  for (const table of CANONICAL_EXPORT_TABLES) {
    if (rows[table.name]?.length) mocks.execute.mockResolvedValueOnce({ rows: ordered(table, rows[table.name]!) });
  }
  return (await exportCanonicalAcademyData({ userId: actorId, organizationId })).body;
}

function diagnose(body: string, destination?: string) {
  // Every relational negative must pass the original verifier first, proving
  // that its failure is not merely an invalid shape / stale checksum.
  expect(validateCanonicalAcademyArchive({ body, organizationId }).valid).toBe(true);
  const calls = [mocks.execute.mock.calls.length, mocks.transaction.mock.calls.length, mocks.fetch.mock.calls.length];
  const result = preflightCanonicalAcademyRecovery({ body, organizationId, ...(destination ? { destination: { body: destination } } : {}) });
  expect([mocks.execute.mock.calls.length, mocks.transaction.mock.calls.length, mocks.fetch.mock.calls.length]).toEqual(calls);
  return result;
}

function hasIssue(result: ReturnType<typeof diagnose>, table: string, code: CanonicalRecoveryIssueCode, rule?: string) {
  expect(result.diagnostics.some((d) => d.table === table && d.code === code && (!rule || d.rule.includes(rule)))).toBe(true);
}

/** Reseal modified negative archives rather than relying on checksum failure. */
function reseal(body: string, mutate: (data: Rows) => void): string {
  const envelope = JSON.parse(body);
  mutate(envelope.data);
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  envelope.coverage.includedRowCount = 0;
  for (const entry of envelope.coverage.includedTables) {
    const spec = CANONICAL_EXPORT_TABLES.find((table) => table.name === entry.table)!;
    const rows = ordered(spec, envelope.data[entry.table] as Row[]);
    envelope.data[entry.table] = rows;
    entry.rowCount = rows.length;
    entry.checksumSha256 = digest(rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    envelope.coverage.includedRowCount += rows.length;
  }
  const { integrity, ...base } = envelope;
  return JSON.stringify({ ...base, integrity: { ...integrity, bundleChecksumSha256: digest(JSON.stringify(base)) } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(() => { throw new Error("Unexpected database access"); });
  mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) => callback({ execute: mocks.execute }));
  mocks.fetch.mockImplementation(() => { throw new Error("Unexpected external effect"); });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("pure canonical selective recovery preflight", () => {
  it("reviews all 46 projections and returns deterministic minimized diagnostics, never restore approval", async () => {
    const body = await archive();
    const result = diagnose(body);
    expect(CANONICAL_RECOVERY_POLICY).toHaveLength(46);
    expect(result.tables).toHaveLength(46);
    expect(result).toMatchObject({ status: "blocked", partial: true, restorable: false, authenticityVerified: false, authorizationVerified: false, destinationVerified: false, referentialIntegrityVerified: false, sourceCompletenessVerified: false, projectedSourceRelations: "consistent", projectedSourceUniqueness: "consistent", destinationComparison: "not_supplied", outsideOrganizationIdConflicts: "unknown" });
    expect(preflightCanonicalAcademyRecovery({ body, organizationId })).toEqual(result);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    hasIssue(result, "organization_members", "omitted_value_unknown", "user_id");
    hasIssue(result, "guardians", "omitted_value_unknown", "auth_user_id");
    hasIssue(result, "payments", "omitted_value_unknown", "recorded_by_user_id");
    hasIssue(result, "payments", "omitted_value_unknown", "provider_payment_id");
    hasIssue(result, "payments", "omitted_value_unknown", "idempotency_key");
    hasIssue(result, "invoice_lines", "postgres_checks_exclusions_triggers_unsupported");
  });

  it("requires a root even when the verifier accepts an empty checksummed package", async () => {
    const result = diagnose(await archive({}));
    hasIssue(result, "organizations", "organization_root_missing");
    expect(result.projectedSourceRelations).toBe("violations");
  });

  it("finds an orphan after its checksums have been recalculated", async () => {
    const body = reseal(await archive(), (data) => { data.people = data.people!.filter((r) => r.id !== id(20)); });
    hasIssue(diagnose(body), "athletes", "foreign_key_missing", "person_id");
  });

  it.each([
    ["invoices", "family_payer_id", 71, "family_id,family_payer_id"],
    ["invoice_lines", "currency", "MXN", "invoice_id,currency"],
    ["invoice_lines", "location_id", 11, "location_id,invoice_id"],
    ["payment_allocations", "payment_id", 171, "payment_id,currency"],
    ["payment_allocations", "charge_id", 161, "charge_id,currency"],
    ["refunds", "payment_id", 171, "payment_id,currency"],
    ["refunds", "payment_allocation_id", 181, "payment_allocation_id,currency"],
    ["invoice_line_enrollments", "invoice_line_id", 151, "location_id,athlete_id,price_plan_id,invoice_line_id"],
    ["invoice_line_enrollments", "athlete_id", 31, "location_id,athlete_id,price_plan_id,invoice_line_id"],
    ["invoice_line_enrollments", "price_plan_id", 111, "location_id,athlete_id,price_plan_id,invoice_line_id"],
    ["invoice_line_enrollments", "location_id", 11, "location_id,athlete_id,price_plan_id,invoice_line_id"],
    ["invoice_line_enrollments", "enrollment_id", 121, "location_id,athlete_id,class_template_id,enrollment_id"],
    ["invoice_line_enrollments", "class_template_id", 91, "location_id,class_template_id"],
    ["invoice_line_enrollments", "price_assignment_id", 131, "location_id,price_plan_id,enrollment_id,price_assignment_id"],
  ] as const)("rejects an existing parent with discordant composite scope: %s.%s", async (table, column, value, rule) => {
    const body = reseal(await archive(), (data) => { data[table]![0]![column] = typeof value === "number" ? id(value) : value; });
    hasIssue(diagnose(body), table, "foreign_key_missing", rule);
  });

  it("does not invent a cross-payment FK beyond the two independent refund FKs", async () => {
    const rows = fixture();
    rows.payments!.push(row("payments", 172, { location_id: id(10), family_id: id(40), family_payer_id: id(70), source: "manual", manual_method: "cash", manual_reference: null }));
    rows.refunds![0]!.payment_id = id(172);
    const result = diagnose(await archive(rows));
    expect(result.projectedSourceRelations).toBe("consistent");
    expect(result.restorable).toBe(false);
    hasIssue(result, "refunds", "postgres_checks_exclusions_triggers_unsupported");
  });

  it("handles nullable composite FKs with MATCH SIMPLE and never infers omitted identity values", async () => {
    const rows = fixture();
    rows.staff_profiles![0]!.member_id = null;
    rows.invoices![0]!.family_payer_id = null;
    rows.invoice_lines![0]!.location_id = null;
    const result = diagnose(await archive(rows));
    expect(result.diagnostics.some((d) => d.table === "staff_profiles" && d.code === "foreign_key_missing")).toBe(false);
    expect(result.diagnostics.some((d) => d.table === "invoices" && d.code === "foreign_key_missing")).toBe(false);
    // The explicit invoice_line_enrollments tuple still exposes its now missing
    // line scope; null in a DIFFERENT row does not exempt that non-null FK.
    hasIssue(result, "invoice_line_enrollments", "foreign_key_missing");
  });

  it("compares UUID parent references case insensitively", async () => {
    const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const body = reseal(await archive(), (data) => {
      data.people![0]!.id = caseId;
      data.people!.sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
      data.athletes![0]!.person_id = caseId.toUpperCase();
    });
    expect(diagnose(body).projectedSourceRelations).toBe("consistent");
  });

  it("rejects semantically duplicate UUID PKs even with valid recalculated hashes", async () => {
    const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const body = reseal(await archive(), (data) => {
      data.people![2]!.id = caseId;
      data.guardians![1]!.person_id = caseId;
      data.people!.push({ ...data.people![2]!, id: caseId.toUpperCase() });
    });
    expect(() => preflightCanonicalAcademyRecovery({ body, organizationId })).toThrow(CanonicalRecoveryPreflightError);
  });

  it.each([
    ["athletes", "athletes_organization_person_uq"],
    ["charges", "charges_invoice_line_uq"],
    ["invoice_line_enrollments", "invoice_line_enrollments_line_template_uq"],
  ] as const)("detects semantic unique collision with different PKs: %s", async (table, rule) => {
    const rows = fixture();
    const duplicate = { ...rows[table]![0]! };
    if (table === "invoice_line_enrollments") duplicate.enrollment_id = id(121);
    else duplicate.id = id(500);
    rows[table]!.push(duplicate);
    hasIssue(diagnose(await archive(rows)), table, "source_unique_collision", rule);
  });

  it("evaluates partial unique predicates: historical pauses coexist, two open pauses collide", async () => {
    const rows = fixture();
    rows.enrollment_pauses = [row("enrollment_pauses", 200, { enrollment_id: id(120), ends_on: "2026-11-02" }), row("enrollment_pauses", 201, { enrollment_id: id(120), ends_on: "2026-11-03" })];
    const historical = diagnose(await archive(rows));
    expect(historical.diagnostics.some((d) => d.table === "enrollment_pauses" && d.code === "source_unique_collision")).toBe(false);
    rows.enrollment_pauses.forEach((r) => { r.ends_on = null; });
    hasIssue(diagnose(await archive(rows)), "enrollment_pauses", "source_unique_collision", "enrollment_pauses_one_open_uq");
  });

  it("does not compare rows outside a partial unique predicate", async () => {
    const rows = fixture();
    rows.guardian_contacts = [row("guardian_contacts", 202, { guardian_id: id(50), kind: "email", is_primary: false, verified_at: null }), row("guardian_contacts", 203, { guardian_id: id(50), kind: "email", is_primary: false, verified_at: null })];
    expect(diagnose(await archive(rows)).diagnostics.some((d) => d.table === "guardian_contacts" && d.code === "source_unique_collision")).toBe(false);
    rows.guardian_contacts.forEach((r) => { r.is_primary = true; });
    hasIssue(diagnose(await archive(rows)), "guardian_contacts", "source_unique_collision", "guardian_contacts_primary_kind_uq");
  });

  it("preserves microseconds while comparing equal UTC instants and local times", async () => {
    const rows = fixture();
    rows.sessions!.push({ ...rows.sessions![0]!, id: id(500), starts_at: "2026-11-05 13:00:00+01" });
    hasIssue(diagnose(await archive(rows)), "sessions", "source_unique_collision", "sessions_template_start_uq");
    rows.sessions![2]!.starts_at = "2026-11-05 12:00:00.000001+00";
    expect(diagnose(await archive(rows)).diagnostics.some((d) => d.table === "sessions" && d.code === "source_unique_collision")).toBe(false);
    rows.class_template_weekdays = [row("class_template_weekdays", 501, { class_template_id: id(90), starts_at_local: "12:00:00" }), row("class_template_weekdays", 502, { class_template_id: id(90), starts_at_local: "12:00:00.000000" })];
    hasIssue(diagnose(await archive(rows)), "class_template_weekdays", "source_unique_collision");
  });

  it("reports unknown polymorphic enrollment references and bounded diagnostic samples", async () => {
    const rows = fixture();
    rows.enrollments![0]!.source_entity_id = id(900);
    rows.athletes = Array.from({ length: 12 }, (_, n) => row("athletes", 600 + n, { person_id: id(9999) }));
    const result = diagnose(await archive(rows));
    hasIssue(result, "enrollments", "polymorphic_reference_unknown");
    const diagnostic = result.diagnostics.find((d) => d.table === "athletes" && d.code === "foreign_key_missing")!;
    expect(diagnostic.occurrences).toBe(12);
    expect(diagnostic.sampleRowOrdinals).toEqual([0, 1, 2, 3, 4]);
  });

  it("reports PK collisions even for identical destination data and never authorizes overwrite", async () => {
    const body = await archive();
    const result = diagnose(body, body);
    hasIssue(result, "organizations", "destination_primary_key_collision");
    hasIssue(result, "invoice_line_enrollments", "destination_primary_key_collision");
    expect(result.destinationComparison).toBe("declared_same_organization_archive");
    expect(result.destinationVerified).toBe(false);
    expect(result.restorable).toBe(false);
    const altered = reseal(body, (data) => { data.people![0]!.given_name = "OTHER_SYNTHETIC_VALUE"; });
    hasIssue(diagnose(body, altered), "people", "destination_primary_key_collision");
  });

  it("finds destination unique collisions with different IDs, without calling target contents verified", async () => {
    const body = await archive();
    const target = reseal(body, (data) => { data.locations![0]!.id = id(500); });
    hasIssue(diagnose(body, target), "locations", "destination_unique_collision", "locations_organization_code_uq");
  });

  it("does not use a parent existing only in destination to claim source closure", async () => {
    const target = await archive();
    const source = reseal(target, (data) => { data.people = data.people!.filter((r) => r.id !== id(20)); });
    hasIssue(diagnose(source, target), "athletes", "foreign_key_missing");
  });

  it("rejects malformed inputs, foreign destination scope and tampering without disclosing records", async () => {
    const body = await archive();
    const foreign = reseal(body, (data) => { data.organizations![0]!.id = id(999); });
    for (const input of [
      { body: marker, organizationId },
      { body, organizationId, destination: { body: marker } },
      { body, organizationId, destination: { body: foreign } },
      { body: body.replace(marker, "ALTERED_VALUE"), organizationId },
    ]) {
      try {
        preflightCanonicalAcademyRecovery(input);
        throw new Error("Expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(CanonicalRecoveryPreflightError);
        expect(String(error)).not.toContain(marker);
        expect(String(error)).not.toContain(organizationId);
      }
    }
  });

  it("fails closed when the catalog projection changes before its policy is reviewed", async () => {
    const body = await archive();
    const table = CANONICAL_EXPORT_TABLES[0]!;
    const columns = table.expectedColumns as string[];
    columns.push("synthetic_unreviewed_column");
    try {
      expect(() => preflightCanonicalAcademyRecovery({ body, organizationId })).toThrow(CanonicalRecoveryPreflightError);
    } finally {
      columns.pop();
    }
  });
});
