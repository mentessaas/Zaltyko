import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_OMISSIONS,
  CANONICAL_EXPORT_TABLES,
  CLASS_PLAN_TEMPLATE_BLOCK_FIELDS,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  EXCLUDED_CANONICAL_SOURCES,
  EXCLUDED_CANONICAL_TABLES,
  exportOmissionsFor,
  OPTIONAL_EXPORT_MODULE_GROUPS,
  OPTIONAL_INCLUDED_EXPORT_MODULES,
  OPTIONAL_INCLUDED_EXPORT_TABLES,
  type CanonicalExportTableSpec,
} from "./catalog";

const PACKAGE_NAME = "zaltyko-canonical-academy-data-export";
const FORMAT_VERSION = 1;
const MAX_INCLUDED_ROWS = 20_000;
const MAX_ESTIMATED_SOURCE_BYTES = 2_000_000;
const MAX_FINAL_JSON_RESPONSE_BYTES = 3_500_000;
const MAX_EXPORT_DURATION_MS = 20_000;
const STATEMENT_TIMEOUT_MS = 2_000;
const CHECKSUM_ENCODING =
  "SHA-256 of each table's exported rows in primary-key order, JSON serialized one row per line.";
const COVERAGE_DESCRIPTION =
  "Datos operativos canónicos acotados de una academia. No es una exportación integral ni un certificado de ausencia de datos.";
const CATALOG_POLICY =
  "Unknown or missing canonical tables and unclassified columns in included tables fail closed before row export.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const ENVELOPE_KEYS = [
  "package",
  "formatVersion",
  "coverage",
  "data",
  "integrity",
] as const;
const COVERAGE_KEYS = [
  "scope",
  "complete",
  "description",
  "snapshotIsolation",
  "generatedAt",
  "organizationId",
  "includedRowCount",
  "estimatedSelectedSourceBytes",
  "limits",
  "catalogPolicy",
  "includedTables",
  "excludedTables",
  "excludedColumns",
  "excludedSources",
] as const;
const LIMIT_KEYS = [
  "maxIncludedRows",
  "maxEstimatedSelectedSourceBytes",
  "maxFinalJsonResponseBytes",
  "maxDurationMs",
  "statementTimeoutMs",
] as const;
const MANIFEST_KEYS = ["table", "rowCount", "checksumSha256"] as const;
const EXCLUDED_TABLE_KEYS = [
  "table",
  "category",
  "reason",
  "rowCount",
  "countScope",
  "valuesExported",
] as const;
const INTEGRITY_KEYS = [
  "algorithm",
  "bundleChecksumSha256",
  "tableChecksumEncoding",
] as const;

// Nullable columns are enumerated from the current Drizzle schema and must
// belong to the catalog's exported projection. Unlisted exported columns are
// treated as required to be non-null by this verifier.
const NULLABLE_COLUMNS_BY_TABLE: Readonly<Record<string, readonly string[]>> = {
  organizations: ["legal_name"],
  locations: [],
  facilities: [],
  spaces: ["capacity"],
  organization_members: [],
  member_location_scopes: [],
  people: ["preferred_name", "date_of_birth"],
  athletes: ["external_reference"],
  families: ["external_reference"],
  guardians: [],
  guardian_contacts: ["verified_at"],
  family_guardians: [],
  family_members: ["ends_on"],
  family_payers: ["ends_on"],
  family_collection_preferences: ["entitlement_revision"],
  staff_profiles: ["member_id"],
  organization_sports: ["ends_on"],
  programs: ["organization_sport_id", "activity_key"],
  groups: ["program_id", "capacity"],
  group_memberships: ["ends_on"],
  group_membership_history: ["from_status", "reason_code"],
  class_templates: ["program_id", "default_space_id", "effective_to"],
  class_template_groups: [],
  class_template_weekdays: [],
  sessions: ["space_id", "capacity_override", "cancellation_reason"],
  session_staff: [],
  price_plans: [],
  enrollments: ["price_plan_id", "ends_on", "source_entity_id"],
  enrollment_status_history: [
    "from_status",
    "reason_code",
    "changed_by_member_id",
  ],
  enrollment_pauses: ["ends_on", "reason_code"],
  attendance_records: ["recorded_by_member_id"],
  trials: [
    "converted_enrollment_id",
    "attended_at",
    "completed_at",
    "converted_at",
  ],
  trial_status_history: ["from_status", "changed_by_member_id"],
  trial_followups: ["completed_by_member_id"],
  waitlist_entries: [
    "class_template_id",
    "program_id",
    "source_trial_id",
    "contact_guardian_id",
    "contact_consent_recorded_at",
    "converted_enrollment_id",
  ],
  waitlist_offers: ["responded_at"],
  price_plan_class_template_coverage: ["ends_on"],
  enrollment_price_assignments: ["ends_on"],
  invoices: ["location_id", "family_payer_id", "issued_at", "voided_at"],
  invoice_lines: ["location_id", "athlete_id", "enrollment_id", "price_plan_id"],
  invoice_line_enrollments: [],
  charges: ["location_id", "family_payer_id", "enrollment_id"],
  payments: [
    "location_id",
    "family_payer_id",
    "manual_method",
    "manual_reference",
  ],
  payment_allocations: [],
  refunds: [],
  financial_reconciliation_runs: [],
  // Activated academy modules (catalog OPTIONAL_INCLUDED_EXPORT_MODULES).
  athlete_objectives: ["discipline", "apparatus", "target_date"],
  athlete_objective_status_history: ["from_status"],
  athlete_observations: ["session_id", "objective_id"],
  class_template_staff: ["assigned_by_member_id"],
  session_staff_overrides: ["reason", "changed_by_member_id"],
  session_plans: ["focus", "note", "from_template_revision"],
  session_plan_blocks: [
    "discipline",
    "apparatus",
    "duration_minutes",
    "done_at",
    "done_by_member_id",
  ],
  session_plan_objectives: [],
  class_plan_templates: ["focus", "note"],
  admission_links: ["location_id", "revoked_at"],
  admission_requests: [
    "contact_phone",
    "athlete_birth_year",
    "message",
    "converted_athlete_id",
    "waitlist_entry_id",
    "handled_by_member_id",
    "handled_at",
    "anonymized_at",
  ],
  payment_reminder_settings: [
    "subject_template",
    "body_template",
    "payment_instructions",
    "reply_to_email",
    "updated_by_member_id",
  ],
  payment_reminders: ["guardian_id", "requested_by_member_id", "sent_at"],
};

// `tx.execute(sql)` returns node-postgres raw rows. int4 is a JS number;
// int8 money columns remain canonical decimal strings with the default pg parser.
const INT4_COLUMNS_BY_TABLE: Readonly<Record<string, readonly string[]>> = {
  spaces: ["capacity"],
  family_collection_preferences: ["version", "entitlement_revision"],
  groups: ["capacity"],
  class_templates: ["capacity"],
  class_template_weekdays: ["iso_weekday"],
  sessions: ["capacity_override"],
  price_plans: ["amount_cents"],
  enrollments: ["version"],
  trials: ["version"],
  waitlist_entries: ["priority", "version"],
  waitlist_offers: ["version"],
  invoices: ["version"],
  invoice_lines: ["quantity"],
  charges: ["version"],
  payments: ["version"],
  financial_reconciliation_runs: ["formula_version"],
  athlete_objectives: ["revision"],
  athlete_objective_status_history: ["revision"],
  athlete_observations: ["revision"],
  session_plans: ["from_template_revision", "revision"],
  session_plan_blocks: ["position", "duration_minutes"],
  class_plan_templates: ["revision"],
  admission_requests: ["athlete_birth_year", "revision"],
  payment_reminder_settings: ["min_interval_days", "auto_after_days", "version"],
};

const INT8_DECIMAL_STRING_COLUMNS_BY_TABLE: Readonly<
  Record<string, readonly string[]>
> = {
  enrollment_price_assignments: ["unit_amount_cents"],
  invoices: ["total_amount_cents"],
  invoice_lines: ["unit_amount_cents", "amount_cents"],
  charges: ["amount_cents"],
  payments: ["amount_cents"],
  payment_allocations: ["amount_cents"],
  refunds: ["amount_cents"],
  financial_reconciliation_runs: [
    "expected_cents",
    "allocated_cents",
    "refunded_cents",
    "net_collected_cents",
    "outstanding_cents",
  ],
  payment_reminders: ["outstanding_cents"],
};

const POSTGRES_BIGINT_MIN = BigInt("-9223372036854775808");
const POSTGRES_BIGINT_MAX = BigInt("9223372036854775807");

type JsonRecord = Record<string, unknown>;

export class CanonicalAcademyArchiveVerificationError extends Error {
  constructor() {
    super("No se pudo verificar el archivo canónico de la academia.");
    this.name = "CanonicalAcademyArchiveVerificationError";
  }
}

export interface CanonicalAcademyArchiveVerificationReport {
  /** The declared v1 structure, selected row shape, tenant scope, and hashes passed. */
  valid: true;
  partial: true;
  limited: true;
  restorable: false;
  authenticityVerified: false;
  authorizationVerified: false;
  referentialIntegrityVerified: false;
  sourceCompletenessVerified: false;
  tenantScopeVerified: true;
  checksumsVerified: true;
  scopeOrganizationId: string;
  includedTableCount: number;
  includedRowCount: number;
  declaredEstimatedSelectedSourceBytes: number;
  bodyBytes: number;
  bundleChecksumSha256: string;
  tableChecksums: Array<{
    table: string;
    rowCount: number;
    checksumSha256: string;
  }>;
}

function rejectArchive(): never {
  throw new CanonicalAcademyArchiveVerificationError();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is JsonRecord {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isSafeCount(value: unknown, maximum?: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    (maximum === undefined || value <= maximum)
  );
}

function isExcludedCount(value: unknown): boolean {
  if (isSafeCount(value)) return true;
  if (
    typeof value !== "string" ||
    value.length > 19 ||
    !/^[1-9][0-9]*$/.test(value)
  ) {
    return false;
  }
  const parsed = BigInt(value);
  return (
    parsed > BigInt(Number.MAX_SAFE_INTEGER) &&
    parsed <= POSTGRES_BIGINT_MAX
  );
}

function isIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(
      value
    );
  if (!match) return false;
  return (
    isGregorianDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    Number(match[4]) < 24 &&
    Number(match[5]) < 60 &&
    Number(match[6]) < 60
  );
}

function isGregorianDate(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1]!;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  return isGregorianDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isPostgresTimestamptz(value: string): boolean {
  // node-postgres parses timestamptz as Date by default, so JSON.stringify
  // emits strict ISO UTC with millisecond precision. Keep support for the
  // PostgreSQL text form too, without normalizing its checksum bytes.
  if (isIsoTimestamp(value)) return true;

  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2})(?::(\d{2})(?::(\d{2}))?)?$/.exec(
      value
    );
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const offsetHour = Number(match[9]);
  const offsetMinute = Number(match[10] ?? 0);
  const offsetSecond = Number(match[11] ?? 0);
  return (
    isGregorianDate(Number(yearText), Number(monthText), Number(dayText)) &&
    Number(hourText) < 24 &&
    Number(minuteText) < 60 &&
    Number(secondText) < 60 &&
    offsetHour <= 15 &&
    offsetMinute < 60 &&
    offsetSecond < 60
  );
}

function isLocalTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/.exec(value);
  if (!match) return false;
  const [, hour, minute, second] = match;
  return Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60;
}

function hasWellFormedSurrogatePairs(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function assertJsonStringsAreWellFormed(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (!hasWellFormedSurrogatePairs(current)) rejectArchive();
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    if (isRecord(current)) {
      for (const [key, item] of Object.entries(current)) {
        if (!hasWellFormedSurrogatePairs(key)) rejectArchive();
        pending.push(item);
      }
    }
  }
}

function isPostgresInt4(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= -2_147_483_648 &&
    value <= 2_147_483_647
  );
}

function isPostgresBigintDecimalString(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 20 ||
    !/^(?:0|-?[1-9][0-9]*)$/.test(value)
  ) {
    return false;
  }
  const parsed = BigInt(value);
  return parsed >= POSTGRES_BIGINT_MIN && parsed <= POSTGRES_BIGINT_MAX;
}

function isBooleanColumn(column: string): boolean {
  return (
    column.startsWith("is_") ||
    column.startsWith("can_") ||
    column === "contactable" ||
    column === "pilot" ||
    column === "enabled"
  );
}

function isDateColumn(column: string): boolean {
  return (
    column === "date_of_birth" ||
    column.endsWith("_on") ||
    column === "effective_from" ||
    column === "effective_to" ||
    column === "period_start" ||
    column === "period_end" ||
    column === "service_period_start" ||
    column === "service_period_end" ||
    column === "target_date"
  );
}

function hasMappedColumn(
  mapping: Readonly<Record<string, readonly string[]>>,
  table: string,
  column: string
): boolean {
  return mapping[table]?.includes(column) ?? false;
}

const MAX_CLASS_PLAN_TEMPLATE_BLOCKS = 20;

/** class_plan_templates.blocks: only the classified fields of each block. */
function validateClassPlanTemplateBlocks(value: unknown): void {
  if (!Array.isArray(value) || value.length > MAX_CLASS_PLAN_TEMPLATE_BLOCKS) {
    rejectArchive();
  }
  for (const block of value) {
    if (!isRecord(block)) rejectArchive();
    const keys = Object.keys(block);
    if (
      keys.length !== CLASS_PLAN_TEMPLATE_BLOCK_FIELDS.length ||
      CLASS_PLAN_TEMPLATE_BLOCK_FIELDS.some(
        (field) => !Object.prototype.hasOwnProperty.call(block, field)
      )
    ) {
      rejectArchive();
    }
    for (const field of ["kind", "discipline", "apparatus", "content"] as const) {
      if (block[field] !== null && typeof block[field] !== "string") rejectArchive();
    }
    const duration = block.durationMinutes;
    if (duration !== null && (typeof duration !== "number" || !Number.isFinite(duration))) {
      rejectArchive();
    }
  }
}

const STRUCTURED_JSON_COLUMNS: Readonly<Record<string, (value: unknown) => void>> = {
  "class_plan_templates.blocks": validateClassPlanTemplateBlocks,
};

function validateColumnValue(
  table: CanonicalExportTableSpec,
  column: string,
  value: unknown
): void {
  const structured = STRUCTURED_JSON_COLUMNS[`${table.name}.${column}`];
  if (structured) {
    structured(value);
    return;
  }
  const uuidColumn = column === "id" || column.endsWith("_id");

  if (value === null) {
    if (!hasMappedColumn(NULLABLE_COLUMNS_BY_TABLE, table.name, column)) {
      rejectArchive();
    }
    return;
  }

  if (uuidColumn) {
    if (!isUuid(value)) rejectArchive();
    return;
  }
  if (isBooleanColumn(column)) {
    if (typeof value !== "boolean") rejectArchive();
    return;
  }
  if (hasMappedColumn(INT4_COLUMNS_BY_TABLE, table.name, column)) {
    if (!isPostgresInt4(value)) rejectArchive();
    return;
  }
  if (hasMappedColumn(INT8_DECIMAL_STRING_COLUMNS_BY_TABLE, table.name, column)) {
    if (!isPostgresBigintDecimalString(value)) rejectArchive();
    return;
  }
  if (column.endsWith("_at_local")) {
    if (typeof value !== "string" || !isLocalTime(value)) rejectArchive();
    return;
  }
  if (column.endsWith("_at")) {
    if (typeof value !== "string" || !isPostgresTimestamptz(value)) {
      rejectArchive();
    }
    return;
  }
  if (isDateColumn(column)) {
    if (typeof value !== "string" || !isIsoDate(value)) rejectArchive();
    return;
  }
  if (typeof value === "number") {
    // Every numeric column in the current export catalog has an explicit
    // PostgreSQL int4 or int8 representation above. Fail closed on new kinds.
    rejectArchive();
  }
  if (typeof value !== "string") rejectArchive();
}

function compareUuidTuples(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! < right[index]!) return -1;
    if (left[index]! > right[index]!) return 1;
  }
  return 0;
}

function rowOrderKey(
  table: CanonicalExportTableSpec,
  row: JsonRecord
): string[] {
  return table.orderBy.map((column) => {
    const value = row[column];
    if (!isUuid(value)) rejectArchive();
    return value.toLowerCase();
  });
}

function digestRows(rows: readonly JsonRecord[]): string {
  const hash = createHash("sha256");
  for (const row of rows) {
    const serialized = JSON.stringify(row);
    if (serialized === undefined) rejectArchive();
    hash.update(serialized);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function assertColumnMapMatchesCatalog(
  mapping: Readonly<Record<string, readonly string[]>>,
  requireEveryTable: boolean
): void {
  const includedByName = new Map<string, CanonicalExportTableSpec>(
    [...CANONICAL_EXPORT_TABLES, ...OPTIONAL_INCLUDED_EXPORT_TABLES].map(
      (table): [string, CanonicalExportTableSpec] => [table.name, table]
    )
  );
  const mappedTableNames = Object.keys(mapping);
  if (requireEveryTable && mappedTableNames.length !== includedByName.size) {
    rejectArchive();
  }

  for (const tableName of mappedTableNames) {
    const table = includedByName.get(tableName);
    const columns = mapping[tableName];
    if (
      !table ||
      !columns ||
      new Set(columns).size !== columns.length ||
      columns.some((column) => !table.exportColumns.includes(column))
    ) {
      rejectArchive();
    }
  }

  if (
    requireEveryTable &&
    [...CANONICAL_EXPORT_TABLES, ...OPTIONAL_INCLUDED_EXPORT_TABLES].some(
      (table) => !Object.prototype.hasOwnProperty.call(mapping, table.name)
    )
  ) {
    rejectArchive();
  }
}

function assertCatalogIsUniqueAndSafe(): void {
  const includedNames = CANONICAL_EXPORT_TABLES.map((table) => table.name);
  const excludedNames = EXCLUDED_CANONICAL_TABLES.map((table) => table.table);
  const optionalNames = OPTIONAL_EXPORT_MODULE_GROUPS.flat().map(
    (table) => table.table
  );
  const optionalIncludedNames = OPTIONAL_INCLUDED_EXPORT_TABLES.map(
    (table) => table.name
  );
  const allNames = [
    ...includedNames,
    ...excludedNames,
    ...optionalNames,
    ...optionalIncludedNames,
  ];
  if (new Set(allNames).size !== allNames.length) rejectArchive();

  const knownNames = [...includedNames, ...excludedNames];
  if (
    knownNames.length !== ALL_KNOWN_CANONICAL_TABLE_NAMES.length ||
    knownNames.some((name, index) => name !== ALL_KNOWN_CANONICAL_TABLE_NAMES[index])
  ) {
    rejectArchive();
  }

  assertColumnMapMatchesCatalog(NULLABLE_COLUMNS_BY_TABLE, true);
  assertColumnMapMatchesCatalog(INT4_COLUMNS_BY_TABLE, false);
  assertColumnMapMatchesCatalog(INT8_DECIMAL_STRING_COLUMNS_BY_TABLE, false);

  const allIncluded = [...CANONICAL_EXPORT_TABLES, ...OPTIONAL_INCLUDED_EXPORT_TABLES];
  // Every reviewed SQL projection has a structured validator, and vice versa.
  const projected = allIncluded.flatMap((table) =>
    Object.keys(table.projections ?? {}).map((column) => `${table.name}.${column}`)
  );
  if (
    projected.length !== Object.keys(STRUCTURED_JSON_COLUMNS).length ||
    projected.some((key) => !STRUCTURED_JSON_COLUMNS[key])
  ) {
    rejectArchive();
  }
  for (const table of allIncluded) {
    const nullableColumns = new Set(NULLABLE_COLUMNS_BY_TABLE[table.name]);
    const int4Columns = new Set(INT4_COLUMNS_BY_TABLE[table.name] ?? []);
    const int8Columns = new Set(
      INT8_DECIMAL_STRING_COLUMNS_BY_TABLE[table.name] ?? []
    );
    if (
      table.expectedColumns.length === 0 ||
      table.exportColumns.length === 0 ||
      table.orderBy.length === 0 ||
      new Set(table.expectedColumns).size !== table.expectedColumns.length ||
      new Set(table.exportColumns).size !== table.exportColumns.length ||
      new Set(table.orderBy).size !== table.orderBy.length ||
      !table.expectedColumns.includes(table.organizationColumn) ||
      !table.exportColumns.includes(table.organizationColumn) ||
      table.exportColumns.some((column) => !table.expectedColumns.includes(column)) ||
      table.orderBy.some((column) => !table.exportColumns.includes(column)) ||
      [...nullableColumns].some(
        (column) =>
          column === table.organizationColumn ||
          column === "id" ||
          table.orderBy.includes(column)
      ) ||
      [...int4Columns].some((column) => int8Columns.has(column))
    ) {
      rejectArchive();
    }
  }
}

function validateExcludedTables(value: unknown): number {
  if (!Array.isArray(value)) rejectArchive();
  const optionalModules = OPTIONAL_EXPORT_MODULE_GROUPS.flatMap(group => {
    const present = group.filter(table => value.some(entry => isRecord(entry) && entry.table === table.table));
    if (present.length !== 0 && present.length !== group.length) rejectArchive();
    return present;
  });
  const expected = [...EXCLUDED_CANONICAL_TABLES, ...optionalModules];
  const optionalNames = new Set(optionalModules.map(table => table.table));
  const scopedNames = new Set<string>([
    ...EXCLUDED_CANONICAL_SCOPED_TABLES,
    ...optionalNames,
  ]);
  const seen = new Set<string>();

  if (value.length !== expected.length) rejectArchive();
  for (let index = 0; index < expected.length; index += 1) {
    const entry = value[index];
    const expectedEntry = expected[index]!;
    if (!hasExactKeys(entry, EXCLUDED_TABLE_KEYS)) rejectArchive();
    if (
      entry.table !== expectedEntry.table ||
      entry.category !== expectedEntry.category ||
      entry.reason !== expectedEntry.reason ||
      entry.valuesExported !== false ||
      seen.has(expectedEntry.table)
    ) {
      rejectArchive();
    }
    seen.add(expectedEntry.table);

    const scoped = scopedNames.has(expectedEntry.table);
    if (scoped) {
      if (entry.countScope !== "organization_id" || !isExcludedCount(entry.rowCount)) {
        rejectArchive();
      }
    } else if (entry.countScope !== null || entry.rowCount !== null) {
      rejectArchive();
    }
  }
  return value.length;
}

/** Activated modules are declared by their data keys: all tables of a module or none. */
function presentOptionalIncludedTables(data: unknown): CanonicalExportTableSpec[] {
  if (!isRecord(data)) rejectArchive();
  return OPTIONAL_INCLUDED_EXPORT_MODULES.flatMap((module) => {
    const present = module.tables.filter((table) =>
      Object.prototype.hasOwnProperty.call(data, table.name)
    );
    if (present.length !== 0 && present.length !== module.tables.length) {
      rejectArchive();
    }
    return present;
  });
}

function validateManifestAndRows(
  coverage: JsonRecord,
  data: unknown,
  expectedOrganizationId: string,
  includedTables: readonly CanonicalExportTableSpec[]
): Array<{ table: string; rowCount: number; checksumSha256: string }> {
  if (!Array.isArray(coverage.includedTables)) rejectArchive();
  const manifest = coverage.includedTables;
  if (manifest.length !== includedTables.length) rejectArchive();
  if (!hasExactKeys(data, includedTables.map((table) => table.name))) {
    rejectArchive();
  }

  const normalizedOrganizationId = expectedOrganizationId.toLowerCase();
  const validated: Array<{
    table: string;
    rowCount: number;
    checksumSha256: string;
  }> = [];
  let totalRows = 0;

  for (
    let tableIndex = 0;
    tableIndex < includedTables.length;
    tableIndex += 1
  ) {
    const table = includedTables[tableIndex]!;
    const manifestEntry = manifest[tableIndex];
    const rowsValue = data[table.name];
    if (!hasExactKeys(manifestEntry, MANIFEST_KEYS)) rejectArchive();
    if (
      manifestEntry.table !== table.name ||
      !isSafeCount(manifestEntry.rowCount, MAX_INCLUDED_ROWS) ||
      !isSha256(manifestEntry.checksumSha256) ||
      !Array.isArray(rowsValue) ||
      rowsValue.length !== manifestEntry.rowCount ||
      rowsValue.length > MAX_INCLUDED_ROWS
    ) {
      rejectArchive();
    }

    const seenPrimaryKeys = new Set<string>();
    let previousOrderKey: string[] | null = null;
    const rows: JsonRecord[] = [];
    for (const rowValue of rowsValue) {
      if (!hasExactKeys(rowValue, table.exportColumns)) rejectArchive();
      for (const column of table.exportColumns) {
        validateColumnValue(table, column, rowValue[column]);
      }

      const tenantId = rowValue[table.organizationColumn];
      if (
        !isUuid(tenantId) ||
        tenantId.toLowerCase() !== normalizedOrganizationId
      ) {
        rejectArchive();
      }

      const orderKey = rowOrderKey(table, rowValue);
      const encodedKey = JSON.stringify(orderKey);
      if (seenPrimaryKeys.has(encodedKey)) rejectArchive();
      if (previousOrderKey && compareUuidTuples(previousOrderKey, orderKey) > 0) {
        rejectArchive();
      }
      seenPrimaryKeys.add(encodedKey);
      previousOrderKey = orderKey;
      rows.push(rowValue);
    }

    const checksumSha256 = digestRows(rows);
    if (checksumSha256 !== manifestEntry.checksumSha256) rejectArchive();
    totalRows += rows.length;
    if (totalRows > MAX_INCLUDED_ROWS) rejectArchive();
    validated.push({
      table: table.name,
      rowCount: rows.length,
      checksumSha256,
    });
  }

  if (coverage.includedRowCount !== totalRows) rejectArchive();
  return validated;
}

function validateEnvelope(input: {
  body: string;
  organizationId: string;
}): CanonicalAcademyArchiveVerificationReport {
  if (
    !isRecord(input) ||
    typeof input.body !== "string" ||
    !isUuid(input.organizationId) ||
    input.body.length > MAX_FINAL_JSON_RESPONSE_BYTES
  ) {
    rejectArchive();
  }

  // This length calculation runs before parsing and does not allocate a body-sized buffer.
  const bodyBytes = Buffer.byteLength(input.body, "utf8");
  if (bodyBytes > MAX_FINAL_JSON_RESPONSE_BYTES) rejectArchive();

  let parsed: unknown;
  try {
    const encodedBody = new TextEncoder().encode(input.body);
    if (
      encodedBody.byteLength !== bodyBytes ||
      new TextDecoder("utf-8", { fatal: true }).decode(encodedBody) !== input.body
    ) {
      rejectArchive();
    }
    parsed = JSON.parse(input.body) as unknown;
    assertJsonStringsAreWellFormed(parsed);
    // The exporter uses JSON.stringify directly. This also rejects duplicate object keys,
    // alternate encodings, and noncanonical whitespace before any checksum is trusted.
    if (JSON.stringify(parsed) !== input.body) rejectArchive();
  } catch (error) {
    if (error instanceof CanonicalAcademyArchiveVerificationError) throw error;
    rejectArchive();
  }

  assertCatalogIsUniqueAndSafe();
  if (!hasExactKeys(parsed, ENVELOPE_KEYS)) rejectArchive();
  const envelope = parsed;
  const coverageValue = envelope.coverage;
  const integrityValue = envelope.integrity;
  if (
    envelope.package !== PACKAGE_NAME ||
    envelope.formatVersion !== FORMAT_VERSION ||
    !hasExactKeys(coverageValue, COVERAGE_KEYS) ||
    !hasExactKeys(integrityValue, INTEGRITY_KEYS)
  ) {
    rejectArchive();
  }

  const coverage = coverageValue;
  const integrity = integrityValue;
  const organizationId = coverage.organizationId;
  const includedRowCount = coverage.includedRowCount;
  const estimatedSelectedSourceBytes = coverage.estimatedSelectedSourceBytes;
  const limitsValue = coverage.limits;
  if (
    coverage.scope !== "bounded_operational_canonical_v1" ||
    coverage.complete !== false ||
    coverage.description !== COVERAGE_DESCRIPTION ||
    coverage.snapshotIsolation !== "postgres_repeatable_read_read_only" ||
    typeof coverage.generatedAt !== "string" ||
    !isIsoTimestamp(coverage.generatedAt) ||
    !isUuid(organizationId) ||
    organizationId.toLowerCase() !== input.organizationId.toLowerCase() ||
    !isSafeCount(includedRowCount, MAX_INCLUDED_ROWS) ||
    !isSafeCount(estimatedSelectedSourceBytes, MAX_ESTIMATED_SOURCE_BYTES) ||
    coverage.catalogPolicy !== CATALOG_POLICY
  ) {
    rejectArchive();
  }
  if (!hasExactKeys(limitsValue, LIMIT_KEYS)) rejectArchive();
  const limits = limitsValue;
  if (
    limits.maxIncludedRows !== MAX_INCLUDED_ROWS ||
    limits.maxEstimatedSelectedSourceBytes !== MAX_ESTIMATED_SOURCE_BYTES ||
    limits.maxFinalJsonResponseBytes !== MAX_FINAL_JSON_RESPONSE_BYTES ||
    limits.maxDurationMs !== MAX_EXPORT_DURATION_MS ||
    limits.statementTimeoutMs !== STATEMENT_TIMEOUT_MS ||
    bodyBytes > limits.maxFinalJsonResponseBytes
  ) {
    rejectArchive();
  }

  const optionalIncludedTables = presentOptionalIncludedTables(envelope.data);
  if (
    JSON.stringify(coverage.excludedColumns) !==
      JSON.stringify([
        ...CANONICAL_EXPORT_OMISSIONS,
        ...exportOmissionsFor(optionalIncludedTables),
      ]) ||
    JSON.stringify(coverage.excludedSources) !==
      JSON.stringify(EXCLUDED_CANONICAL_SOURCES)
  ) {
    rejectArchive();
  }
  validateExcludedTables(coverage.excludedTables);
  const tableChecksums = validateManifestAndRows(
    coverage,
    envelope.data,
    input.organizationId,
    [...CANONICAL_EXPORT_TABLES, ...optionalIncludedTables]
  );

  const declaredBundleChecksum = integrity.bundleChecksumSha256;
  if (
    integrity.algorithm !== "SHA-256" ||
    integrity.tableChecksumEncoding !== CHECKSUM_ENCODING ||
    !isSha256(declaredBundleChecksum)
  ) {
    rejectArchive();
  }

  const basePackage = {
    package: envelope.package,
    formatVersion: envelope.formatVersion,
    coverage: envelope.coverage,
    data: envelope.data,
  };
  const serializedBasePackage = JSON.stringify(basePackage);
  if (serializedBasePackage === undefined) rejectArchive();
  const bundleChecksumSha256 = createHash("sha256")
    .update(serializedBasePackage)
    .digest("hex");
  if (bundleChecksumSha256 !== declaredBundleChecksum) {
    rejectArchive();
  }

  return {
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
    scopeOrganizationId: input.organizationId.toLowerCase(),
    includedTableCount: tableChecksums.length,
    includedRowCount,
    declaredEstimatedSelectedSourceBytes: estimatedSelectedSourceBytes,
    bodyBytes,
    bundleChecksumSha256,
    tableChecksums,
  };
}

/**
 * Checks the structure, declared tenant scope, catalog projection, ordering,
 * and self-contained checksums of one bounded export string. This verifies no
 * provenance, current authorization, relational integrity, source completeness,
 * or restorability and never returns the exported records.
 */
export function validateCanonicalAcademyArchive(input: {
  body: string;
  organizationId: string;
}): CanonicalAcademyArchiveVerificationReport {
  try {
    return validateEnvelope(input);
  } catch (error) {
    if (error instanceof CanonicalAcademyArchiveVerificationError) throw error;
    rejectArchive();
  }
}
