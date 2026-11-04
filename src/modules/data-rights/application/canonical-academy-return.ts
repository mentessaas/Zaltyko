import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_OMISSIONS,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  EXCLUDED_CANONICAL_SOURCES,
  EXCLUDED_CANONICAL_TABLES,
  type CanonicalExportTableSpec,
} from "./catalog";

const MAX_EXPORT_ROWS = 20_000;
const MAX_ESTIMATED_SOURCE_BYTES = 2_000_000;
const MAX_RESPONSE_BYTES = 3_500_000;
const MAX_STATEMENT_TIMEOUT_MS = 2_000;
const MAX_EXPORT_DURATION_MS = 20_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExportStatus = 403 | 404 | 413 | 503;

export class CanonicalAcademyExportError extends Error {
  constructor(
    public readonly status: ExportStatus,
    public readonly problemType: string,
    message: string
  ) {
    super(message);
    this.name = "CanonicalAcademyExportError";
  }
}

interface CatalogRow {
  table_name: string;
  column_name: string | null;
}

interface TableSizeRow {
  table_name: string;
  row_count: number | string;
  estimated_bytes: number | string;
}

interface ExcludedTableCountRow {
  table_name: string;
  row_count: number | string;
}

interface MembershipRow {
  organization_status: string;
  member_status: string;
  role: string;
  location_scope_mode: string;
}

interface SnapshotRow {
  snapshot_at: Date | string;
}

type ExportRow = Record<string, unknown>;

interface TableManifestEntry {
  table: string;
  rowCount: number;
  checksumSha256: string;
}

function failClosed(): CanonicalAcademyExportError {
  return new CanonicalAcademyExportError(
    503,
    "canonical-export-schema-unavailable",
    "La exportación no está disponible porque el esquema requiere una revisión."
  );
}

function tooLarge(): CanonicalAcademyExportError {
  return new CanonicalAcademyExportError(
    413,
    "canonical-export-limit-exceeded",
    "El paquete supera uno de sus límites operativos: 2.000.000 bytes proyectados, 3.500.000 bytes de JSON final o 20.000 registros. No se ha generado una descarga parcial."
  );
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw failClosed();
  }
  return `"${value}"`;
}

function exactSetMatches(actual: readonly string[], expected: readonly string[]) {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((value) => actualSet.has(value));
}

function assertWithinDuration(startedAt: number): void {
  if (Date.now() - startedAt > MAX_EXPORT_DURATION_MS) {
    throw new CanonicalAcademyExportError(
      503,
      "canonical-export-time-limit-exceeded",
      "La exportación ha superado su límite de tiempo. Inténtalo de nuevo más tarde."
    );
  }
}

function digestRows(rows: readonly ExportRow[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    const serialized = JSON.stringify(row);
    if (serialized === undefined) throw failClosed();
    hash.update(serialized);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function serializeIdentifierList(values: readonly string[]): string {
  return values.map(quoteIdentifier).join(", ");
}

function tableProjection(table: CanonicalExportTableSpec) {
  return sql.raw(serializeIdentifierList(table.exportColumns));
}

function tableOrdering(table: CanonicalExportTableSpec) {
  return sql.raw(serializeIdentifierList(table.orderBy));
}

async function verifyCatalog(tx: TransactionClient): Promise<void> {
  const result = await tx.execute(sql`
    select tables.table_name, columns.column_name
    from information_schema.tables as tables
    left join information_schema.columns as columns
      on columns.table_schema = tables.table_schema
     and columns.table_name = tables.table_name
    where tables.table_schema = 'zaltyko'
      and tables.table_type = 'BASE TABLE'
    order by tables.table_name, columns.ordinal_position
  `);
  const rows = result.rows as unknown as CatalogRow[];
  const actualColumns = new Map<string, string[]>();

  for (const row of rows) {
    const tableColumns = actualColumns.get(row.table_name) ?? [];
    if (row.column_name) tableColumns.push(row.column_name);
    actualColumns.set(row.table_name, tableColumns);
  }

  if (
    !exactSetMatches(
      [...actualColumns.keys()],
      ALL_KNOWN_CANONICAL_TABLE_NAMES
    )
  ) {
    throw failClosed();
  }

  for (const table of CANONICAL_EXPORT_TABLES) {
    const observedColumns = actualColumns.get(table.name);
    if (!observedColumns || !exactSetMatches(observedColumns, table.expectedColumns)) {
      throw failClosed();
    }
  }
}

async function verifyOwnerMembership(
  tx: TransactionClient,
  input: { userId: string; organizationId: string }
): Promise<void> {
  const result = await tx.execute(sql`
    select organization.status as organization_status,
           member.status as member_status,
           member.role,
           member.location_scope_mode
    from zaltyko.organizations as organization
    inner join zaltyko.organization_members as member
      on member.organization_id = organization.id
    where organization.id = ${input.organizationId}::uuid
      and member.user_id = ${input.userId}::uuid
    limit 2
  `);
  const rows = result.rows as unknown as MembershipRow[];

  if (rows.length === 0) {
    throw new CanonicalAcademyExportError(
      404,
      "canonical-export-not-found",
      "No se encontró una exportación disponible para esta academia."
    );
  }
  if (rows.length !== 1) throw failClosed();

  const membership = rows[0];
  if (
    membership.member_status !== "active" ||
    !["active", "trial"].includes(membership.organization_status)
  ) {
    throw new CanonicalAcademyExportError(
      404,
      "canonical-export-not-found",
      "No se encontró una exportación disponible para esta academia."
    );
  }

  if (
    membership.role !== "owner" ||
    membership.location_scope_mode !== "all"
  ) {
    throw new CanonicalAcademyExportError(
      403,
      "canonical-export-forbidden",
      "Solo una persona Owner activa con acceso a todas las sedes puede descargar esta exportación."
    );
  }
}

async function loadSnapshotTime(tx: TransactionClient): Promise<string> {
  const result = await tx.execute(sql`
    select transaction_timestamp() as snapshot_at
  `);
  const rows = result.rows as unknown as SnapshotRow[];
  const timestamp = rows[0]?.snapshot_at;
  if (!timestamp) throw failClosed();

  const parsed =
    timestamp instanceof Date ? new Date(timestamp.getTime()) : new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) throw failClosed();
  return parsed.toISOString();
}

function buildSizePreflightQuery(organizationId: string) {
  const tableQueries = CANONICAL_EXPORT_TABLES.map((table) => {
    const relation = sql.raw(`zaltyko.${quoteIdentifier(table.name)}`);
    const organizationColumn = sql.raw(
      quoteIdentifier(table.organizationColumn)
    );

    // export_row contains only this table's literal allowlisted columns. This
    // measures the projected JSON bytes (including large TOASTed text) without
    // returning row values or expanding unclassified table columns.
    return sql`
      select ${table.name}::text as table_name,
             count(*)::integer as row_count,
             coalesce(
               sum(octet_length(row_to_json(export_row)::text)),
               0
             )::bigint as estimated_bytes
      from (
        select ${tableProjection(table)}
        from ${relation}
        where ${organizationColumn} = ${organizationId}::uuid
        order by ${tableOrdering(table)}
        limit ${MAX_EXPORT_ROWS + 1}
      ) as export_row
    `;
  });

  return sql.join(tableQueries, sql.raw(" UNION ALL "));
}

function buildExcludedCountQuery(organizationId: string) {
  const tableQueries = EXCLUDED_CANONICAL_SCOPED_TABLES.map((tableName) => {
    const relation = sql.raw(`zaltyko.${quoteIdentifier(tableName)}`);
    return sql`
      select ${tableName}::text as table_name,
             count(*)::bigint as row_count
      from ${relation}
      where "organization_id" = ${organizationId}::uuid
    `;
  });

  return sql.join(tableQueries, sql.raw(" UNION ALL "));
}

function parseCount(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw failClosed();
  return parsed;
}

function parseBytes(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw failClosed();
  return parsed;
}

function parseExcludedCount(value: number | string): number | string {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw failClosed();
  }
  if (parsed < BigInt(0)) throw failClosed();
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(parsed)
    : parsed.toString();
}

async function loadRows(
  tx: TransactionClient,
  table: CanonicalExportTableSpec,
  organizationId: string
): Promise<ExportRow[]> {
  const relation = sql.raw(`zaltyko.${quoteIdentifier(table.name)}`);
  const organizationColumn = sql.raw(
    quoteIdentifier(table.organizationColumn)
  );
  const result = await tx.execute(sql`
    select ${tableProjection(table)}
    from ${relation}
    where ${organizationColumn} = ${organizationId}::uuid
    order by ${tableOrdering(table)}
    limit ${MAX_EXPORT_ROWS + 1}
  `);
  return result.rows as unknown as ExportRow[];
}

function safeFilename(snapshotAt: string): string {
  const timestamp = snapshotAt
    .replace(/[:.]/g, "-")
    .replace(/[^0-9TZ-]/g, "");
  return `zaltyko-operational-export-${timestamp}.json`;
}

export async function exportCanonicalAcademyData(input: {
  userId: string;
  organizationId: string;
}): Promise<{
  body: string;
  filename: string;
  sizeBytes: number;
}> {
  if (!UUID_PATTERN.test(input.userId) || !UUID_PATTERN.test(input.organizationId)) {
    throw new CanonicalAcademyExportError(
      404,
      "canonical-export-not-found",
      "No se encontró una exportación disponible para esta academia."
    );
  }

  const startedAt = Date.now();
  const exportResult = await db.transaction(async (tx) => {
    // This must be the first statement so access and every data page share one
    // immutable, read-only database snapshot.
    await tx.execute(
      sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    );
    await tx.execute(
      sql.raw(`SET LOCAL statement_timeout = '${MAX_STATEMENT_TIMEOUT_MS}ms'`)
    );
    await tx.execute(sql.raw("SET LOCAL idle_in_transaction_session_timeout = '10000ms'"));

    await verifyOwnerMembership(tx, input);
    assertWithinDuration(startedAt);
    await verifyCatalog(tx);
    assertWithinDuration(startedAt);
    const snapshotAt = await loadSnapshotTime(tx);

    const excludedCountResult = await tx.execute(
      buildExcludedCountQuery(input.organizationId)
    );
    assertWithinDuration(startedAt);
    const excludedCountRows =
      excludedCountResult.rows as unknown as ExcludedTableCountRow[];
    if (excludedCountRows.length !== EXCLUDED_CANONICAL_SCOPED_TABLES.length) {
      throw failClosed();
    }
    const excludedCountByTable = new Map(
      excludedCountRows.map((row) => [
        row.table_name,
        parseExcludedCount(row.row_count),
      ])
    );
    if (excludedCountByTable.size !== EXCLUDED_CANONICAL_SCOPED_TABLES.length) {
      throw failClosed();
    }

    const preflightResult = await tx.execute(
      buildSizePreflightQuery(input.organizationId)
    );
    assertWithinDuration(startedAt);
    const sizeRows = preflightResult.rows as unknown as TableSizeRow[];
    if (sizeRows.length !== CANONICAL_EXPORT_TABLES.length) throw failClosed();

    const sizeByTable = new Map(
      sizeRows.map((row) => [
        row.table_name,
        {
          rowCount: parseCount(row.row_count),
          estimatedBytes: parseBytes(row.estimated_bytes),
        },
      ])
    );
    if (sizeByTable.size !== CANONICAL_EXPORT_TABLES.length) throw failClosed();

    let totalRows = 0;
    let estimatedSourceBytes = 0;
    for (const table of CANONICAL_EXPORT_TABLES) {
      const size = sizeByTable.get(table.name);
      if (!size) throw failClosed();
      if (size.rowCount > MAX_EXPORT_ROWS) throw tooLarge();
      totalRows += size.rowCount;
      estimatedSourceBytes += size.estimatedBytes;
      if (
        totalRows > MAX_EXPORT_ROWS ||
        estimatedSourceBytes > MAX_ESTIMATED_SOURCE_BYTES
      ) {
        throw tooLarge();
      }
    }

    const data: Record<string, ExportRow[]> = {};
    const tableManifest: TableManifestEntry[] = [];

    for (const table of CANONICAL_EXPORT_TABLES) {
      assertWithinDuration(startedAt);
      const expected = sizeByTable.get(table.name);
      if (!expected) throw failClosed();

      const rows =
        expected.rowCount === 0
          ? []
          : await loadRows(tx, table, input.organizationId);
      assertWithinDuration(startedAt);
      if (rows.length !== expected.rowCount) throw failClosed();

      data[table.name] = rows;
      tableManifest.push({
        table: table.name,
        rowCount: rows.length,
        checksumSha256: digestRows(rows),
      });
    }
    assertWithinDuration(startedAt);

    return {
      snapshotAt,
      totalRows,
      estimatedSourceBytes,
      data,
      tableManifest,
      excludedCountByTable,
    };
  });

  const basePackage = {
    package: "zaltyko-canonical-academy-data-export",
    formatVersion: 1,
    coverage: {
      scope: "bounded_operational_canonical_v1",
      complete: false,
      description:
        "Datos operativos canónicos acotados de una academia. No es una exportación integral ni un certificado de ausencia de datos.",
      snapshotIsolation: "postgres_repeatable_read_read_only",
      generatedAt: exportResult.snapshotAt,
      organizationId: input.organizationId,
      includedRowCount: exportResult.totalRows,
      estimatedSelectedSourceBytes: exportResult.estimatedSourceBytes,
      limits: {
        maxIncludedRows: MAX_EXPORT_ROWS,
        maxEstimatedSelectedSourceBytes: MAX_ESTIMATED_SOURCE_BYTES,
        maxFinalJsonResponseBytes: MAX_RESPONSE_BYTES,
        maxDurationMs: MAX_EXPORT_DURATION_MS,
        statementTimeoutMs: MAX_STATEMENT_TIMEOUT_MS,
      },
      catalogPolicy:
        "Unknown or missing canonical tables and unclassified columns in included tables fail closed before row export.",
      includedTables: exportResult.tableManifest,
      excludedTables: EXCLUDED_CANONICAL_TABLES.map((entry) => ({
        ...entry,
        rowCount: exportResult.excludedCountByTable.get(entry.table) ?? null,
        countScope: exportResult.excludedCountByTable.has(entry.table)
          ? "organization_id"
          : null,
        valuesExported: false,
      })),
      excludedColumns: CANONICAL_EXPORT_OMISSIONS,
      excludedSources: EXCLUDED_CANONICAL_SOURCES,
    },
    data: exportResult.data,
  };

  const bundleChecksumSha256 = createHash("sha256")
    .update(JSON.stringify(basePackage))
    .digest("hex");
  const body = JSON.stringify({
    ...basePackage,
    integrity: {
      algorithm: "SHA-256",
      bundleChecksumSha256,
      tableChecksumEncoding:
        "SHA-256 of each table's exported rows in primary-key order, JSON serialized one row per line.",
    },
  });
  const sizeBytes = new TextEncoder().encode(body).byteLength;

  assertWithinDuration(startedAt);
  if (sizeBytes > MAX_RESPONSE_BYTES) throw tooLarge();

  return {
    body,
    filename: safeFilename(exportResult.snapshotAt),
    sizeBytes,
  };
}
