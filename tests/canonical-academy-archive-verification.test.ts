import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  OPTIONAL_DISCOVERY_EXPORT_TABLES,
  OPTIONAL_INCLUDED_EXPORT_TABLES,
  OPTIONAL_TEAM_ACCESS_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";
import { activatedCatalogRows, activatedRowsByTable } from "./helpers/activated-module-rows";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "90000000-0000-4000-8000-000000000009";
const actorId = "20000000-0000-4000-8000-000000000001";
const personId = "30000000-0000-4000-8000-000000000001";
const secondPersonId = "30000000-0000-4000-8000-000000000002";
const classTemplateId = "40000000-0000-4000-8000-000000000001";
const locationId = "50000000-0000-4000-8000-000000000001";
const sessionId = "60000000-0000-4000-8000-000000000001";
const weekdayId = "70000000-0000-4000-8000-000000000001";
const spaceId = "80000000-0000-4000-8000-000000000001";
const invoiceLineId = "81000000-0000-4000-8000-000000000001";
const invoiceId = "82000000-0000-4000-8000-000000000001";
const enrollmentId = "83000000-0000-4000-8000-000000000001";
const pricePlanId = "84000000-0000-4000-8000-000000000001";
const snapshotAt = "2026-11-04 09:30:00.123456+00";
const syntheticPrivateMarker = "SYNTHETIC_PRIVATE_SENTINEL_7d12a8";
const dialect = new PgDialect();
const postgresDateColumns = [
  ["people", "date_of_birth"],
  ["family_members", "starts_on"],
  ["family_members", "ends_on"],
  ["family_payers", "starts_on"],
  ["family_payers", "ends_on"],
  ["organization_sports", "starts_on"],
  ["organization_sports", "ends_on"],
  ["group_memberships", "starts_on"],
  ["group_memberships", "ends_on"],
  ["group_membership_history", "effective_on"],
  ["class_templates", "effective_from"],
  ["class_templates", "effective_to"],
  ["enrollments", "starts_on"],
  ["enrollments", "ends_on"],
  ["enrollment_status_history", "effective_on"],
  ["enrollment_pauses", "starts_on"],
  ["enrollment_pauses", "ends_on"],
  ["price_plan_class_template_coverage", "starts_on"],
  ["price_plan_class_template_coverage", "ends_on"],
  ["enrollment_price_assignments", "starts_on"],
  ["enrollment_price_assignments", "ends_on"],
  ["invoice_lines", "service_period_start"],
  ["invoice_lines", "service_period_end"],
  ["charges", "service_period_start"],
  ["charges", "service_period_end"],
  ["financial_reconciliation_runs", "period_start"],
  ["financial_reconciliation_runs", "period_end"],
] as const;
const postgresDateColumnKeys = new Set(
  postgresDateColumns.map(([table, column]) => `${table}.${column}`)
);

interface TableManifestEntry {
  table: string;
  rowCount: number;
  checksumSha256: string;
}

interface ArchiveBundle {
  package: unknown;
  formatVersion: unknown;
  coverage: {
    scope: unknown;
    complete: unknown;
    organizationId: unknown;
    includedRowCount: number;
    estimatedSelectedSourceBytes: number;
    limits: Record<string, unknown>;
    includedTables: TableManifestEntry[];
    [key: string]: unknown;
  };
  data: Record<string, Array<Record<string, unknown>>>;
  integrity: {
    algorithm: unknown;
    bundleChecksumSha256: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface GeneratorTransaction {
  execute: typeof mocks.execute;
}

function organizationRow() {
  return {
    id: organizationId,
    name: "Synthetic Academy",
    legal_name: "Synthetic Academy",
    status: "active",
    country_code: "ES",
    default_currency: "EUR",
    default_timezone: "Europe/Madrid",
    created_at: "2026-01-01 00:00:00+00",
    updated_at: "2026-01-01 00:00:00+00",
  };
}

function personRow() {
  return {
    id: personId,
    organization_id: organizationId,
    given_name: "Synthetic",
    family_name: "Athlete",
    preferred_name: null,
    date_of_birth: "2014-04-12",
    created_at: "2026-01-02 00:00:00+00",
    updated_at: "2026-01-02 00:00:00+00",
  };
}

function secondPersonRow() {
  return {
    ...personRow(),
    id: secondPersonId,
    given_name: "Synthetic Two",
  };
}

function classTemplateWeekdayRow() {
  return {
    id: weekdayId,
    organization_id: organizationId,
    class_template_id: classTemplateId,
    iso_weekday: 3,
    starts_at_local: "17:00:00",
    ends_at_local: "18:00:00",
  };
}

function sessionRow() {
  return {
    id: sessionId,
    organization_id: organizationId,
    location_id: locationId,
    class_template_id: classTemplateId,
    space_id: spaceId,
    status: "scheduled",
    starts_at: "2026-11-04 17:00:00.123456+00",
    ends_at: "2026-11-04 18:00:00.654321+00",
    capacity_override: 12,
    cancellation_reason: null,
    created_at: "2026-01-03 00:00:00+00",
    updated_at: "2026-01-03 00:00:00+00",
  };
}

function invoiceLineRow() {
  return {
    id: invoiceLineId,
    organization_id: organizationId,
    invoice_id: invoiceId,
    location_id: locationId,
    athlete_id: personId,
    enrollment_id: enrollmentId,
    price_plan_id: pricePlanId,
    line_type: "monthly_tuition",
    quantity: 1,
    unit_amount_cents: "9007199254740993",
    amount_cents: "9007199254740993",
    currency: "EUR",
    service_period_start: "2026-11-01",
    service_period_end: "2026-11-30",
    created_at: "2026-11-01 00:00:00+00",
  };
}

function catalogRows() {
  return ALL_KNOWN_CANONICAL_TABLE_NAMES.flatMap((table_name) => {
    const table = CANONICAL_EXPORT_TABLES.find(
      (candidate) => candidate.name === table_name
    );
    return (table?.expectedColumns ?? ["id"]).map((column_name) => ({
      table_name,
      column_name,
      data_type: postgresDateColumnKeys.has(`${table_name}.${column_name}`)
        ? "date"
        : "text",
    }));
  });
}

function prepareGeneratorQueries(
  rowsByTable: Record<string, Array<Record<string, unknown>>> = {
    organizations: [organizationRow()],
    people: [personRow()],
    class_template_weekdays: [classTemplateWeekdayRow()],
    sessions: [sessionRow()],
  }
) {
  for (let index = 0; index < 4; index += 1) {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
  }
  mocks.execute
    .mockResolvedValueOnce({
      rows: [{
        organization_status: "active",
        member_status: "active",
        role: "owner",
        location_scope_mode: "all",
      }],
    })
    .mockResolvedValueOnce({ rows: catalogRows() })
    .mockResolvedValueOnce({ rows: [{ snapshot_at: snapshotAt }] })
    .mockResolvedValueOnce({
      rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map((table_name) => ({
        table_name,
        row_count: 0,
      })),
    })
    .mockResolvedValueOnce({
      rows: CANONICAL_EXPORT_TABLES.map((table) => {
        const rowCount = (rowsByTable[table.name] ?? []).length;
        return {
          table_name: table.name,
          row_count: rowCount,
          estimated_bytes: rowCount * 128,
        };
      }),
    });

  for (const table of CANONICAL_EXPORT_TABLES) {
    const rows = rowsByTable[table.name] ?? [];
    if (rows.length > 0) {
      mocks.execute.mockResolvedValueOnce({ rows });
    }
  }
}

async function generateBundleBody(
  rowsByTable?: Record<string, Array<Record<string, unknown>>>
): Promise<string> {
  prepareGeneratorQueries(rowsByTable);
  const result = await exportCanonicalAcademyData({
    userId: actorId,
    organizationId,
  });
  return result.body;
}

/** Same generator flow with every activated module installed and one row per table. */
async function generateActivatedBundleBody(): Promise<string> {
  const activatedRows = activatedRowsByTable(organizationId);
  for (let index = 0; index < 4; index += 1) {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
  }
  mocks.execute
    .mockResolvedValueOnce({
      rows: [{ organization_status: "active", member_status: "active", role: "owner", location_scope_mode: "all" }],
    })
    .mockResolvedValueOnce({ rows: [...catalogRows(), ...activatedCatalogRows()] })
    .mockResolvedValueOnce({ rows: [{ snapshot_at: snapshotAt }] })
    .mockResolvedValueOnce({
      rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map((table_name) => ({ table_name, row_count: 0 })),
    })
    .mockResolvedValueOnce({
      rows: [
        ...CANONICAL_EXPORT_TABLES.map((table) => ({ table_name: table.name, row_count: table.name === "organizations" ? 1 : 0, estimated_bytes: 128 })),
        ...OPTIONAL_INCLUDED_EXPORT_TABLES.map((table) => ({ table_name: table.name, row_count: 1, estimated_bytes: 256 })),
      ],
    })
    .mockResolvedValueOnce({ rows: [organizationRow()] });
  for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) {
    mocks.execute.mockResolvedValueOnce({ rows: activatedRows[table.name] });
  }
  return (await exportCanonicalAcademyData({ userId: actorId, organizationId })).body;
}

function parseArchive(body: string): ArchiveBundle {
  return JSON.parse(body) as ArchiveBundle;
}

function withTwoPeople(archive: ArchiveBundle): ArchiveBundle {
  archive.data.people = [personRow(), secondPersonRow()];
  const manifest = archive.coverage.includedTables.find(
    (entry) => entry.table === "people"
  );
  if (!manifest) throw new Error("Synthetic fixture is missing people manifest");
  manifest.rowCount = 2;
  archive.coverage.includedRowCount += 1;
  return archive;
}

function addOptionalDiscoveryEntries(
  archive: ArchiveBundle,
  count: number
): ArchiveBundle {
  const excludedTables = archive.coverage.excludedTables as Array<
    Record<string, unknown>
  >;
  for (const entry of OPTIONAL_DISCOVERY_EXPORT_TABLES.slice(0, count)) {
    excludedTables.push({
      table: entry.table,
      category: entry.category,
      reason: entry.reason,
      rowCount: 0,
      countScope: "organization_id",
      valuesExported: false,
    });
  }
  return archive;
}

function withFirstScopedExcludedCount(
  archive: ArchiveBundle,
  rowCount: number | string
): ArchiveBundle {
  const excludedTables = archive.coverage.excludedTables as Array<
    Record<string, unknown>
  >;
  const firstScoped = excludedTables.find(
    (entry) => entry.countScope === "organization_id"
  );
  if (!firstScoped) throw new Error("Synthetic fixture is missing a scoped exclusion");
  firstScoped.rowCount = rowCount;
  return archive;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestRows(rows: readonly Record<string, unknown>[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(JSON.stringify(row));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function sealArchive(
  archive: ArchiveBundle,
  options: { refreshTableChecksums?: boolean } = {}
): string {
  if (options.refreshTableChecksums) {
    for (const entry of archive.coverage.includedTables) {
      const rows = archive.data[entry.table];
      if (rows) entry.checksumSha256 = digestRows(rows);
    }
  }

  const { integrity, ...basePackage } = archive;
  return JSON.stringify({
    ...basePackage,
    integrity: {
      ...integrity,
      bundleChecksumSha256: sha256(JSON.stringify(basePackage)),
    },
  });
}

function effectCounts() {
  return {
    transaction: mocks.transaction.mock.calls.length,
    execute: mocks.execute.mock.calls.length,
    select: mocks.select.mock.calls.length,
    insert: mocks.insert.mock.calls.length,
    update: mocks.update.mock.calls.length,
    delete: mocks.delete.mock.calls.length,
    fetch: mocks.fetch.mock.calls.length,
  };
}

function expectNoValidationEffects(before: ReturnType<typeof effectCounts>) {
  expect(effectCounts()).toEqual(before);
}

function expectAccepted(body: string) {
  const before = effectCounts();
  const result = validateCanonicalAcademyArchive({ body, organizationId });
  expect(result).toMatchObject({
    valid: true,
    partial: true,
    limited: true,
    restorable: false,
    authenticityVerified: false,
    authorizationVerified: false,
    referentialIntegrityVerified: false,
    sourceCompletenessVerified: false,
    tenantScopeVerified: true,
    checksumsVerified: true,
  });
  expectNoValidationEffects(before);
  return result;
}

function expectRejectedWithoutDisclosure(body: string, marker?: string) {
  const before = effectCounts();
  let didThrow = false;
  let error: unknown;
  try {
    validateCanonicalAcademyArchive({ body, organizationId });
  } catch (caught) {
    didThrow = true;
    error = caught;
  }

  expect(didThrow).toBe(true);
  const message =
    error instanceof Error ? error.name + ": " + error.message : String(error);
  expect(message).not.toContain(body);
  if (marker) expect(message).not.toContain(marker);
  expectNoValidationEffects(before);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(() => {
    throw new Error("Unexpected network access from archive verifier");
  });
  mocks.select.mockImplementation(() => {
    throw new Error("Unexpected database read from archive verifier");
  });
  mocks.insert.mockImplementation(() => {
    throw new Error("Unexpected database write from archive verifier");
  });
  mocks.update.mockImplementation(() => {
    throw new Error("Unexpected database write from archive verifier");
  });
  mocks.delete.mockImplementation(() => {
    throw new Error("Unexpected database write from archive verifier");
  });
  mocks.transaction.mockImplementation(
    async (callback: (tx: GeneratorTransaction) => Promise<unknown>) =>
      callback({ execute: mocks.execute })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canonical academy archive verification", () => {
  it("accepts a generated bounded bundle and reports its limits honestly", async () => {
    const body = await generateBundleBody();
    const archive = parseArchive(body);

    expect(CANONICAL_EXPORT_TABLES).toHaveLength(46);
    expect(archive.coverage.complete).toBe(false);
    expect(archive.coverage.includedTables).toHaveLength(46);
    expect(Object.keys(archive.data)).toHaveLength(46);
    expect(archive.coverage.includedRowCount).toBe(4);
    expect(archive.data.organizations).toEqual([organizationRow()]);
    expect(archive.data.people).toEqual([personRow()]);
    expect(archive.data.class_template_weekdays).toEqual([
      classTemplateWeekdayRow(),
    ]);
    expect(archive.data.sessions).toEqual([sessionRow()]);
    expect(
      Object.values(archive.data).filter((rows) => rows.length === 0)
    ).toHaveLength(42);

    expectAccepted(body);
  });

  it("round-trips PostgreSQL dates, timestamps, int8 amounts, Unicode, hashes, and tenant scope", async () => {
    const people = {
      ...personRow(),
      given_name: "Inés",
      family_name: "Muñoz",
      preferred_name: "Gimnasta Élite",
    };
    const driverSession = {
      ...sessionRow(),
      starts_at: new Date("2026-11-04T17:00:00.123Z"),
      ends_at: new Date("2026-11-04T18:00:00.654Z"),
    };
    const body = await generateBundleBody({
      organizations: [organizationRow()],
      people: [people],
      class_template_weekdays: [classTemplateWeekdayRow()],
      sessions: [driverSession],
      invoice_lines: [invoiceLineRow()],
    });
    const archive = parseArchive(body);
    const invoiceLine = archive.data.invoice_lines[0]!;
    const queryTexts = mocks.execute.mock.calls.map(([query]) =>
      dialect.sqlToQuery(
        query as Parameters<PgDialect["sqlToQuery"]>[0]
      ).sql
    );

    expect(archive.data.people[0]!.date_of_birth).toBe("2014-04-12");
    expect(invoiceLine.service_period_start).toBe("2026-11-01");
    expect(invoiceLine.service_period_end).toBe("2026-11-30");
    expect(invoiceLine.unit_amount_cents).toBe("9007199254740993");
    expect(invoiceLine.amount_cents).toBe("9007199254740993");
    expect(archive.data.people[0]!.given_name).toBe("Inés");
    expect(archive.data.people[0]!.preferred_name).toBe("Gimnasta Élite");
    expect(archive.data.sessions[0]!.starts_at).toBe(
      "2026-11-04T17:00:00.123Z"
    );
    for (const [table, column] of postgresDateColumns) {
      const projection = `"${column}"::text as "${column}"`;
      expect(
        queryTexts.some(
          (query) =>
            query.includes(`from zaltyko."${table}"`) &&
            query.includes(projection)
        )
      ).toBe(true);
    }
    expect(queryTexts).toContain("SET LOCAL DateStyle = 'ISO, YMD'");
    expect(
      archive.coverage.includedTables.find(
        (entry) => entry.table === "invoice_lines"
      )?.checksumSha256
    ).toBe(digestRows(archive.data.invoice_lines));
    expectAccepted(body);

    const tamperedAmount = parseArchive(body);
    tamperedAmount.data.invoice_lines[0]!.amount_cents = "9007199254740994";
    expectRejectedWithoutDisclosure(sealArchive(tamperedAmount));

    const crossTenantRow = parseArchive(body);
    crossTenantRow.data.invoice_lines[0]!.organization_id = otherOrganizationId;
    expectRejectedWithoutDisclosure(
      sealArchive(crossTenantRow, { refreshTableChecksums: true })
    );
  });

  it("normalizes raw snapshot metadata to ISO-Z and preserves row timestamp bytes", async () => {
    const body = await generateBundleBody();
    const archive = parseArchive(body);
    const sessionsManifest = archive.coverage.includedTables.find(
      (entry) => entry.table === "sessions"
    );

    expect(archive.coverage.generatedAt).toBe("2026-11-04T09:30:00.123Z");
    expect(archive.data.sessions[0]!.starts_at).toBe(
      "2026-11-04 17:00:00.123456+00"
    );
    expect(archive.data.sessions[0]!.ends_at).toBe(
      "2026-11-04 18:00:00.654321+00"
    );
    expect(sessionsManifest?.checksumSha256).toBe(
      digestRows(archive.data.sessions)
    );
    expectAccepted(body);
  });

  it("produces deterministic bytes for the same synthetic snapshot", async () => {
    const first = await generateBundleBody();
    const second = await generateBundleBody();

    expect(second).toBe(first);
  });

  it("does not treat the unsigned SHA-256 bundle digest as source authenticity", async () => {
    const body = await generateBundleBody();
    const verification = expectAccepted(body);

    expect(verification).toMatchObject({
      authenticityVerified: false,
      restorable: false,
    });
  });

  it("treats estimated source bytes as bounded preflight metadata, not a recomputable row checksum", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.estimatedSelectedSourceBytes = 1_337;

    expectAccepted(sealArchive(archive));
  });

  it("rejects a structurally valid body when the bundle checksum is stale", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.estimatedSelectedSourceBytes = 1_337;

    expectRejectedWithoutDisclosure(JSON.stringify(archive));
  });

  it("rejects row changes when the table checksum is stale even if the bundle hash is refreshed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]!.given_name = syntheticPrivateMarker;

    expectRejectedWithoutDisclosure(
      sealArchive(archive),
      syntheticPrivateMarker
    );
  });

  it("rejects an inconsistent row count with a refreshed bundle checksum", async () => {
    const archive = parseArchive(await generateBundleBody());
    const peopleManifest = archive.coverage.includedTables.find(
      (entry) => entry.table === "people"
    );
    expect(peopleManifest).toBeDefined();
    peopleManifest!.rowCount += 1;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects a row assigned to another organization after table and bundle hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]!.organization_id = otherOrganizationId;

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects a different archive tenant after the bundle checksum is recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.organizationId = otherOrganizationId;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects an unclassified table after the bundle hash is recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.unclassified_private_table = [{
      organization_id: organizationId,
      value: syntheticPrivateMarker,
    }];

    expectRejectedWithoutDisclosure(
      sealArchive(archive),
      syntheticPrivateMarker
    );
  });

  it("rejects an unclassified column after table and bundle hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]![syntheticPrivateMarker] = "synthetic value";

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true }),
      syntheticPrivateMarker
    );
  });

  it("rejects a missing canonical table even when the outer checksum is refreshed", async () => {
    const archive = parseArchive(await generateBundleBody());
    delete archive.data.groups;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects duplicate table manifest entries even when the outer checksum is refreshed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.includedTables.push({
      ...archive.coverage.includedTables[0]!,
    });

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects duplicate JSON keys before trusting the parsed checksum", async () => {
    const body = await generateBundleBody();
    const duplicated = body.replace(
      '"formatVersion":1,',
      '"formatVersion":1,"formatVersion":1,'
    );

    expect(duplicated).not.toBe(body);
    expectRejectedWithoutDisclosure(duplicated);
  });

  it("accepts multiple people when row counts, ordering, and hashes are coherent", async () => {
    const archive = withTwoPeople(parseArchive(await generateBundleBody()));

    expectAccepted(sealArchive(archive, { refreshTableChecksums: true }));
  });

  it("rejects duplicate primary keys when row counts and hashes are coherent", async () => {
    const archive = withTwoPeople(parseArchive(await generateBundleBody()));
    archive.data.people[1]!.id = personId;

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects out-of-order primary keys when row counts and hashes are coherent", async () => {
    const archive = withTwoPeople(parseArchive(await generateBundleBody()));
    archive.data.people.reverse();

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects rows beyond the manifest count after the table hash is refreshed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people.push({
      ...archive.data.people[0]!,
      id: "30000000-0000-4000-8000-000000000002",
      given_name: "Second synthetic athlete",
    });

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects malformed JSON without echoing content", async () => {
    const body = "not-json " + syntheticPrivateMarker;

    expectRejectedWithoutDisclosure(body, syntheticPrivateMarker);
  });

  it("accepts valid non-ASCII row values with recomputed hashes", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]!.given_name = "Niña";
    archive.data.people[0]!.preferred_name = "Gimnasta Élite";

    expectAccepted(sealArchive(archive, { refreshTableChecksums: true }));
  });

  it.each([
    ["positive offset with hours", "2026-11-04 17:00:00+02"],
    ["negative offset with hours", "2026-11-04 17:00:00-05"],
    ["positive offset with minutes", "2026-11-04 17:00:00+02:30"],
    ["negative offset with minutes", "2026-11-04 17:00:00-05:30"],
    ["positive offset with seconds", "2026-11-04 17:00:00+00:00:30"],
    ["negative offset with seconds", "2026-11-04 17:00:00-00:00:30"],
    ["positive maximum PostgreSQL offset", "2026-11-04 17:00:00+15:59:59"],
    ["negative maximum PostgreSQL offset", "2026-11-04 17:00:00-15:59:59"],
    ["one fractional digit", "2026-11-04 17:00:00.1+00"],
    ["two fractional digits", "2026-11-04 17:00:00.12+00"],
    ["three fractional digits", "2026-11-04 17:00:00.123+00"],
    ["four fractional digits", "2026-11-04 17:00:00.1234+00"],
    ["five fractional digits", "2026-11-04 17:00:00.12345+00"],
    ["six fractional digits", "2026-11-04 17:00:00.123456+00"],
    ["leap day", "2024-02-29 17:00:00.123456+00:00"],
  ])(
    "accepts PostgreSQL timestamp text (%s) without normalizing its checksum",
    async (_format, timestamp) => {
      const archive = parseArchive(await generateBundleBody());
      archive.data.sessions[0]!.starts_at = timestamp;
      archive.data.sessions[0]!.ends_at = timestamp;

      const body = sealArchive(archive, { refreshTableChecksums: true });
      const sealed = parseArchive(body);
      const sessionsManifest = sealed.coverage.includedTables.find(
        (entry) => entry.table === "sessions"
      );

      expect(sealed.data.sessions[0]!.starts_at).toBe(timestamp);
      expect(sessionsManifest?.checksumSha256).toBe(
        digestRows(sealed.data.sessions)
      );
      expectAccepted(body);
    }
  );

  it.each([
    ["impossible leap day", "2023-02-29 17:00:00+00"],
    ["impossible month day", "2026-02-30 17:00:00+00"],
    ["hour beyond range", "2026-11-04 25:00:00+00"],
    ["minute beyond range", "2026-11-04 17:60:00+00"],
    ["second beyond range", "2026-11-04 17:00:60+00"],
    ["offset beyond range", "2026-11-04 17:00:00+16:00"],
    ["negative offset beyond range", "2026-11-04 17:00:00-16:00"],
    ["offset minute beyond range", "2026-11-04 17:00:00+00:60"],
    ["offset second beyond range", "2026-11-04 17:00:00+00:00:60"],
    [
      "fractional precision beyond PostgreSQL range",
      "2026-11-04 17:00:00.1234567+00",
    ],
  ])(
    "rejects invalid PostgreSQL timestamp text (%s) with valid hashes",
    async (_reason, timestamp) => {
      const archive = parseArchive(await generateBundleBody());
      archive.data.sessions[0]!.starts_at = timestamp;

      expectRejectedWithoutDisclosure(
        sealArchive(archive, { refreshTableChecksums: true })
      );
    }
  );

  it("keeps generatedAt strict ISO UTC", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.generatedAt = "2026-11-04 17:00:00+00";

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects escaped unpaired Unicode surrogates after hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]!.given_name = "\uD800";

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects UTF-8 byte overflow even when JavaScript string length is below the limit", () => {
    const maxBytes = 3_500_000;
    const body = String.fromCharCode(0x00e9).repeat(
      Math.floor(maxBytes / 2) + 1
    );

    expect(body.length).toBeLessThan(maxBytes);
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(maxBytes);
    expectRejectedWithoutDisclosure(body);
  });

  it("rejects an unsupported format version with a refreshed bundle checksum", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.formatVersion = 99;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects a type mismatch in the declared limits with a refreshed bundle checksum", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.limits.maxIncludedRows = "20000";

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects included row counts beyond the declared export bound", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.includedRowCount =
      Number(archive.coverage.limits.maxIncludedRows) + 1;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects source byte estimates beyond the declared bound", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.coverage.estimatedSelectedSourceBytes =
      Number(archive.coverage.limits.maxEstimatedSelectedSourceBytes) + 1;

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("rejects JSON bodies beyond the declared response byte bound", async () => {
    const archive = parseArchive(await generateBundleBody());
    const maxBytes = Number(
      archive.coverage.limits.maxFinalJsonResponseBytes
    );
    archive.coverage.description = "x".repeat(maxBytes + 1);

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("accepts a fully installed optional discovery exclusion pair", async () => {
    const archive = addOptionalDiscoveryEntries(
      parseArchive(await generateBundleBody()),
      OPTIONAL_DISCOVERY_EXPORT_TABLES.length
    );

    expectAccepted(sealArchive(archive));
  });

  it.each([false, true])("verifies explicit team-access exclusions with discovery=%s", async discovery => {
    const archive = parseArchive(await generateBundleBody());
    if (discovery) addOptionalDiscoveryEntries(archive, OPTIONAL_DISCOVERY_EXPORT_TABLES.length);
    const exclusions = archive.coverage.excludedTables as Array<Record<string, unknown>>;
    for (const table of OPTIONAL_TEAM_ACCESS_EXPORT_TABLES) {
      exclusions.push({ table: table.table, category: table.category, reason: table.reason, rowCount: 1, countScope: "organization_id", valuesExported: false });
    }
    expectAccepted(sealArchive(archive));
  });

  it.each([1, 2])("rejects a partial team-access exclusion group of %s tables", async count => {
    const archive = parseArchive(await generateBundleBody());
    const exclusions = archive.coverage.excludedTables as Array<Record<string, unknown>>;
    for (const table of OPTIONAL_TEAM_ACCESS_EXPORT_TABLES.slice(0, count)) {
      exclusions.push({ table: table.table, category: table.category, reason: table.reason, rowCount: 0, countScope: "organization_id", valuesExported: false });
    }
    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("accepts activated modules exported with values and their declared omissions", async () => {
    const body = await generateActivatedBundleBody();
    const result = expectAccepted(body);
    expect(result.tableChecksums.map((entry) => entry.table)).toEqual(
      [...CANONICAL_EXPORT_TABLES, ...OPTIONAL_INCLUDED_EXPORT_TABLES].map((table) => table.name)
    );
    expect(result.includedRowCount).toBe(1 + OPTIONAL_INCLUDED_EXPORT_TABLES.length);
  });

  it.each([
    ["one table of a module removed", (archive: ArchiveBundle) => {
      delete archive.data.class_plan_templates;
      archive.coverage.includedTables = archive.coverage.includedTables.filter((entry) => entry.table !== "class_plan_templates");
      archive.coverage.includedRowCount -= 1;
      archive.coverage.excludedColumns = (archive.coverage.excludedColumns as Array<Record<string, unknown>>)
        .filter((entry) => entry.table !== "class_plan_templates");
    }],
    ["an omitted credential added back", (archive: ArchiveBundle) => {
      archive.data.admission_links[0]!.token = "0123456789abcdef0123456789abcdef";
    }],
    ["the omission manifest stripped", (archive: ArchiveBundle) => {
      archive.coverage.excludedColumns = (archive.coverage.excludedColumns as Array<Record<string, unknown>>)
        .filter((entry) => entry.table !== "admission_links");
    }],
    ["a non-boolean link state", (archive: ArchiveBundle) => {
      archive.data.admission_links[0]!.enabled = "yes";
    }],
    ["an impossible objective date", (archive: ArchiveBundle) => {
      archive.data.athlete_objectives[0]!.target_date = "2026-02-30";
    }],
    ["a fractional block position", (archive: ArchiveBundle) => {
      archive.data.session_plan_blocks[0]!.position = 1.5;
    }],
    ["an unclassified key inside a template block", (archive: ArchiveBundle) => {
      const blocks = archive.data.class_plan_templates[0]!.blocks as Array<Record<string, unknown>>;
      blocks[0]!.privateNote = "unclassified";
    }],
    ["a template block missing a classified field", (archive: ArchiveBundle) => {
      const blocks = archive.data.class_plan_templates[0]!.blocks as Array<Record<string, unknown>>;
      delete blocks[0]!.durationMinutes;
    }],
    ["template blocks serialized as text", (archive: ArchiveBundle) => {
      archive.data.class_plan_templates[0]!.blocks = JSON.stringify(archive.data.class_plan_templates[0]!.blocks);
    }],
    ["a non-text block content", (archive: ArchiveBundle) => {
      const blocks = archive.data.class_plan_templates[0]!.blocks as Array<Record<string, unknown>>;
      blocks[1]!.content = { nested: true };
    }],
    ["more than 20 template blocks", (archive: ArchiveBundle) => {
      const blocks = archive.data.class_plan_templates[0]!.blocks as Array<Record<string, unknown>>;
      archive.data.class_plan_templates[0]!.blocks = Array.from({ length: 21 }, () => ({ ...blocks[0]! }));
    }],
    ["a row from another academy", (archive: ArchiveBundle) => {
      archive.data.admission_requests[0]!.organization_id = otherOrganizationId;
    }],
  ])("rejects activated module archives with %s after hashes are recomputed", async (_case, change) => {
    const archive = parseArchive(await generateActivatedBundleBody());
    change(archive);
    expectRejectedWithoutDisclosure(sealArchive(archive, { refreshTableChecksums: true }));
  });

  it("rejects a partial optional discovery installation with a refreshed bundle hash", async () => {
    const archive = addOptionalDiscoveryEntries(
      parseArchive(await generateBundleBody()),
      1
    );

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it.each([
    ["above signed int8 range", "9223372036854775808"],
    ["oversized decimal", "9".repeat(100_000)],
  ])("rejects an excluded count that is %s", async (_reason, count) => {
    const archive = withFirstScopedExcludedCount(
      parseArchive(await generateBundleBody()),
      count
    );

    expectRejectedWithoutDisclosure(sealArchive(archive));
  });

  it("accepts the maximum PostgreSQL int8 excluded count as a decimal string", async () => {
    const archive = withFirstScopedExcludedCount(
      parseArchive(await generateBundleBody()),
      "9223372036854775807"
    );

    expectAccepted(sealArchive(archive));
  });

  it.each(["status", "starts_at", "ends_at"])(
    "rejects null in NOT NULL sessions.%s with valid checksums",
    async (column) => {
      const archive = parseArchive(await generateBundleBody());
      archive.data.sessions[0]![column] = null;

      expectRejectedWithoutDisclosure(
        sealArchive(archive, { refreshTableChecksums: true })
      );
    }
  );

  it("rejects a fractional sessions.capacity_override with valid checksums", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.sessions[0]!.capacity_override = 1.5;

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects an impossible calendar date after table and bundle hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.people[0]!.date_of_birth = "2014-02-30";

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects an invalid session timestamp after table and bundle hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.sessions[0]!.starts_at = "2026-02-30T17:00:00.000Z";

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });

  it("rejects an out-of-range local class time after hashes are recomputed", async () => {
    const archive = parseArchive(await generateBundleBody());
    archive.data.class_template_weekdays[0]!.starts_at_local = "25:00:00";

    expectRejectedWithoutDisclosure(
      sealArchive(archive, { refreshTableChecksums: true })
    );
  });
});
