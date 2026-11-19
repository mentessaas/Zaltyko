import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  EXCLUDED_CANONICAL_TABLES,
  OPTIONAL_DISCOVERY_EXPORT_TABLES,
  OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES,
  OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES,
  OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES,
  OPTIONAL_INCLUDED_EXPORT_MODULES,
  OPTIONAL_INCLUDED_EXPORT_TABLES,
  OPTIONAL_SHARED_CATALOG_TABLES,
  OPTIONAL_TEAM_ACCESS_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";
import { ACTIVATED_IDS, activatedCatalogRows, activatedRowsByTable } from "./helpers/activated-module-rows";

const actor = {
  userId: "20000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000001",
};
const dialect = new PgDialect();
function catalogRows() {
  return ALL_KNOWN_CANONICAL_TABLE_NAMES.flatMap(table_name => {
    const spec = CANONICAL_EXPORT_TABLES.find(table => table.name === table_name);
    return (spec?.expectedColumns ?? ["id"]).map(column_name => ({ table_name, column_name }));
  });
}
function prepareThroughMembership() {
  for (let i = 0; i < 4; i++) mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.execute.mockResolvedValueOnce({ rows: [{
    organization_status: "active", member_status: "active", role: "owner", location_scope_mode: "all",
  }] });
}

const sharedCatalogRows = (tables: readonly (typeof OPTIONAL_SHARED_CATALOG_TABLES)[number][] = OPTIONAL_SHARED_CATALOG_TABLES) =>
  tables.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name, data_type: "text" })));
const moduleNamed = (name: string) => OPTIONAL_INCLUDED_EXPORT_MODULES.find(module => module.module === name)!;
const modulesBeforeLibrary = OPTIONAL_INCLUDED_EXPORT_MODULES.filter(module => module.module !== "element_library");

/** Mocks one export with the given installed modules, extra catalog rows and rows per included table. */
function prepareExport(input: {
  modules: typeof OPTIONAL_INCLUDED_EXPORT_MODULES;
  extraCatalogRows?: Array<{ table_name: string; column_name: string; data_type?: string }>;
  rows: Record<string, Array<Record<string, unknown>>>;
}) {
  prepareThroughMembership();
  const included = [...CANONICAL_EXPORT_TABLES, ...input.modules.flatMap(module => module.tables)];
  mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...activatedCatalogRows(input.modules), ...(input.extraCatalogRows ?? [])] });
  mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-19T00:00:00Z") }] });
  mocks.execute.mockResolvedValueOnce({ rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map(table_name => ({ table_name, row_count: 0 })) });
  mocks.execute.mockResolvedValueOnce({ rows: included.map(table => ({
    table_name: table.name, row_count: (input.rows[table.name] ?? []).length, estimated_bytes: (input.rows[table.name] ?? []).length * 256,
  })) });
  for (const table of included) {
    if (input.rows[table.name]?.length) mocks.execute.mockResolvedValueOnce({ rows: input.rows[table.name] });
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) =>
    callback({ execute: mocks.execute })
  );
});

describe("canonical export failure boundaries (database mocked)", () => {
  it.each(["missing team table", "unknown team column"])("fails closed before tenant reads for %s", async kind => {
    prepareThroughMembership();
    const moduleRows = OPTIONAL_TEAM_ACCESS_EXPORT_TABLES.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })));
    const rows = [...catalogRows(), ...moduleRows];
    const observed = kind === "missing team table"
      ? rows.filter(row => row.table_name !== "organization_member_invitation_scopes")
      : [...rows, { table_name: "organization_member_invitations", column_name: "unclassified_private_payload" }];
    mocks.execute.mockResolvedValueOnce({ rows: observed });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });

  it.each([false, true])("keeps access credentials excluded with discovery installed=%s", async includeDiscovery => {
    const optionalTables = [...(includeDiscovery ? OPTIONAL_DISCOVERY_EXPORT_TABLES : []), ...OPTIONAL_TEAM_ACCESS_EXPORT_TABLES];
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...optionalTables.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-05T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...optionalTables.map(table => table.table)].map(table_name => ({ table_name, row_count: table_name === "organization_member_invitations" ? 2 : 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })) });
    const bundle = JSON.parse((await exportCanonicalAcademyData(actor)).body);
    expect(bundle.coverage.complete).toBe(false);
    for (const table of OPTIONAL_TEAM_ACCESS_EXPORT_TABLES) {
      expect(bundle.data).not.toHaveProperty(table.table);
      expect(bundle.coverage.excludedTables).toContainEqual(expect.objectContaining({ table: table.table, valuesExported: false, countScope: "organization_id" }));
    }
    expect(bundle.coverage.excludedTables).toContainEqual(expect.objectContaining({ table: "organization_member_invitations", rowCount: 2 }));
    const sqlText = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(sqlText).not.toContain("token_sha256");
    expect(sqlText).not.toContain("normalized_email");
  });
  it.each([false, true])("keeps family payment setup attempts count-only with team access installed=%s", async includeTeam => {
    const optionalTables = [...(includeTeam ? OPTIONAL_TEAM_ACCESS_EXPORT_TABLES : []), ...OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES];
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...optionalTables.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-16T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...optionalTables.map(table => table.table)].map(table_name => ({ table_name, row_count: table_name === "family_payment_setup_attempts" ? 3 : 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })) });
    const bundle = JSON.parse((await exportCanonicalAcademyData(actor)).body);
    expect(bundle.coverage.complete).toBe(false);
    expect(bundle.data).not.toHaveProperty("family_payment_setup_attempts");
    expect(bundle.coverage.excludedTables).toContainEqual(expect.objectContaining({
      table: "family_payment_setup_attempts", category: "payment_authorizations", rowCount: 3, valuesExported: false, countScope: "organization_id",
    }));
    const sqlText = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(sqlText).not.toContain("provider_customer_reference");
    expect(sqlText).not.toContain("consent_text_sha256");
    expect(sqlText).not.toContain("client_ip_prefix");
  });
  it("fails closed for an unclassified family payment setup column", async () => {
    prepareThroughMembership();
    const rows = [...catalogRows(), ...OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))];
    mocks.execute.mockResolvedValueOnce({ rows: [...rows, { table_name: "family_payment_setup_attempts", column_name: "card_last4" }] });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });
  it.each([false, true])("keeps automatic collection attempts and settings count-only with family payment setup installed=%s", async includeSetup => {
    const optionalTables = [...(includeSetup ? OPTIONAL_FAMILY_PAYMENT_SETUP_EXPORT_TABLES : []), ...OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES];
    const counts: Record<string, number> = { family_collection_attempts: 5, family_collection_attempt_charges: 7, organization_collection_settings: 1 };
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...optionalTables.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-17T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...optionalTables.map(table => table.table)].map(table_name => ({ table_name, row_count: counts[table_name] ?? 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })) });
    const bundle = JSON.parse((await exportCanonicalAcademyData(actor)).body);
    expect(bundle.coverage.complete).toBe(false);
    for (const table of OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES) {
      expect(bundle.data).not.toHaveProperty(table.table);
      expect(bundle.coverage.excludedTables).toContainEqual(expect.objectContaining({
        table: table.table, category: table.category, rowCount: counts[table.table], valuesExported: false, countScope: "organization_id",
      }));
    }
    const sqlText = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(sqlText).not.toContain("provider_payment_intent_reference");
    expect(sqlText).not.toContain("decline_code");
    expect(sqlText).not.toContain("collection_day_of_month");
  });
  it.each([false, true])("accepts the Phase 4 attempt column and keeps disputes count-only with disputes installed=%s", async includeDisputes => {
    const optionalTables = [...OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES, ...(includeDisputes ? OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES : [])];
    const counts: Record<string, number> = { family_collection_attempts: 2, family_collection_disputes: 1 };
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [
      ...catalogRows(),
      ...optionalTables.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name }))),
      { table_name: "family_collection_attempts", column_name: "action_deadline_at" },
    ] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-18T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...optionalTables.map(table => table.table)].map(table_name => ({ table_name, row_count: counts[table_name] ?? 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })) });
    const bundle = JSON.parse((await exportCanonicalAcademyData(actor)).body);
    expect(bundle.coverage.complete).toBe(false);
    expect(bundle.coverage.excludedTables).toContainEqual(expect.objectContaining({
      table: "family_collection_attempts", rowCount: 2, valuesExported: false, countScope: "organization_id",
    }));
    const disputes = bundle.coverage.excludedTables.filter((entry: { table: string }) => entry.table === "family_collection_disputes");
    expect(disputes).toEqual(includeDisputes ? [expect.objectContaining({
      category: "payment_provider_attempts", rowCount: 1, valuesExported: false, countScope: "organization_id",
    })] : []);
    expect(bundle.data).not.toHaveProperty("family_collection_disputes");
    const sqlText = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(sqlText).not.toContain("action_deadline_at");
    expect(sqlText).not.toContain("provider_dispute_reference");
  });
  it("fails closed for an unclassified automatic collection dispute column", async () => {
    prepareThroughMembership();
    const rows = [...catalogRows(), ...[...OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES, ...OPTIONAL_FAMILY_COLLECTION_EVENTS_EXPORT_TABLES].flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))];
    mocks.execute.mockResolvedValueOnce({ rows: [...rows, { table_name: "family_collection_disputes", column_name: "evidence_text" }] });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });
  it.each(["partial automatic collection group", "unclassified automatic collection column"])("fails closed for a %s", async kind => {
    prepareThroughMembership();
    const rows = [...catalogRows(), ...OPTIONAL_FAMILY_COLLECTION_EXPORT_TABLES.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))];
    const observed = kind === "partial automatic collection group"
      ? rows.filter(row => row.table_name !== "family_collection_attempt_charges")
      : [...rows, { table_name: "family_collection_attempts", column_name: "provider_error_message" }];
    mocks.execute.mockResolvedValueOnce({ rows: observed });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });
  it.each(["partial discovery module", "unclassified discovery column"])("fails closed for %s", async kind => {
    prepareThroughMembership();
    const rows = [...catalogRows(), ...OPTIONAL_DISCOVERY_EXPORT_TABLES.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))];
    const observed = kind === "partial discovery module" ? rows.filter(row => row.table_name !== "product_discovery_signals") : [...rows, { table_name: "product_discovery_interests", column_name: "private_free_text" }];
    mocks.execute.mockResolvedValueOnce({ rows: observed });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });
  it("classifies the complete optional module without exporting staff choices", async () => {
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...OPTIONAL_DISCOVERY_EXPORT_TABLES.flatMap(table => table.columns.map(column_name => ({ table_name: table.table, column_name })))] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-04T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: [...EXCLUDED_CANONICAL_SCOPED_TABLES, ...OPTIONAL_DISCOVERY_EXPORT_TABLES.map(table => table.table)].map(table_name => ({ table_name, row_count: table_name === "product_discovery_interests" ? 1 : 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })) });
    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    expect(bundle.coverage.complete).toBe(false);
    expect(bundle.data).not.toHaveProperty("product_discovery_interests");
    expect(bundle.coverage.excludedTables).toEqual(expect.arrayContaining([expect.objectContaining({ table: "product_discovery_interests", rowCount: 1, valuesExported: false })]));
  });
  it.each(["unknown table", "unclassified column", "missing table"])(
    "fails closed for %s before selecting tenant data", async (kind) => {
      prepareThroughMembership();
      let rows = catalogRows();
      if (kind === "unknown table") rows.push({ table_name: "unclassified_private_data", column_name: "id" });
      if (kind === "unclassified column") rows.push({ table_name: "people", column_name: "unclassified_private_value" });
      if (kind === "missing table") rows = rows.filter(row => row.table_name !== "guardians");
      mocks.execute.mockResolvedValueOnce({ rows });
      await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
      expect(mocks.execute).toHaveBeenCalledTimes(6);
      const first = mocks.execute.mock.calls[0][0] as Parameters<PgDialect["sqlToQuery"]>[0];
      expect(dialect.sqlToQuery(first).sql).toContain("REPEATABLE READ, READ ONLY");
      const dateStyle = mocks.execute.mock.calls[1][0] as Parameters<PgDialect["sqlToQuery"]>[0];
      expect(dialect.sqlToQuery(dateStyle).sql).toContain("SET LOCAL DateStyle = 'ISO, YMD'");
    }
  );

  it("rejects oversized row counts at preflight before materializing rows", async () => {
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: catalogRows() });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-01-01T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map(table_name => ({ table_name, row_count: 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: CANONICAL_EXPORT_TABLES.map(table => ({
      table_name: table.name, row_count: table.name === "people" ? 20_001 : 0, estimated_bytes: 0,
    })) });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 413 });
    expect(mocks.execute).toHaveBeenCalledTimes(9);
  });

  it("exports the rows of every activated module with values, checksums and their omissions", async () => {
    const activatedRows = activatedRowsByTable(actor.organizationId);
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...activatedCatalogRows()] });
    mocks.execute.mockResolvedValueOnce({ rows: [{ snapshot_at: new Date("2026-11-13T00:00:00Z") }] });
    mocks.execute.mockResolvedValueOnce({ rows: EXCLUDED_CANONICAL_SCOPED_TABLES.map(table_name => ({ table_name, row_count: 0 })) });
    mocks.execute.mockResolvedValueOnce({ rows: [
      ...CANONICAL_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 0, estimated_bytes: 0 })),
      ...OPTIONAL_INCLUDED_EXPORT_TABLES.map(table => ({ table_name: table.name, row_count: 1, estimated_bytes: 256 })),
    ] });
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) mocks.execute.mockResolvedValueOnce({ rows: activatedRows[table.name] });

    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    expect(bundle.coverage.complete).toBe(false);
    expect(Object.keys(bundle.data)).toEqual([...CANONICAL_EXPORT_TABLES, ...OPTIONAL_INCLUDED_EXPORT_TABLES].map(table => table.name));
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) {
      expect(bundle.data[table.name]).toEqual(activatedRows[table.name]);
      expect(bundle.coverage.includedTables).toContainEqual(expect.objectContaining({ table: table.name, rowCount: 1 }));
    }
    expect(bundle.data.admission_requests[0].contact_email).toBe("family@example.invalid");
    expect(bundle.coverage.excludedColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "admission_links", column: "token" }),
      expect.objectContaining({ table: "session_plans", column: "last_request_id" }),
    ]));
    expect(bundle.coverage.excludedColumns).not.toContainEqual(expect.objectContaining({ table: "class_plan_templates", column: "blocks" }));
    expect(bundle.data.class_plan_templates[0].blocks).toHaveLength(2);
    const loads = mocks.execute.mock.calls.slice(-OPTIONAL_INCLUDED_EXPORT_TABLES.length).map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(loads).toContain('"target_date"::text');
    // Los bloques salen por la proyección revisada, campo a campo, nunca en crudo.
    expect(loads).toContain("jsonb_array_elements");
    expect(loads).not.toMatch(/, "blocks"(,| from)/);
    for (const hidden of ['"token"', '"client_request_id"', '"last_request_id"', '"submission_id"']) {
      expect(loads).not.toContain(hidden);
    }
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: actor.organizationId })).toMatchObject({
      valid: true, includedTableCount: CANONICAL_EXPORT_TABLES.length + OPTIONAL_INCLUDED_EXPORT_TABLES.length, includedRowCount: OPTIONAL_INCLUDED_EXPORT_TABLES.length,
    });
  });

  it.each(OPTIONAL_INCLUDED_EXPORT_MODULES.map(module => module.module))("fails closed for a partial %s module or an unclassified column", async moduleName => {
    const module = OPTIONAL_INCLUDED_EXPORT_MODULES.find(item => item.module === moduleName)!;
    for (const kind of ["partial", "column"] as const) {
      vi.resetAllMocks();
      mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) => callback({ execute: mocks.execute }));
      prepareThroughMembership();
      const rows = [...catalogRows(), ...activatedCatalogRows([module])];
      // Un módulo de una sola tabla sin ella está ausente, no a medias: «a
      // medias» es entonces la tabla con una columna menos.
      const lastTable = module.tables[module.tables.length - 1]!;
      const missingColumn = lastTable.expectedColumns.find(column => column !== lastTable.organizationColumn && column !== "id")!;
      const observed = kind === "partial"
        ? module.tables.length === 1
          ? rows.filter(row => row.table_name !== lastTable.name || row.column_name !== missingColumn)
          : rows.filter(row => row.table_name !== lastTable.name)
        : [...rows, { table_name: module.tables[0]!.name, column_name: "unclassified_private_note", data_type: "text" }];
      mocks.execute.mockResolvedValueOnce({ rows: observed });
      await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
      expect(mocks.execute).toHaveBeenCalledTimes(6);
    }
  });

  it("keeps the package of a database without the element library exactly as before the library", async () => {
    // Todas las funciones de antes de la biblioteca instaladas, sin ninguna
    // tabla ni columna nueva: mismas tablas, mismas columnas y mismas
    // exclusiones, en el mismo orden, que el paquete de hoy.
    const rows = activatedRowsByTable(actor.organizationId, modulesBeforeLibrary);
    prepareExport({ modules: modulesBeforeLibrary, rows });
    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    const scoped = new Set<string>(EXCLUDED_CANONICAL_SCOPED_TABLES);
    expect(JSON.stringify(bundle.coverage.excludedTables)).toBe(JSON.stringify(EXCLUDED_CANONICAL_TABLES.map(entry => ({
      ...entry,
      rowCount: scoped.has(entry.table) ? 0 : null,
      countScope: scoped.has(entry.table) ? "organization_id" : null,
      valuesExported: false,
    }))));
    expect(Object.keys(bundle.data)).toEqual([...CANONICAL_EXPORT_TABLES, ...modulesBeforeLibrary.flatMap(module => module.tables)].map(table => table.name));
    for (const module of modulesBeforeLibrary) {
      for (const table of module.tables) {
        expect(bundle.data[table.name], table.name).toEqual(rows[table.name]);
        expect(Object.keys(bundle.data[table.name][0]), table.name).toEqual([...table.exportColumns]);
      }
    }
    for (const absent of ["catalog_element_id", "catalogElementId", "academy_element_notes", ...OPTIONAL_SHARED_CATALOG_TABLES.map(table => table.table)]) {
      expect(result.body.includes(absent), absent).toBe(false);
    }
    const loads = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    expect(loads).not.toContain('"catalog_element_id"');
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: actor.organizationId }).valid).toBe(true);
  });

  it("lists the installed library catalogs as excluded without counting or reading them", async () => {
    prepareExport({ modules: [], extraCatalogRows: sharedCatalogRows(), rows: {} });
    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    expect(bundle.coverage.excludedTables.slice(-OPTIONAL_SHARED_CATALOG_TABLES.length)).toEqual(
      OPTIONAL_SHARED_CATALOG_TABLES.map(table => ({
        table: table.table, category: table.category, reason: table.reason, rowCount: null, countScope: null, valuesExported: false,
      }))
    );
    expect(bundle.coverage.excludedTables.find((entry: { table: string }) => entry.table === "content_notices"))
      .toMatchObject({ category: "internal_content_notices" });
    for (const table of OPTIONAL_SHARED_CATALOG_TABLES) expect(bundle.data).not.toHaveProperty(table.table);
    // Ni recuento ni lectura: ninguna consulta toca las tablas globales.
    const queries = mocks.execute.mock.calls.slice(6).map(call => dialect.sqlToQuery(call[0]).sql).join("\n");
    for (const table of OPTIONAL_SHARED_CATALOG_TABLES) expect(queries).not.toContain(`zaltyko."${table.table}"`);
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: actor.organizationId }).valid).toBe(true);
  });

  it.each(["partial library catalogs", "unclassified library catalog column", "missing library catalog column"])("fails closed for %s", async kind => {
    prepareThroughMembership();
    const shared = kind === "partial library catalogs"
      ? sharedCatalogRows(OPTIONAL_SHARED_CATALOG_TABLES.filter(table => table.table !== "content_withdrawals"))
      : kind === "unclassified library catalog column"
        ? [...sharedCatalogRows(), { table_name: "content_notices", column_name: "sender_phone", data_type: "text" }]
        : sharedCatalogRows().filter(row => !(row.table_name === "catalog_elements" && row.column_name === "withdrawn_reason"));
    mocks.execute.mockResolvedValueOnce({ rows: [...catalogRows(), ...shared] });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });

  it("exports catalog_element_id last when skill_elements and session_plan_blocks have the library link column", async () => {
    const modules = [moduleNamed("session_plans"), moduleNamed("skill_levels")];
    const rows = activatedRowsByTable(actor.organizationId, modules);
    rows.skill_elements = rows.skill_elements!.map(row => ({ ...row, catalog_element_id: ACTIVATED_IDS.catalogElement }));
    rows.session_plan_blocks = rows.session_plan_blocks!.map(row => ({ ...row, catalog_element_id: null }));
    prepareExport({
      modules,
      extraCatalogRows: [
        { table_name: "skill_elements", column_name: "catalog_element_id", data_type: "uuid" },
        { table_name: "session_plan_blocks", column_name: "catalog_element_id", data_type: "uuid" },
      ],
      rows,
    });
    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    for (const name of ["skill_elements", "session_plan_blocks"]) {
      const spec = OPTIONAL_INCLUDED_EXPORT_TABLES.find(table => table.name === name)!;
      expect(Object.keys(bundle.data[name][0]), name).toEqual([...spec.exportColumns, "catalog_element_id"]);
      const load = mocks.execute.mock.calls.map(call => dialect.sqlToQuery(call[0]).sql)
        .find(query => query.includes(`from zaltyko."${name}"`) && !query.includes("estimated_bytes"))!;
      expect(load, name).toMatch(/, "catalog_element_id"\s+from zaltyko\./);
    }
    expect(bundle.data.skill_elements[0].catalog_element_id).toBe(ACTIVATED_IDS.catalogElement);
    expect(bundle.data.session_plan_blocks[0].catalog_element_id).toBeNull();
    // Las demás tablas no cambian y la columna no se declara como omitida.
    expect(Object.keys(bundle.data.skill_levels[0])).toEqual([...OPTIONAL_INCLUDED_EXPORT_TABLES.find(table => table.name === "skill_levels")!.exportColumns]);
    expect(bundle.coverage.excludedColumns).not.toContainEqual(expect.objectContaining({ column: "catalog_element_id" }));
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: actor.organizationId }).valid).toBe(true);
  });

  it.each([
    ["an unclassified column next to the link", [["skill_elements", "catalog_element_id"], ["skill_elements", "zz"]]],
    ["an unclassified column instead of the link", [["skill_elements", "zz"]]],
    ["the link on a table that does not declare it", [["skill_levels", "catalog_element_id"]]],
  ] as const)("fails closed for %s", async (_label, extra) => {
    prepareThroughMembership();
    mocks.execute.mockResolvedValueOnce({ rows: [
      ...catalogRows(),
      ...activatedCatalogRows([moduleNamed("skill_levels")]),
      ...extra.map(([table_name, column_name]) => ({ table_name, column_name, data_type: "text" })),
    ] });
    await expect(exportCanonicalAcademyData(actor)).rejects.toMatchObject({ status: 503, problemType: "canonical-export-schema-unavailable" });
    expect(mocks.execute).toHaveBeenCalledTimes(6);
  });

  it("exports the academy notes of the element library with values when installed with its catalogs", async () => {
    const modules = [moduleNamed("element_library")];
    const rows = activatedRowsByTable(actor.organizationId, modules);
    prepareExport({ modules, extraCatalogRows: sharedCatalogRows(), rows });
    const result = await exportCanonicalAcademyData(actor);
    const bundle = JSON.parse(result.body);
    expect(bundle.data.academy_element_notes).toEqual(rows.academy_element_notes);
    expect(Object.keys(bundle.data.academy_element_notes[0])).toEqual([
      "id", "organization_id", "catalog_element_id", "note", "revision", "created_by_member_id", "updated_by_member_id", "created_at", "updated_at",
    ]);
    expect(bundle.coverage.includedTables).toContainEqual(expect.objectContaining({ table: "academy_element_notes", rowCount: 1 }));
    expect(validateCanonicalAcademyArchive({ body: result.body, organizationId: actor.organizationId }).valid).toBe(true);
  });

  it("rejects malformed identifiers without entering a transaction", async () => {
    await expect(exportCanonicalAcademyData({ ...actor, organizationId: "invalid" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
