import { createHash, randomUUID } from "node:crypto";

import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export const SANDBOX_ACADEMY_ID = "00000000-aaaa-0000-0000-000000000001";

export const MIGRATION_MODULES = [
  "athletes",
  "families",
  "debts",
  "payments",
  "notes",
  "audit",
] as const;

export type MigrationModule = (typeof MIGRATION_MODULES)[number];
export type ImportSourceModule = Extract<MigrationModule, "athletes" | "debts">;

export const JOB_STATES = [
  "created",
  "preview_ready",
  "mapping_required",
  "validated",
  "committing",
  "committed",
  "rolled_back",
  "failed",
  "rollback_failed",
  "cancelled",
] as const;

export type SandboxJobState = (typeof JOB_STATES)[number];

export const ROW_STATES = [
  "valid",
  "warning",
  "ambiguous",
  "duplicate_suspected",
  "invalid",
  "skipped",
  "created",
  "rolled_back",
] as const;

export type SandboxRowState = (typeof ROW_STATES)[number];

export type RowErrorCode =
  | "IMPORT_ROW_INVALID"
  | "IMPORT_STRUCTURE_UNSUPPORTED"
  | "AMBIGUOUS_DATE"
  | "AMBIGUOUS_MAPPING"
  | "DUPLICATE_SUSPECTED"
  | "IDEMPOTENCY_CONFLICT"
  | "IMPORT_TOTAL_MISMATCH"
  | "MODULE_NOT_IMPORTED"
  | "SANDBOX_ONLY"
  | "ACADEMY_ACCESS_DENIED";

export type SandboxField =
  | "external_id"
  | "name"
  | "dob"
  | "status"
  | "group"
  | "sport_config_code"
  | "program_code"
  | "level_code"
  | "category_code"
  | "family_external_id"
  | "athlete_external_id"
  | "occurred_on"
  | "amount_eur"
  | "currency"
  | "kind"
  | "origin_status"
  | "origin_reference"
  | "notes"
  | "academy_id";

export type SourceRow = Record<string, string | null | undefined>;
export type FieldMapping = Record<string, SandboxField | null>;

export interface MappingEntry {
  sourceColumn: string;
  target: SandboxField | null;
  confidence: "exact" | "alias" | "manual" | "unmapped";
  sample: string[];
}

export interface CatalogGroup {
  code: string;
  aliases?: string[];
}

export interface SandboxCatalog {
  groups: CatalogGroup[];
  sportConfigCodes: string[];
}

export const SANDBOX_CATALOG: SandboxCatalog = {
  groups: [{ code: "base_3", aliases: ["Base 3"] }],
  sportConfigCodes: ["RFEG-2026-V2"],
};

export interface ExpectedFinanceTotals {
  charges: number;
  payments: number;
  refunds: number;
  openingBalance: number;
}

export interface SandboxActor {
  id: string;
  role: "owner" | "admin" | "super_admin";
}

export interface SandboxRowIssue {
  code: RowErrorCode;
  column?: SandboxField;
  action: string;
}

export interface SandboxRowResult {
  rowNumber: number;
  state: SandboxRowState;
  externalId: string | null;
  fields: Partial<Record<SandboxField, string>>;
  issues: SandboxRowIssue[];
  warnings: string[];
  dedupeKey?: string;
  decision?: "create" | "link_existing" | "omit";
  linkedExternalId?: string;
}

export interface FinanceTotals extends ExpectedFinanceTotals {
  mismatch: boolean;
}

export interface SandboxAuditEvent {
  timestamp: string;
  actorId: string;
  actorRole: SandboxActor["role"];
  academyId: string;
  action: "previewed" | "mapped" | "validated" | "committed" | "rolled_back" | "exported" | "failed";
  module: MigrationModule;
  result: string;
  requestId: string;
}

export interface SandboxPreview {
  jobId: string;
  requestId: string;
  tenantId: string;
  academyId: string;
  module: ImportSourceModule;
  status: Extract<SandboxJobState, "preview_ready" | "mapping_required">;
  mapping: MappingEntry[];
  rows: SandboxRowResult[];
  summary: {
    total: number;
    valid: number;
    warnings: number;
    ambiguous: number;
    duplicates: number;
    invalid: number;
    blocked: number;
  };
  totals?: FinanceTotals;
  canCommit: boolean;
  audit: SandboxAuditEvent[];
}

export interface SandboxJob extends Omit<SandboxPreview, "status"> {
  status: SandboxJobState;
  committedExternalIds: string[];
  snapshotBefore: {
    externalIds: string[];
    totals?: FinanceTotals;
  };
}

export interface SandboxScope {
  tenantId: string;
  academyId: string;
}

export interface SandboxExport {
  status: "ready" | "partial";
  module: MigrationModule;
  csv: string;
  manifest: {
    schema_version: "sandbox-export-1.0";
    module: MigrationModule;
    academy_id: string;
    generated_at: string;
    rows: number;
    columns: string[];
    exclusions: string[];
    state: "ready" | "partial";
    checksum_sha256: string;
  };
  readyModules: MigrationModule[];
  failures: Array<{ module: MigrationModule; code: RowErrorCode }>;
}

export interface SandboxPreviewInput {
  tenantId: string;
  academyId: string;
  actor: SandboxActor;
  module: ImportSourceModule;
  rows: SourceRow[];
  headers?: string[];
  mapping?: FieldMapping;
  catalog: SandboxCatalog;
  expectedTotals?: ExpectedFinanceTotals;
  synthetic?: boolean;
  idempotencyKey?: string;
  requestId?: string;
  now?: Date;
}

export class SandboxMigrationError extends Error {
  constructor(
    public readonly code: RowErrorCode,
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = "SandboxMigrationError";
  }
}

const FIELD_ALIASES: Record<SandboxField, string[]> = {
  external_id: ["external_id", "external id", "id externo", "id"],
  name: ["name", "nombre", "athlete name", "nombre atleta"],
  dob: ["dob", "birthdate", "date of birth", "fecha de nacimiento"],
  status: ["status", "estado"],
  group: ["group", "group_name", "grupo", "grupo nombre"],
  sport_config_code: ["sport_config_code", "sport config code", "modalidad"],
  program_code: ["program_code", "programa"],
  level_code: ["level_code", "nivel"],
  category_code: ["category_code", "categoria", "categoría"],
  family_external_id: ["family_external_id", "family id", "familia id"],
  athlete_external_id: ["athlete_external_id", "athlete id", "atleta id"],
  occurred_on: ["occurred_on", "date", "fecha", "fecha de operación"],
  amount_eur: ["amount_eur", "amount", "importe", "importe eur"],
  currency: ["currency", "moneda"],
  kind: ["kind", "type", "tipo"],
  origin_status: ["origin_status", "source status", "estado de origen"],
  origin_reference: ["origin_reference", "source reference", "referencia"],
  notes: ["notes", "nota", "notas"],
  academy_id: ["academy_id", "academy id", "academia id"],
};

const REQUIRED_FIELDS: Record<ImportSourceModule, SandboxField[]> = {
  athletes: ["name", "academy_id"],
  debts: [
    "external_id",
    "occurred_on",
    "amount_eur",
    "currency",
    "kind",
    "origin_status",
    "origin_reference",
    "academy_id",
  ],
};

const ALLOWED_STATUS = new Set(["active", "inactive", "pending"]);
const ALLOWED_KINDS = new Set(["charge", "payment", "refund"]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseMoney(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function isIsoDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function isAmbiguousDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(value));
}

function requiredFieldsFor(module: ImportSourceModule): Set<SandboxField> {
  return new Set(REQUIRED_FIELDS[module]);
}

export function deriveMapping(
  headers: string[],
  rows: SourceRow[],
  module: ImportSourceModule,
  manualMapping: FieldMapping = {}
): MappingEntry[] {
  const allowed = new Set(REQUIRED_FIELDS[module].concat(module === "athletes"
    ? ["external_id", "dob", "status", "group", "sport_config_code", "program_code", "level_code", "category_code", "family_external_id", "notes"]
    : ["family_external_id", "athlete_external_id", "notes"]));

  return headers.map((sourceColumn) => {
    const manual = manualMapping[sourceColumn];
    if (manual !== undefined) {
      return {
        sourceColumn,
        target: manual,
        confidence: "manual",
        sample: rows.slice(0, 3).map((row) => String(row[sourceColumn] ?? "")),
      };
    }

    const normalizedHeader = normalize(sourceColumn);
    const exact = (Object.keys(FIELD_ALIASES) as SandboxField[]).find(
      (field) => normalize(field) === normalizedHeader && allowed.has(field)
    );
    const aliasMatches = (Object.keys(FIELD_ALIASES) as SandboxField[]).filter(
      (field) => allowed.has(field) && FIELD_ALIASES[field].some((alias) => normalize(alias) === normalizedHeader)
    );
    const target = exact ?? (aliasMatches.length === 1 ? aliasMatches[0] : null);
    return {
      sourceColumn,
      target,
      confidence: target ? (exact ? "exact" : "alias") : "unmapped",
      sample: rows.slice(0, 3).map((row) => String(row[sourceColumn] ?? "")),
    };
  });
}

function applyMapping(row: SourceRow, mapping: MappingEntry[]): Partial<Record<SandboxField, string>> {
  return mapping.reduce<Partial<Record<SandboxField, string>>>((result, entry) => {
    if (entry.target) {
      const value = row[entry.sourceColumn];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        result[entry.target] = String(value).trim();
      }
    }
    return result;
  }, {});
}

function issue(code: RowErrorCode, action: string, column?: SandboxField): SandboxRowIssue {
  return { code, action, ...(column ? { column } : {}) };
}

function catalogCode(value: string | undefined, catalog: SandboxCatalog): { code: string | null; warning?: string; ambiguous?: boolean } {
  if (!value) return { code: null };
  const matches = catalog.groups.filter((group) => [group.code, ...(group.aliases ?? [])].some((candidate) => normalize(candidate) === normalize(value)));
  if (matches.length > 1) return { code: null, ambiguous: true };
  if (!matches[0]) return { code: null };
  const warning = matches[0].code !== value ? "El grupo se normalizó al código del catálogo; confirma el mapping." : undefined;
  return { code: matches[0].code, warning };
}

function validateRow(
  fields: Partial<Record<SandboxField, string>>,
  rowNumber: number,
  module: ImportSourceModule,
  catalog: SandboxCatalog
): SandboxRowResult {
  const externalId = fields.external_id ?? null;
  const issues: SandboxRowIssue[] = [];
  const warnings: string[] = [];
  const required = requiredFieldsFor(module);

  for (const field of required) {
    if (!fields[field]) issues.push(issue("IMPORT_ROW_INVALID", "Completa el campo requerido o marca la fila como omitida.", field));
  }
  if (fields.academy_id && fields.academy_id !== SANDBOX_ACADEMY_ID) {
    issues.push(issue("IMPORT_ROW_INVALID", "La fila pertenece a otra academia; revisa el archivo sintético.", "academy_id"));
  }

  if (module === "athletes") {
    if (!fields.name || (normalize(fields.name) === "sin_nombre" && fields.notes?.toLowerCase().includes("obligatorio"))) {
      issues.push(issue("IMPORT_ROW_INVALID", "Completa el nombre o marca la fila como omitida.", "name"));
    }
    if (fields.status && !ALLOWED_STATUS.has(fields.status)) issues.push(issue("IMPORT_ROW_INVALID", "Usa un estado permitido: active, inactive o pending.", "status"));
    if (fields.dob && isAmbiguousDate(fields.dob)) issues.push(issue("AMBIGUOUS_DATE", "Usa una fecha ISO YYYY-MM-DD o excluye la fila.", "dob"));
    else if (fields.dob && !isIsoDate(fields.dob)) issues.push(issue("IMPORT_ROW_INVALID", "Usa una fecha ISO YYYY-MM-DD.", "dob"));

    const group = catalogCode(fields.group, catalog);
    if (group.ambiguous) issues.push(issue("AMBIGUOUS_MAPPING", "Selecciona un único código de grupo del catálogo.", "group"));
    else if (fields.group && !group.code) issues.push(issue("IMPORT_ROW_INVALID", "Selecciona un grupo existente o deja la fila fuera.", "group"));
    else if (group.warning) warnings.push(group.warning);

    if (fields.sport_config_code && !catalog.sportConfigCodes.some((code) => normalize(code) === normalize(fields.sport_config_code!))) {
      issues.push(issue("IMPORT_ROW_INVALID", "Selecciona una modalidad activa de esta academia.", "sport_config_code"));
    }
  } else {
    if (fields.occurred_on && !isIsoDate(fields.occurred_on)) issues.push(issue("IMPORT_ROW_INVALID", "Usa una fecha ISO YYYY-MM-DD.", "occurred_on"));
    if (fields.amount_eur && parseMoney(fields.amount_eur) === null) issues.push(issue("IMPORT_ROW_INVALID", "Usa un importe decimal con punto, por ejemplo 150.00.", "amount_eur"));
    if (fields.currency !== "EUR") issues.push(issue("IMPORT_ROW_INVALID", "Solo se admite EUR en el histórico sintético.", "currency"));
    if (fields.kind && !ALLOWED_KINDS.has(fields.kind)) issues.push(issue("IMPORT_ROW_INVALID", "Usa charge, payment o refund.", "kind"));
    if (!fields.family_external_id && !fields.athlete_external_id) issues.push(issue("IMPORT_ROW_INVALID", "Añade un vínculo inequívoco de familia o atleta.", "family_external_id"));
  }

  const state: SandboxRowState = issues.some((item) => item.code === "AMBIGUOUS_DATE" || item.code === "AMBIGUOUS_MAPPING")
    ? "ambiguous"
    : issues.length > 0
      ? "invalid"
      : warnings.length > 0
        ? "warning"
        : "valid";
  return {
    rowNumber,
    state,
    externalId,
    fields,
    issues,
    warnings,
    dedupeKey: stableHash({
      externalId,
      name: fields.name,
      dob: fields.dob,
      family: fields.family_external_id,
      group: fields.group,
    }),
  };
}

function reconcileFinance(
  rows: SandboxRowResult[],
  expected: ExpectedFinanceTotals | undefined
): FinanceTotals | undefined {
  if (!expected) return undefined;
  const totals: ExpectedFinanceTotals = { charges: 0, payments: 0, refunds: 0, openingBalance: 0 };
  for (const row of rows) {
    if (row.state === "invalid" || row.state === "ambiguous" || !row.fields.kind) continue;
    const amount = parseMoney(row.fields.amount_eur);
    if (amount === null) continue;
    if (row.fields.notes?.toLowerCase().includes("saldo apertura")) {
      totals.openingBalance += amount;
      continue;
    }
    if (row.fields.kind === "charge") totals.charges += amount;
    if (row.fields.kind === "payment") totals.payments += amount;
    if (row.fields.kind === "refund") totals.refunds += amount;
  }
  const rounded = (value: number) => Math.round(value * 100) / 100;
  const mismatch = (Object.keys(expected) as Array<keyof ExpectedFinanceTotals>).some(
    (key) => rounded(totals[key]) !== rounded(expected[key])
  );
  return { ...totals, mismatch };
}

export function previewSandboxMigration(input: SandboxPreviewInput): SandboxPreview {
  if (input.synthetic !== true || input.academyId !== SANDBOX_ACADEMY_ID) {
    throw new SandboxMigrationError("SANDBOX_ONLY", "La importación sandbox solo acepta la academia sintética MIG-SYN-01.", 403);
  }
  if (!input.tenantId || !input.actor.id || !["owner", "admin", "super_admin"].includes(input.actor.role)) {
    throw new SandboxMigrationError("SANDBOX_ONLY", "Actor o tenant inválido para el sandbox.", 403);
  }

  const headers = input.headers ?? Array.from(new Set(input.rows.flatMap((row) => Object.keys(row))));
  const mapping = deriveMapping(headers, input.rows, input.module, input.mapping);
  const mappedFields = new Set(mapping.flatMap((entry) => entry.target ? [entry.target] : []));
  const missing = REQUIRED_FIELDS[input.module].filter((field) => !mappedFields.has(field));
  const rows = input.rows.map((row, index) => validateRow(applyMapping(row, mapping), index + 2, input.module, input.catalog));

  const firstByExternalId = new Map<string, string>();
  for (const row of rows) {
    if (!row.externalId || row.state === "invalid" || row.state === "ambiguous") continue;
    const prior = firstByExternalId.get(row.externalId);
    if (!prior) {
      firstByExternalId.set(row.externalId, row.dedupeKey ?? "");
    } else if (prior !== row.dedupeKey) {
      row.state = "duplicate_suspected";
      row.issues.push(issue("DUPLICATE_SUSPECTED", "Omite la fila o confirma un vínculo concreto; no se sobrescribe el registro anterior."));
    } else {
      row.state = "duplicate_suspected";
      row.issues.push(issue("IDEMPOTENCY_CONFLICT", "La fila repetida debe omitirse o resolverse explícitamente."));
    }
  }

  const totals = reconcileFinance(rows, input.expectedTotals);
  if (totals?.mismatch) {
    for (const row of rows) {
      if (row.state === "valid" || row.state === "warning") {
        row.issues.push(issue("IMPORT_TOTAL_MISMATCH", "Corrige o excluye las filas hasta reconciliar los totales del preview."));
        row.state = "invalid";
      }
    }
  }

  const summary = {
    total: rows.length,
    valid: rows.filter((row) => row.state === "valid" || row.state === "warning").length,
    warnings: rows.filter((row) => row.warnings.length > 0).length,
    ambiguous: rows.filter((row) => row.state === "ambiguous").length,
    duplicates: rows.filter((row) => row.state === "duplicate_suspected").length,
    invalid: rows.filter((row) => row.state === "invalid").length,
    blocked: rows.filter((row) => ["ambiguous", "duplicate_suspected", "invalid"].includes(row.state)).length,
  };
  const requestId = input.requestId ?? `sandbox-${randomUUID()}`;
  const now = (input.now ?? new Date()).toISOString();
  const audit: SandboxAuditEvent[] = [{
    timestamp: now,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    academyId: input.academyId,
    action: "previewed",
    module: input.module,
    result: `${summary.valid}/${summary.total} filas candidatas; ${summary.blocked} bloqueantes`,
    requestId,
  }];
  const status = missing.length > 0 ? "mapping_required" : "preview_ready";
  if (missing.length > 0) {
    audit.push({ ...audit[0], action: "failed", result: "mapping_required" });
  }
  return {
    jobId: randomUUID(),
    requestId,
    tenantId: input.tenantId,
    academyId: input.academyId,
    module: input.module,
    status,
    mapping,
    rows,
    summary,
    totals,
    canCommit: status === "preview_ready" && summary.blocked === 0 && !totals?.mismatch,
    audit,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SandboxMigrationStore {
  private readonly jobs = new Map<string, SandboxJob>();
  private readonly idempotency = new Map<string, { payloadHash: string; jobId: string }>();

  create(input: SandboxPreviewInput): SandboxJob {
    if (input.idempotencyKey) {
      const key = `${input.tenantId}:${input.academyId}:${input.module}:${input.idempotencyKey}`;
      const payloadHash = stableHash({
        module: input.module,
        rows: input.rows,
        mapping: input.mapping,
        expectedTotals: input.expectedTotals,
      });
      const prior = this.idempotency.get(key);
      if (prior && prior.payloadHash !== payloadHash) {
        throw new SandboxMigrationError("IDEMPOTENCY_CONFLICT", "La misma Idempotency-Key fue usada con un payload diferente.", 409);
      }
      if (prior) return this.get(prior.jobId, { tenantId: input.tenantId, academyId: input.academyId });
    }
    const preview = previewSandboxMigration(input);
    const job: SandboxJob = {
      ...preview,
      status: preview.status,
      committedExternalIds: [],
      snapshotBefore: { externalIds: [], totals: preview.totals },
    };
    this.jobs.set(job.jobId, job);
    if (input.idempotencyKey) {
      this.idempotency.set(`${input.tenantId}:${input.academyId}:${input.module}:${input.idempotencyKey}`, {
        payloadHash: stableHash({
          module: input.module,
          rows: input.rows,
          mapping: input.mapping,
          expectedTotals: input.expectedTotals,
        }),
        jobId: job.jobId,
      });
    }
    return clone(job);
  }

  get(jobId: string, scope: SandboxScope): SandboxJob {
    const job = this.require(jobId, scope);
    return clone(job);
  }

  resolve(jobId: string, decisions: Record<number, "create" | "link_existing" | "omit">, scope: SandboxScope): SandboxJob {
    const job = this.require(jobId, scope);
    for (const row of job.rows) {
      const decision = decisions[row.rowNumber];
      if (decision) row.decision = decision;
    }
    const unresolved = job.rows.some((row) => ["ambiguous", "duplicate_suspected", "invalid"].includes(row.state) && !row.decision);
    job.status = unresolved ? "preview_ready" : "validated";
    job.canCommit = !unresolved && job.status === "validated" && !job.totals?.mismatch;
    job.audit.push({
      timestamp: new Date().toISOString(),
      actorId: "sandbox-resolver",
      actorRole: "owner",
      academyId: job.academyId,
      action: "validated",
      module: job.module,
      result: unresolved ? "resoluciones pendientes" : "validado",
      requestId: `sandbox-${randomUUID()}`,
    });
    return clone(job);
  }

  commit(jobId: string, scope: SandboxScope): SandboxJob {
    const job = this.require(jobId, scope);
    if (!job.canCommit || (job.status !== "validated" && job.status !== "preview_ready")) {
      job.status = "failed";
      job.audit.push(this.failureAudit(job, "commit bloqueado por mapping, errores o totales"));
      throw new SandboxMigrationError("IMPORT_ROW_INVALID", "El job necesita resoluciones explícitas y totales reconciliados antes del commit.", 422);
    }
    job.status = "committing";
    const toCreate = job.rows.filter((row) => (row.state === "valid" || row.state === "warning") && row.decision !== "omit");
    job.committedExternalIds = toCreate.map((row) => row.externalId).filter((id): id is string => Boolean(id));
    for (const row of job.rows) {
      if (row.decision === "omit") row.state = "skipped";
      else if (toCreate.includes(row)) row.state = "created";
    }
    job.status = "committed";
    job.audit.push({
      timestamp: new Date().toISOString(),
      actorId: "sandbox-committer",
      actorRole: "owner",
      academyId: job.academyId,
      action: "committed",
      module: job.module,
      result: `${job.committedExternalIds.length} registros creados`,
      requestId: `sandbox-${randomUUID()}`,
    });
    return clone(job);
  }

  rollback(jobId: string, scope: SandboxScope): SandboxJob {
    const job = this.require(jobId, scope);
    if (job.status === "rolled_back") throw new SandboxMigrationError("IDEMPOTENCY_CONFLICT", "El rollback de este job ya fue aplicado.", 409);
    if (job.status !== "committed") throw new SandboxMigrationError("IMPORT_ROW_INVALID", "Solo se puede revertir un job committed.", 422);
    job.status = "rolled_back";
    job.committedExternalIds = [];
    for (const row of job.rows) if (row.state === "created") row.state = "rolled_back";
    job.audit.push({
      timestamp: new Date().toISOString(),
      actorId: "sandbox-rollback",
      actorRole: "owner",
      academyId: job.academyId,
      action: "rolled_back",
      module: job.module,
      result: "baseline sintético restaurado",
      requestId: `sandbox-${randomUUID()}`,
    });
    return clone(job);
  }

  export(jobId: string, module: MigrationModule, scope: SandboxScope): SandboxExport {
    const job = this.require(jobId, scope);
    const readyModules: MigrationModule[] = ["audit"];
    const failures: Array<{ module: MigrationModule; code: RowErrorCode }> = [];
    if (job.status !== "committed" && job.status !== "rolled_back") failures.push({ module, code: "MODULE_NOT_IMPORTED" });
    else if (
      module === job.module ||
      (job.module === "debts" && ["payments", "debts"].includes(module)) ||
      (job.module === "athletes" && module === "families")
    ) readyModules.push(module);
    else failures.push({ module, code: "MODULE_NOT_IMPORTED" });

    const records = failures.length > 0 ? [] : this.rowsForExport(job, module);
    const columns = this.columnsFor(module);
    const csv = [columns.join(","), ...records.map((record) => columns.map((column) => this.csvCell(record[column] ?? "")).join(","))].join("\n") + "\n";
    const state: "ready" | "partial" = failures.length > 0 ? "partial" : "ready";
    const manifest = {
      schema_version: "sandbox-export-1.0" as const,
      module,
      academy_id: job.academyId,
      generated_at: new Date().toISOString(),
      rows: records.length,
      columns,
      exclusions: module === "notes" ? ["Comentarios de hoja no importados como notas"] : ["Sin secretos, tokens, payload bruto ni objetos Stripe"],
      state,
      checksum_sha256: stableHash(csv),
    };
    job.audit.push({
      timestamp: new Date().toISOString(),
      actorId: "sandbox-exporter",
      actorRole: "owner",
      academyId: job.academyId,
      action: "exported",
      module,
      result: state,
      requestId: `sandbox-${randomUUID()}`,
    });
    this.jobs.set(jobId, job);
    return { status: state, module, csv, manifest, readyModules, failures };
  }

  private require(jobId: string, scope: SandboxScope): SandboxJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new SandboxMigrationError("IMPORT_ROW_INVALID", "Job sandbox no encontrado.", 404);
    if (job.tenantId !== scope.tenantId || job.academyId !== scope.academyId) {
      throw new SandboxMigrationError("ACADEMY_ACCESS_DENIED", "No tienes acceso a esta academia.", 403);
    }
    return job;
  }

  private failureAudit(job: SandboxJob, result: string): SandboxAuditEvent {
    return {
      timestamp: new Date().toISOString(),
      actorId: "sandbox-committer",
      actorRole: "owner",
      academyId: job.academyId,
      action: "failed",
      module: job.module,
      result,
      requestId: `sandbox-${randomUUID()}`,
    };
  }

  private rowsForExport(job: SandboxJob, module: MigrationModule): Array<Record<string, string>> {
    if (module === "audit") return job.audit.map((event) => ({ timestamp: event.timestamp, actor_role: event.actorRole, action: event.action, module: event.module, result: event.result, request_id: event.requestId }));
    return job.rows
      .filter((row) => row.state === "created" || row.state === "rolled_back")
      .filter((row) => ["athletes", "families"].includes(module) ? job.module === "athletes" : job.module === "debts")
      .filter((row) => module === "payments" ? row.fields.kind === "payment" : module === "debts" ? row.fields.kind === "charge" : true)
      .map((row) => ({
        external_id: row.externalId ?? "",
        name: row.fields.name ?? "",
        dob: row.fields.dob ?? "",
        status: row.fields.status ?? "",
        group: row.fields.group ?? "",
        family_external_id: row.fields.family_external_id ?? "",
        athlete_external_id: row.fields.athlete_external_id ?? "",
        occurred_on: row.fields.occurred_on ?? "",
        amount_eur: row.fields.amount_eur ?? "",
        currency: row.fields.currency ?? "",
        kind: row.fields.kind ?? "",
        origin_status: row.fields.origin_status ?? "",
        origin_reference: row.fields.origin_reference ?? "",
      }));
  }

  private columnsFor(module: MigrationModule): string[] {
    if (module === "audit") return ["timestamp", "actor_role", "action", "module", "result", "request_id"];
    if (module === "athletes") return ["external_id", "name", "dob", "status", "group", "family_external_id"];
    if (module === "families") return ["family_external_id", "external_id"];
    if (module === "notes") return ["external_id", "note"];
    return ["external_id", "occurred_on", "amount_eur", "currency", "kind", "origin_status", "origin_reference", "family_external_id", "athlete_external_id"];
  }

  private csvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }
}

export function parseSandboxFile(filename: string, bytes: Uint8Array): { headers: string[]; rows: SourceRow[]; warnings: string[] } {
  if (filename.toLowerCase().endsWith(".csv")) {
    const rows = parse(Buffer.from(bytes).toString("utf8"), { columns: true, skip_empty_lines: true, relax_column_count: false, trim: true }) as SourceRow[];
    return { headers: rows[0] ? Object.keys(rows[0]) : [], rows, warnings: [] };
  }
  if (!filename.toLowerCase().endsWith(".xlsx")) throw new SandboxMigrationError("IMPORT_STRUCTURE_UNSUPPORTED", "Solo se admiten CSV UTF-8 y XLSX plano.", 422);
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellFormula: false, cellHTML: false });
  if (workbook.SheetNames.length !== 1) throw new SandboxMigrationError("IMPORT_STRUCTURE_UNSUPPORTED", "El XLSX debe contener una única hoja plana en P0.", 422);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (sheet["!merges"]?.length) throw new SandboxMigrationError("IMPORT_STRUCTURE_UNSUPPORTED", "Las celdas combinadas no se admiten en la tabla de datos.", 422);
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: "", raw: false });
  return { headers: rows[0] ? Object.keys(rows[0]) : [], rows, warnings: ["Los colores de celda no se importan; los comentarios requieren confirmación fuera del parser."] };
}
