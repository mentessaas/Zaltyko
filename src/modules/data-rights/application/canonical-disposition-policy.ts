import { CanonicalDispositionPlanError, type CanonicalDispositionDecision } from "../domain/canonical-disposition-contract";
import {
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_SCOPED_TABLES,
  EXCLUDED_CANONICAL_SOURCES,
  EXCLUDED_CANONICAL_TABLES,
  OPTIONAL_EXPORT_MODULE_GROUPS,
  OPTIONAL_INCLUDED_EXPORT_MODULES,
} from "./catalog";

/** Reviewed inventory boundary, NOT a retention policy or delete allowlist. */
const includedNames = `organizations locations facilities spaces organization_members member_location_scopes people athletes families guardians guardian_contacts family_guardians family_members family_payers family_collection_preferences staff_profiles organization_sports programs groups group_memberships group_membership_history class_templates class_template_groups class_template_weekdays sessions session_staff price_plans enrollments enrollment_status_history enrollment_pauses attendance_records trials trial_status_history trial_followups waitlist_entries waitlist_offers price_plan_class_template_coverage enrollment_price_assignments invoices invoice_lines invoice_line_enrollments charges payments payment_allocations refunds financial_reconciliation_runs`.split(" ");

interface ExcludedPolicy { table: string; category: string; scoped: boolean }
const e = (table: string, category: string, scoped = true): ExcludedPolicy => ({ table, category, scoped });
export const REVIEWED_DISPOSITION_EXCLUSIONS: readonly ExcludedPolicy[] = [
  e("organization_bootstrap_commands", "internal_commands"),
  e("organization_payment_provider_accounts", "payment_provider_configuration"),
  e("family_payment_authorizations", "payment_authorizations"),
  e("sport_profiles", "shared_catalogs", false),
  e("outbox_events", "internal_event_payloads"),
  e("audit_log", "internal_audit_payloads"),
  e("owner_dashboard_layouts", "user_preferences"),
  e("payment_provider_events", "payment_provider_events"),
  e("payment_attempts", "payment_provider_attempts"),
  e("metric_definitions", "analytics_and_internal_configuration", false),
  e("metric_runs", "analytics_and_internal_configuration"),
  e("metric_run_values", "analytics_and_internal_configuration"),
  e("metric_values", "analytics_and_internal_configuration"),
  e("metric_event_consumptions", "analytics_and_internal_configuration"),
  e("metric_invalidations", "analytics_and_internal_configuration"),
  e("retention_cohort_projection_runs", "analytics_and_internal_configuration"),
  e("retention_cohort_projections", "analytics_and_internal_configuration"),
  e("data_quality_issues", "analytics_and_internal_configuration"),
  e("benchmark_profiles", "health_score_and_benchmarks"),
  e("benchmark_metric_targets", "health_score_and_benchmarks", false),
  e("health_score_versions", "health_score_and_benchmarks", false),
  e("health_score_dimension_weights", "health_score_and_benchmarks", false),
  e("health_score_metric_weights", "health_score_and_benchmarks", false),
  e("health_score_snapshots", "health_score_and_benchmarks"),
  e("health_score_dimension_snapshots", "health_score_and_benchmarks"),
  e("health_score_metric_contributions", "health_score_and_benchmarks"),
  e("insight_rule_versions", "insights_and_recommendations", false),
  e("insight_rule_runs", "insights_and_recommendations"),
  e("insights", "insights_and_recommendations"),
  e("insight_run_observations", "insights_and_recommendations"),
  e("insight_status_history", "insights_and_recommendations"),
  e("insight_actions", "insights_and_recommendations"),
  e("insight_notifications", "insights_and_recommendations"),
  e("organization_saas_customers", "saas_billing_and_provider_data"),
  e("organization_saas_checkout_operations", "saas_billing_and_provider_data"),
  e("organization_saas_trials", "saas_billing_and_provider_data"),
  e("organization_saas_subscriptions", "saas_billing_and_provider_data"),
  e("organization_entitlements", "saas_billing_and_provider_data"),
  e("organization_entitlement_changes", "saas_billing_and_provider_data"),
  e("organization_saas_webhook_events", "saas_billing_and_provider_data"),
  e("organization_saas_webhook_payload_conflicts", "saas_billing_and_provider_data", false),
  e("organization_saas_webhook_reconciliation_decisions", "saas_billing_and_provider_data"),
  e("organization_saas_webhook_reconciliation_results", "saas_billing_and_provider_data", false),
  e("owner_signup_consent_policy", "identity_and_consent", false),
  e("owner_signup_consents", "identity_and_consent", false),
  e("owner_signup_consent_audits", "identity_and_consent", false),
];

export const REVIEWED_DISPOSITION_OPTIONAL_GROUPS: readonly (readonly ExcludedPolicy[])[] = [
  [e("product_discovery_interests", "private_member_preferences"), e("product_discovery_signals", "academy_product_discovery")],
  [e("organization_member_invitations", "team_access_credentials"), e("organization_member_invitation_scopes", "pending_team_access_scopes"), e("organization_team_command_receipts", "internal_team_access_commands")],
];

/** Activated academy modules whose rows are projected when installed (2026-11-12). */
export const REVIEWED_DISPOSITION_OPTIONAL_INCLUDED_MODULES: readonly (readonly string[])[] = [
  ["athlete_objectives", "athlete_objective_status_history", "athlete_observations"],
  ["class_template_staff", "session_staff_overrides"],
  ["session_plans", "session_plan_blocks", "session_plan_objectives", "class_plan_templates"],
  ["admission_links", "admission_requests"],
  ["skill_templates", "skill_levels", "skill_elements", "athlete_skill_progress", "athlete_level_passes"],
  // Familias: acceso al portal y avisos (candidato 20261114120000, sin aplicar).
  ["guardian_access_invitations", "family_notices", "family_notice_recipients", "guardian_notification_preferences"],
];

const sourceNames = ["Supabase Auth identities and credentials", "Supabase Storage objects and metadata", "Legacy public schema"];
const financialTables = new Set("family_collection_preferences price_plans price_plan_class_template_coverage enrollment_price_assignments invoices invoice_lines invoice_line_enrollments charges payments payment_allocations refunds financial_reconciliation_runs".split(" "));
const financialCategories = new Set(["payment_provider_configuration", "payment_authorizations", "payment_provider_events", "payment_provider_attempts", "saas_billing_and_provider_data"]);
const payloadCategories = new Set(["internal_event_payloads", "internal_audit_payloads", "analytics_and_internal_configuration", "health_score_and_benchmarks", "insights_and_recommendations", "user_preferences"]);

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && right.every((item) => left.includes(item));
}

/** New/moved sources, count scopes or categories require an explicit review. */
export function assertCanonicalDispositionPolicy(): void {
  if (!same(includedNames, CANONICAL_EXPORT_TABLES.map((table) => table.name)) ||
      !same(sourceNames, EXCLUDED_CANONICAL_SOURCES.map((entry) => entry.source)) ||
      !same(REVIEWED_DISPOSITION_EXCLUSIONS.map((entry) => entry.table), EXCLUDED_CANONICAL_TABLES.map((entry) => entry.table)) ||
      !same(REVIEWED_DISPOSITION_EXCLUSIONS.filter((entry) => entry.scoped).map((entry) => entry.table), EXCLUDED_CANONICAL_SCOPED_TABLES) ||
      REVIEWED_DISPOSITION_EXCLUSIONS.some((policy) => EXCLUDED_CANONICAL_TABLES.find((entry) => entry.table === policy.table)?.category !== policy.category) ||
      OPTIONAL_EXPORT_MODULE_GROUPS.length !== REVIEWED_DISPOSITION_OPTIONAL_GROUPS.length ||
      OPTIONAL_INCLUDED_EXPORT_MODULES.length !== REVIEWED_DISPOSITION_OPTIONAL_INCLUDED_MODULES.length ||
      OPTIONAL_INCLUDED_EXPORT_MODULES.some((module, index) =>
        !same(REVIEWED_DISPOSITION_OPTIONAL_INCLUDED_MODULES[index]!, module.tables.map((table) => table.name)))) {
    throw new CanonicalDispositionPlanError();
  }
  REVIEWED_DISPOSITION_OPTIONAL_GROUPS.forEach((group, index) => {
    const current = OPTIONAL_EXPORT_MODULE_GROUPS[index]!;
    if (!same(group.map((entry) => entry.table), current.map((entry) => entry.table)) ||
        group.some((policy) => current.find((entry) => entry.table === policy.table)?.category !== policy.category)) {
      throw new CanonicalDispositionPlanError();
    }
  });
}

export function dispositionMissingDecisions(table: string, category: string, omittedColumns: readonly string[]): CanonicalDispositionDecision[] {
  const decisions: CanonicalDispositionDecision[] = ["current_authority_and_instruction", "retention_basis_and_period", "hold_status_and_release", "projected_dependencies"];
  if (category !== "operational_projection" || omittedColumns.length > 0) decisions.push("excluded_values_and_delivery_channel");
  if (category !== "operational_projection") decisions.push("source_ownership_and_scope");
  if (omittedColumns.some((column) => ["user_id", "auth_user_id", "recorded_by_user_id"].includes(column)) || category === "identity_and_consent") decisions.push("shared_identity_scope");
  if (financialTables.has(table) || financialCategories.has(category)) decisions.push("financial_history_and_provider_effects");
  if (table === "waitlist_entries" || payloadCategories.has(category)) decisions.push("nested_content_classification");
  return decisions;
}
