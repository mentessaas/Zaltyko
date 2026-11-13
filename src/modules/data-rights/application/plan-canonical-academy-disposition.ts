import {
  CanonicalDispositionPlanError,
  type CanonicalDispositionInput,
  type CanonicalDispositionReport,
  type CanonicalDispositionSource,
  type CanonicalDispositionTable,
} from "../domain/canonical-disposition-contract";
import { CANONICAL_EXPORT_OMISSIONS, CANONICAL_EXPORT_TABLES, exportOmissionsFor, OPTIONAL_INCLUDED_EXPORT_TABLES } from "./catalog";
import { assertCanonicalDispositionPolicy, dispositionMissingDecisions, REVIEWED_DISPOSITION_EXCLUSIONS, REVIEWED_DISPOSITION_OPTIONAL_GROUPS } from "./canonical-disposition-policy";
import { preflightCanonicalAcademyRecovery } from "./preflight-canonical-academy-recovery";
import { validateCanonicalAcademyArchive } from "./verify-canonical-academy-archive";

function strictInput(input: CanonicalDispositionInput): CanonicalDispositionInput {
  if (input === null || typeof input !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new CanonicalDispositionPlanError();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !keys.includes("body") || !keys.includes("organizationId") ||
      !Object.prototype.hasOwnProperty.call(descriptors.body, "value") ||
      !Object.prototype.hasOwnProperty.call(descriptors.organizationId, "value") ||
      typeof descriptors.body.value !== "string" || typeof descriptors.organizationId.value !== "string") {
    throw new CanonicalDispositionPlanError();
  }
  return { body: descriptors.body.value, organizationId: descriptors.organizationId.value };
}

/**
 * Pure review plan of one declared partial archive, with no route/DB/filesystem,
 * network, clock, commands, row selection or caller-supplied approval policy.
 * Even zero counts describe only that archive; no entity is eligible to erase.
 */
export function planCanonicalAcademyDisposition(input: CanonicalDispositionInput): CanonicalDispositionReport {
  try {
    const scope = strictInput(input);
    assertCanonicalDispositionPolicy();
    const verified = validateCanonicalAcademyArchive(scope);
    const relations = preflightCanonicalAcademyRecovery(scope);
    // Both validators inspected this exact immutable primitive. Never expose
    // rows or caller-controlled metadata from the parsed body in the report.
    const archive = JSON.parse(scope.body) as { coverage: { excludedTables: Array<{ table: string; rowCount: number | string | null }> } };
    const exclusions = new Map(archive.coverage.excludedTables.map((entry) => [entry.table, entry.rowCount]));
    const tables = CANONICAL_EXPORT_TABLES.map<CanonicalDispositionTable>((spec) => {
      const omittedColumns = CANONICAL_EXPORT_OMISSIONS.filter((entry) => entry.table === spec.name).map((entry) => entry.column);
      const count = verified.tableChecksums.find((entry) => entry.table === spec.name)!.rowCount;
      return {
        table: spec.name, category: "operational_projection", coverage: "projected_values",
        rowCount: count, countEvidence: "projected_archive_rows", omittedColumns,
        decision: "pending", eligibleForDeletion: false, retention: "unknown", hold: "unknown",
        missingDecisions: dispositionMissingDecisions(spec.name, "operational_projection", omittedColumns),
      };
    });
    // Activated modules: projected when the archive carries them, otherwise
    // reported as not present in this archive (never as zero rows).
    for (const spec of OPTIONAL_INCLUDED_EXPORT_TABLES) {
      const omittedColumns = exportOmissionsFor([spec]).map((entry) => entry.column);
      const checksum = verified.tableChecksums.find((entry) => entry.table === spec.name);
      tables.push({
        table: spec.name, category: "operational_projection",
        coverage: checksum ? "projected_values" : "optional_not_reported",
        rowCount: checksum ? checksum.rowCount : null,
        countEvidence: checksum ? "projected_archive_rows" : "optional_not_reported",
        omittedColumns, decision: "pending", eligibleForDeletion: false, retention: "unknown", hold: "unknown",
        missingDecisions: dispositionMissingDecisions(spec.name, "operational_projection", omittedColumns),
      });
    }
    for (const policy of [...REVIEWED_DISPOSITION_EXCLUSIONS, ...REVIEWED_DISPOSITION_OPTIONAL_GROUPS.flat()]) {
      const reported = exclusions.has(policy.table);
      const rowCount = reported ? exclusions.get(policy.table)! : null;
      tables.push({
        table: policy.table, category: policy.category,
        coverage: reported ? "excluded_values" : "optional_not_reported",
        rowCount, countEvidence: !reported ? "optional_not_reported" : policy.scoped ? "declared_organization_count" : "unknown",
        omittedColumns: [], decision: "pending", eligibleForDeletion: false, retention: "unknown", hold: "unknown",
        missingDecisions: dispositionMissingDecisions(policy.table, policy.category, []),
      });
    }
    const sources = (["auth", "storage", "legacy_public", "external_backup_dependencies", "external_email_dependencies", "external_observability_dependencies"] as const).map<CanonicalDispositionSource>((source) => ({
      source, coverage: source.startsWith("external_") ? "external_uninventoried" : "excluded_uninventoried",
      rowCount: null, decision: "pending", eligibleForDeletion: false, retention: "unknown", hold: "unknown",
      missingDecisions: ["current_authority_and_instruction", "source_ownership_and_scope", "retention_basis_and_period", "hold_status_and_release", "provider_and_backup_retention"],
    }));
    return {
      policyVersion: "canonical_disposition_plan_v1", evidence: "declared_partial_archive", status: "blocked", partial: true,
      executable: false, restorable: false, authenticityVerified: false, authorizationVerified: false,
      currentStateVerified: false, sourceCompletenessVerified: false, archiveChecksumsVerified: true,
      projectedSourceRelations: relations.projectedSourceRelations, projectedSourceUniqueness: relations.projectedSourceUniqueness,
      dependencyDiagnostics: relations.diagnostics.map(({ code, classification, table, rule, occurrences }) => ({ code, classification, table, rule, occurrences })),
      blockers: ["current_authority_instruction_and_archive_provenance_unknown", "retention_and_holds_unresolved", "excluded_and_external_sources_uninventoried", "full_schema_dependencies_and_current_state_unknown", "no_disposition_execution_authorized"],
      tables, sources,
    };
  } catch {
    // No row values, IDs, URLs, checksums or unknown caller fields in errors.
    throw new CanonicalDispositionPlanError();
  }
}
