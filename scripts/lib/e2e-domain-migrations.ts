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
