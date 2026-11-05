/** Internal diagnostic contract. None of these types authorizes an import. */
export interface CanonicalRecoveryPreflightInput {
  body: string;
  organizationId: string;
  /** Another self-declared v1 archive, never a live or authoritative target. */
  destination?: { body: string };
}

export type CanonicalRecoveryIssueCode =
  | "organization_root_missing"
  | "primary_key_missing"
  | "source_primary_key_collision"
  | "foreign_key_missing"
  | "source_unique_collision"
  | "destination_primary_key_collision"
  | "destination_unique_collision"
  | "omitted_value_unknown"
  | "polymorphic_reference_unknown"
  | "postgres_checks_exclusions_triggers_unsupported";

export interface CanonicalRecoveryDiagnostic {
  code: CanonicalRecoveryIssueCode;
  classification: "violation" | "unknown" | "unsupported";
  table: string;
  /** Reviewed policy name or column name; never a row value. */
  rule: string;
  occurrences: number;
  /** Zero-based source row ordinals, at most five. No IDs or record values. */
  sampleRowOrdinals: number[];
}

export interface CanonicalRecoveryTableReport {
  table: string;
  sourceRows: number;
  declaredDestinationRows: number | null;
  projectedForeignKeyRules: number;
  projectedUniqueRules: number;
  status: "violations" | "requires_resolution" | "empty";
}

export interface CanonicalRecoveryPreflightReport {
  policyVersion: "canonical_recovery_preflight_v1";
  status: "blocked";
  partial: true;
  restorable: false;
  authenticityVerified: false;
  authorizationVerified: false;
  destinationVerified: false;
  referentialIntegrityVerified: false;
  sourceCompletenessVerified: false;
  archiveChecksumsVerified: true;
  /** Only rules visible in the exported projection, not full SQL integrity. */
  projectedSourceRelations: "violations" | "consistent";
  projectedSourceUniqueness: "violations" | "consistent";
  destinationComparison: "not_supplied" | "declared_same_organization_archive";
  outsideOrganizationIdConflicts: "unknown";
  blockers: readonly [
    "source_provenance_and_current_authorization_unknown",
    "auth_storage_legacy_and_excluded_sources_not_recovered",
    "destination_schema_authorization_and_external_id_conflicts_unknown",
    "postgres_checks_exclusions_triggers_not_verified",
    "no_import_or_effect_reactivation_authorized",
  ];
  tables: CanonicalRecoveryTableReport[];
  diagnostics: CanonicalRecoveryDiagnostic[];
}

export class CanonicalRecoveryPreflightError extends Error {
  constructor() {
    super("No se pudo preparar el diagnóstico de recuperación canónica.");
    this.name = "CanonicalRecoveryPreflightError";
  }
}
