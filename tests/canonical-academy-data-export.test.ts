import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { exportCanonicalAcademyData } from "@/modules/data-rights/application/canonical-academy-return";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  OPTIONAL_DISCOVERY_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";

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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => Promise<unknown>) =>
    callback({ execute: mocks.execute })
  );
});

describe("canonical export failure boundaries (database mocked)", () => {
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

  it("rejects malformed identifiers without entering a transaction", async () => {
    await expect(exportCanonicalAcademyData({ ...actor, organizationId: "invalid" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
