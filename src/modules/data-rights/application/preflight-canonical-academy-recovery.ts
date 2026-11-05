import {
  CanonicalRecoveryPreflightError,
  type CanonicalRecoveryDiagnostic,
  type CanonicalRecoveryIssueCode,
  type CanonicalRecoveryPreflightInput,
  type CanonicalRecoveryPreflightReport,
} from "../domain/canonical-recovery-contract";
import { CANONICAL_EXPORT_TABLES } from "./catalog";
import {
  CANONICAL_RECOVERY_POLICY,
  type RecoveryPredicate,
  type RecoveryTablePolicy,
} from "./canonical-recovery-policy";
import { validateCanonicalAcademyArchive } from "./verify-canonical-academy-archive";

type Row = Record<string, unknown>;
type Data = Record<string, Row[]>;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length &&
    right.every((value) => left.includes(value));
}

/** A changed projection or omitted field requires an explicit policy review. */
function assertReviewedPolicy(): void {
  if (!sameSet(CANONICAL_RECOVERY_POLICY.map((p) => p.table), CANONICAL_EXPORT_TABLES.map((t) => t.name))) {
    throw new CanonicalRecoveryPreflightError();
  }
  for (const policy of CANONICAL_RECOVERY_POLICY) {
    const spec = CANONICAL_EXPORT_TABLES.find((table) => table.name === policy.table)!;
    if (!sameSet(policy.reviewedColumns, spec.expectedColumns) ||
        !sameSet(policy.unknownColumns, spec.expectedColumns.filter((c) => !spec.exportColumns.includes(c)))) {
      throw new CanonicalRecoveryPreflightError();
    }
    const projected = (columns: readonly string[]) => columns.every((c) => spec.exportColumns.includes(c));
    if (policy.primaryKey.length === 0 || !projected(policy.primaryKey)) throw new CanonicalRecoveryPreflightError();
    for (const rule of policy.foreignKeys) {
      const parent = CANONICAL_EXPORT_TABLES.find((table) => table.name === rule.target);
      if (!parent || !projected(rule.columns) || rule.columns.length !== rule.targetColumns.length ||
          rule.targetColumns.some((c) => !parent.exportColumns.includes(c))) {
        throw new CanonicalRecoveryPreflightError();
      }
    }
    for (const rule of policy.uniqueKeys) {
      if (rule.columns.length === 0 || !projected(rule.columns) || !projected(rule.predicate.map((p) => p.column))) {
        throw new CanonicalRecoveryPreflightError();
      }
    }
  }
}

/** Checks the exact immutable string subsequently parsed, before exposing rows internally. */
function verifiedData(body: string, organizationId: string): Data {
  validateCanonicalAcademyArchive({ body, organizationId });
  return (JSON.parse(body) as { data: Data }).data;
}

function normalizedValue(column: string, value: unknown): unknown {
  // UUID columns compare case-insensitively in PostgreSQL; arbitrary text does not.
  if (typeof value === "string" && (column === "id" || column.endsWith("_id"))) return value.toLowerCase();
  if (typeof value !== "string") return value;
  // These are the only time / timestamp fields in projected unique keys. Keep
  // PostgreSQL microseconds: Date alone would collapse distinct session starts.
  if (column === "starts_at_local") {
    const match = /^(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/.exec(value);
    if (!match) throw new CanonicalRecoveryPreflightError();
    return `${match[1]}.${(match[2] ?? "").padEnd(6, "0")}`;
  }
  if (column === "starts_at") {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)$/.exec(value);
    if (!match) throw new CanonicalRecoveryPreflightError();
    const offsetSeconds = match[4] === "Z" ? 0 :
      (Number(match[6]) * 3600 + Number(match[7] ?? 0) * 60 + Number(match[8] ?? 0)) * (match[5] === "-" ? -1 : 1);
    const milliseconds = Date.parse(`${match[1]}T${match[2]}Z`) - offsetSeconds * 1000;
    if (!Number.isFinite(milliseconds)) throw new CanonicalRecoveryPreflightError();
    return (BigInt(milliseconds) * BigInt(1000) + BigInt((match[3] ?? "").padEnd(6, "0"))).toString();
  }
  return value;
}

/** MATCH SIMPLE / ordinary UNIQUE semantics: a null component has no key. */
function tuple(row: Row, columns: readonly string[]): string | null {
  if (columns.some((column) => row[column] === null || row[column] === undefined)) return null;
  return JSON.stringify(columns.map((column) => normalizedValue(column, row[column])));
}

function matches(row: Row, predicates: readonly RecoveryPredicate[]): boolean {
  return predicates.every((predicate) => {
    const value = row[predicate.column];
    switch (predicate.test) {
      case "null": return value === null;
      case "not_null": return value !== null && value !== undefined;
      case "true": return value === true;
      case "in": return typeof value === "string" && predicate.values.includes(value);
    }
  });
}

function keyIndex(rows: readonly Row[], columns: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = tuple(row, columns);
    if (key !== null) keys.add(key);
  }
  return keys;
}

/**
 * Pure internal diagnostic, with no DB, filesystem, network, clock, IDs or
 * commands generated. It does not authenticate the archive or caller. Optional
 * destination is another self-declared same-organization archive, not proof of
 * live target contents; it cannot reveal collisions in another organization.
 * Every result remains blocked. A successful checksum is never SQL integrity.
 */
export function preflightCanonicalAcademyRecovery(
  input: CanonicalRecoveryPreflightInput
): CanonicalRecoveryPreflightReport {
  try {
    assertReviewedPolicy();
    const source = verifiedData(input.body, input.organizationId);
    const destination = input.destination ? verifiedData(input.destination.body, input.organizationId) : null;
    if (destination && destination.organizations!.length !== 1) throw new CanonicalRecoveryPreflightError();

    const diagnostics = new Map<string, CanonicalRecoveryDiagnostic>();
    const add = (
      table: string, code: CanonicalRecoveryIssueCode,
      classification: CanonicalRecoveryDiagnostic["classification"],
      rule: string, ordinal: number | null, occurrences = 1
    ) => {
      const key = `${table}:${code}:${rule}`;
      const diagnostic: CanonicalRecoveryDiagnostic = diagnostics.get(key) ?? { table, code, classification, rule, occurrences: 0, sampleRowOrdinals: [] };
      diagnostic.occurrences += occurrences;
      if (ordinal !== null && diagnostic.sampleRowOrdinals.length < 5 && !diagnostic.sampleRowOrdinals.includes(ordinal)) {
        diagnostic.sampleRowOrdinals.push(ordinal);
      }
      diagnostics.set(key, diagnostic);
    };

    if (source.organizations!.length !== 1) {
      add("organizations", "organization_root_missing", "violation", "exactly_one_organization_root", null);
    }
    for (const policy of CANONICAL_RECOVERY_POLICY) {
      const rows = source[policy.table]!;
      const targetRows = destination?.[policy.table] ?? [];
      const targetPrimaryKeys = keyIndex(targetRows, policy.primaryKey);
      const sourcePrimaryKeys = new Set<string>();
      rows.forEach((row, ordinal) => {
        const primaryKey = tuple(row, policy.primaryKey);
        if (primaryKey === null) add(policy.table, "primary_key_missing", "violation", "primary_key", ordinal);
        else {
          if (sourcePrimaryKeys.has(primaryKey)) add(policy.table, "source_primary_key_collision", "violation", "primary_key", ordinal);
          sourcePrimaryKeys.add(primaryKey);
          if (targetPrimaryKeys.has(primaryKey)) {
            // Identical values also collide. No overwrite / merge is authorized.
            add(policy.table, "destination_primary_key_collision", "violation", "primary_key", ordinal);
          }
        }
      });

      for (const rule of policy.foreignKeys) {
        const parents = keyIndex(source[rule.target]!, rule.targetColumns);
        const ruleName = `${rule.columns.join(",")}->${rule.target}(${rule.targetColumns.join(",")})`;
        rows.forEach((row, ordinal) => {
          const key = tuple(row, rule.columns);
          // A parent present only in destination does not prove a closed source
          // graph or authorize reuse of that record.
          if (key !== null && !parents.has(key)) add(policy.table, "foreign_key_missing", "violation", ruleName, ordinal);
        });
      }
      for (const rule of policy.uniqueKeys) {
        const seen = new Set<string>();
        const targetKeys = new Map<string, Set<string | null>>();
        for (const row of targetRows) {
          if (!matches(row, rule.predicate)) continue;
          const key = tuple(row, rule.columns);
          if (key === null) continue;
          const primaryKeys = targetKeys.get(key) ?? new Set<string | null>();
          primaryKeys.add(tuple(row, policy.primaryKey));
          targetKeys.set(key, primaryKeys);
        }
        rows.forEach((row, ordinal) => {
          if (!matches(row, rule.predicate)) return;
          const key = tuple(row, rule.columns);
          if (key === null) return;
          if (seen.has(key)) add(policy.table, "source_unique_collision", "violation", rule.name, ordinal);
          seen.add(key);
          const primaryKey = tuple(row, policy.primaryKey);
          if ([...(targetKeys.get(key) ?? [])].some((targetKey) => targetKey !== primaryKey)) {
            add(policy.table, "destination_unique_collision", "violation", rule.name, ordinal);
          }
        });
      }
      if (rows.length > 0) {
        for (const column of policy.unknownColumns) {
          add(policy.table, "omitted_value_unknown", "unknown", column, null, rows.length);
        }
        // Explicitly includes excluded-range constraints (tariff coverage),
        // CHECKs, ledger / immutability triggers and destination schema drift.
        add(policy.table, "postgres_checks_exclusions_triggers_unsupported", "unsupported", "postgres_runtime_semantics", null, rows.length);
      }
      if (policy.table === "enrollments") {
        rows.forEach((row, ordinal) => {
          if (row.source_entity_id !== null) add(policy.table, "polymorphic_reference_unknown", "unknown", "source_entity_id", ordinal);
        });
      }
    }

    const ordered = [...diagnostics.values()].sort((left, right) => {
      const a = `${left.table}:${left.code}:${left.rule}`;
      const b = `${right.table}:${right.code}:${right.rule}`;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const tableReport = (policy: RecoveryTablePolicy) => {
      const own = ordered.filter((diagnostic) => diagnostic.table === policy.table);
      return {
        table: policy.table,
        sourceRows: source[policy.table]!.length,
        declaredDestinationRows: destination ? destination[policy.table]!.length : null,
        projectedForeignKeyRules: policy.foreignKeys.length,
        projectedUniqueRules: policy.uniqueKeys.length,
        status: own.some((issue) => issue.classification === "violation") ? "violations" as const
          : own.length > 0 ? "requires_resolution" as const : "empty" as const,
      };
    };
    return {
      policyVersion: "canonical_recovery_preflight_v1", status: "blocked", partial: true,
      restorable: false, authenticityVerified: false, authorizationVerified: false,
      destinationVerified: false, referentialIntegrityVerified: false, sourceCompletenessVerified: false,
      archiveChecksumsVerified: true,
      projectedSourceRelations: ordered.some((d) => d.code === "foreign_key_missing" || d.code === "organization_root_missing" || d.code === "primary_key_missing") ? "violations" : "consistent",
      projectedSourceUniqueness: ordered.some((d) => d.code === "source_unique_collision" || d.code === "source_primary_key_collision") ? "violations" : "consistent",
      destinationComparison: destination ? "declared_same_organization_archive" : "not_supplied",
      outsideOrganizationIdConflicts: "unknown",
      blockers: [
        "source_provenance_and_current_authorization_unknown",
        "auth_storage_legacy_and_excluded_sources_not_recovered",
        "destination_schema_authorization_and_external_id_conflicts_unknown",
        "postgres_checks_exclusions_triggers_not_verified",
        "no_import_or_effect_reactivation_authorized",
      ],
      tables: CANONICAL_RECOVERY_POLICY.map(tableReport), diagnostics: ordered,
    };
  } catch {
    // Keep malformed / unverified input values out of error text and causes.
    throw new CanonicalRecoveryPreflightError();
  }
}
