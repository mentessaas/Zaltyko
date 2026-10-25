export const E2E_DOMAIN_MIGRATIONS = [
  "20261006080702_establish_zaltyko_domain_foundation.sql",
  "20261013100000_model_sport_profiles_and_complementary_activities.sql",
  "20261006085254_add_operational_enrollment_invariants.sql",
  "20261006090034_add_trials_waitlists_families.sql",
  "20261006093047_add_internal_billing_ledger.sql",
  "20261006094607_add_versioned_metric_engine.sql",
  "20261006100146_add_explainable_health_score.sql",
  "20261006113000_add_actionable_insights.sql",
  "20261006123000_add_organization_bootstrap.sql",
  "20261006131000_add_organization_default_currency.sql",
  "20261006160012_track_owner_pipeline_freshness.sql",
  "20261006165917_owner_cohort_retention_projections.sql",
  "20261013120000_owner_dashboard_layout_preferences.sql",
  "20261013082806_organization_payment_accounts.sql",
  "20261013160000_canonical_family_collection_and_entitlements.sql",
  "20261013170001_record_group_membership_history.sql",
] as const;

// This migration belongs only to the ephemeral local browser runner. The
// shared E2E_DOMAIN_MIGRATIONS list is also consumed by the guarded sandbox
// migration job, so keep this separate to avoid implicit remote application.
export const E2E_LOCAL_OWNER_SIGNUP_MIGRATIONS = [
  "20261013235142_owner_signup_consent_canonical.sql",
] as const;

// Monthly athlete tariff coverage is required by the local authenticated
// browser journey, but must not leak into the guarded sandbox migration job.
export const E2E_LOCAL_OWNER_MONTHLY_TARIFF_MIGRATIONS = [
  "20261014001209_monthly_athlete_tariff_coverage_and_invoice_line_enrollments.sql",
] as const;

// The local synthetic Owner browser runner starts from this current-state
// fixture because the historical migration list does not yet reconstruct the
// SaaS trial schema. This is explicitly not recovered migration history and is
// never used by the guarded sandbox migration runner or production manifest.
export const E2E_LOCAL_SCHEMA_SNAPSHOT = {
  filename: "20261024172153_sandbox_schema_snapshot_baseline.sql",
  sha256: "fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36",
} as const;

// These reviewed, post-snapshot files are the only overlays needed by the
// disposable full Supabase stack used by the synthetic Owner E2E.
export const E2E_LOCAL_SCHEMA_POST_SNAPSHOT_MIGRATIONS = [
  {
    filename: "20261024193934_rls_guard_missing_public_tables.sql",
    sha256: "005d16a4b2f87727c2c47b3affe5ccd5433323fdcf02404135cbf5d11be07959",
  },
  {
    filename: "20261024223700_seed_owner_bootstrap_sport_profiles.sql",
    sha256: "d8c2a0b81a0d7f75f1f94ebd0f131ab85775a6e7904e2606a980570cbc02c225",
  },
] as const;
