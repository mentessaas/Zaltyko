import type { CanonicalRecoveryDiagnostic } from "./canonical-recovery-contract";

/** A declared archive is evidence for planning, never an instruction to erase. */
export interface CanonicalDispositionInput {
  body: string;
  organizationId: string;
}

export type CanonicalDispositionDecision =
  | "current_authority_and_instruction"
  | "retention_basis_and_period"
  | "hold_status_and_release"
  | "excluded_values_and_delivery_channel"
  | "shared_identity_scope"
  | "financial_history_and_provider_effects"
  | "nested_content_classification"
  | "source_ownership_and_scope"
  | "provider_and_backup_retention"
  | "projected_dependencies";

export interface CanonicalDispositionTable {
  table: string;
  category: string;
  coverage: "projected_values" | "excluded_values" | "optional_not_reported";
  /** A declared snapshot count, not a current census or proof of absence. */
  rowCount: number | string | null;
  countEvidence: "projected_archive_rows" | "declared_organization_count" | "unknown" | "optional_not_reported";
  omittedColumns: string[];
  decision: "pending";
  eligibleForDeletion: false;
  retention: "unknown";
  hold: "unknown";
  missingDecisions: CanonicalDispositionDecision[];
}

export interface CanonicalDispositionSource {
  source: "auth" | "storage" | "legacy_public" | "external_backup_dependencies" | "external_email_dependencies" | "external_observability_dependencies";
  coverage: "excluded_uninventoried" | "external_uninventoried";
  rowCount: null;
  decision: "pending";
  eligibleForDeletion: false;
  retention: "unknown";
  hold: "unknown";
  missingDecisions: CanonicalDispositionDecision[];
}

export interface CanonicalDispositionReport {
  policyVersion: "canonical_disposition_plan_v1";
  evidence: "declared_partial_archive";
  status: "blocked";
  partial: true;
  executable: false;
  restorable: false;
  authenticityVerified: false;
  authorizationVerified: false;
  currentStateVerified: false;
  sourceCompletenessVerified: false;
  archiveChecksumsVerified: true;
  projectedSourceRelations: "consistent" | "violations";
  projectedSourceUniqueness: "consistent" | "violations";
  /** Projection diagnostics only; never a cascade graph or deletion order. */
  dependencyDiagnostics: Omit<CanonicalRecoveryDiagnostic, "sampleRowOrdinals">[];
  blockers: readonly [
    "current_authority_instruction_and_archive_provenance_unknown",
    "retention_and_holds_unresolved",
    "excluded_and_external_sources_uninventoried",
    "full_schema_dependencies_and_current_state_unknown",
    "no_disposition_execution_authorized",
  ];
  tables: CanonicalDispositionTable[];
  sources: CanonicalDispositionSource[];
}

export class CanonicalDispositionPlanError extends Error {
  constructor() {
    super("No se pudo preparar el plan diagnóstico de disposición canónica.");
    this.name = "CanonicalDispositionPlanError";
  }
}
