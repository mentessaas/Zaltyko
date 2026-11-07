/**
 * Reviewed against the versioned foundation, operational enrollment, family /
 * trials, billing ledger, sports, collection, group history and monthly athlete
 * coverage migrations (20261006–20261014). This is a projected diagnostic
 * policy, NOT a PostgreSQL constraint implementation or a restore allowlist.
 * Redundant unique keys containing a PK need no additional collision rule.
 * Nonprojected keys, CHECK / EXCLUDE constraints and triggers remain blocked.
 */
export interface RecoveryForeignKey {
  columns: readonly string[];
  target: string;
  targetColumns: readonly string[];
}

export type RecoveryPredicate =
  | { column: string; test: "null" | "not_null" | "true" }
  | { column: string; test: "in"; values: readonly string[] };

export interface RecoveryUniqueKey {
  name: string;
  columns: readonly string[];
  predicate: readonly RecoveryPredicate[];
}

export interface RecoveryTablePolicy {
  table: string;
  reviewedColumns: readonly string[];
  primaryKey: readonly string[];
  foreignKeys: readonly RecoveryForeignKey[];
  uniqueKeys: readonly RecoveryUniqueKey[];
  unknownColumns: readonly string[];
}

const words = (value: string): string[] => value.split(/\s+/).filter(Boolean);
const f = (columns: string, target: string, targetColumns: string): RecoveryForeignKey =>
  ({ columns: words(columns), target, targetColumns: words(targetColumns) });
const r = (columns: string, target: string, targetColumns = "id"): RecoveryForeignKey =>
  f(`organization_id ${columns}`, target, `organization_id ${targetColumns}`);
const u = (name: string, columns: string, predicate: readonly RecoveryPredicate[] = []): RecoveryUniqueKey =>
  ({ name, columns: words(`organization_id ${columns}`), predicate });
const isNull = (column: string): RecoveryPredicate => ({ column, test: "null" });
const notNull = (column: string): RecoveryPredicate => ({ column, test: "not_null" });
const isTrue = (column: string): RecoveryPredicate => ({ column, test: "true" });
const oneOf = (column: string, ...values: string[]): RecoveryPredicate => ({ column, test: "in", values });
const p = (
  table: string,
  columns: string,
  foreignKeys: readonly RecoveryForeignKey[] = [],
  uniqueKeys: readonly RecoveryUniqueKey[] = [],
  unknownColumns = "",
  primaryKey = "id"
): RecoveryTablePolicy => ({
  table, reviewedColumns: words(columns), primaryKey: words(primaryKey),
  foreignKeys, uniqueKeys, unknownColumns: words(unknownColumns),
});

export const CANONICAL_RECOVERY_POLICY: readonly RecoveryTablePolicy[] = [
  p("organizations", "id name legal_name status country_code default_currency default_timezone created_at updated_at"),
  p("locations", "id organization_id code name timezone is_active created_at updated_at", [], [u("locations_organization_code_uq", "code")]),
  p("facilities", "id organization_id location_id name is_active created_at updated_at", [r("location_id", "locations")]),
  p("spaces", "id organization_id location_id facility_id name capacity is_active created_at updated_at", [r("location_id", "locations"), r("facility_id", "facilities")]),
  p("organization_members", "id organization_id user_id role status location_scope_mode created_at updated_at", [], [], "user_id"),
  p("member_location_scopes", "id organization_id member_id location_id created_at", [r("member_id", "organization_members"), r("location_id", "locations")], [u("member_location_scopes_member_location_uq", "member_id location_id")]),
  p("people", "id organization_id given_name family_name preferred_name date_of_birth created_at updated_at"),
  p("athletes", "id organization_id person_id external_reference is_active created_at updated_at", [r("person_id", "people")], [u("athletes_organization_person_uq", "person_id")]),
  p("families", "id organization_id external_reference is_active created_at updated_at"),
  p("guardians", "id organization_id person_id auth_user_id is_active created_at updated_at", [r("person_id", "people")], [u("guardians_organization_person_uq", "person_id")], "auth_user_id"),
  p("guardian_contacts", "id organization_id guardian_id kind value normalized_value is_primary verified_at created_at updated_at", [r("guardian_id", "guardians")], [u("guardian_contacts_primary_kind_uq", "guardian_id kind", [isTrue("is_primary")])], "normalized_value"),
  p("family_guardians", "id organization_id family_id guardian_id relationship can_view_athletes can_manage_enrollments is_active created_at updated_at", [r("family_id", "families"), r("guardian_id", "guardians")], [u("family_guardians_family_guardian_uq", "family_id guardian_id")]),
  p("family_members", "id organization_id family_id athlete_id relationship starts_on ends_on created_at updated_at", [r("family_id", "families"), r("athlete_id", "athletes")], [u("family_members_one_open_uq", "family_id athlete_id", [isNull("ends_on")])]),
  p("family_payers", "id organization_id family_id guardian_id is_primary starts_on ends_on created_at updated_at", [r("family_id guardian_id", "family_guardians", "family_id guardian_id")], [u("family_payers_family_guardian_uq", "family_id guardian_id starts_on"), u("family_payers_one_primary_uq", "family_id", [isTrue("is_primary"), isNull("ends_on")])]),
  p("family_collection_preferences", "organization_id family_id requested_mode version entitlement_revision updated_by_member_id created_at updated_at", [r("family_id", "families"), r("updated_by_member_id", "organization_members")], [], "", "organization_id family_id"),
  p("staff_profiles", "id organization_id person_id member_id is_active created_at updated_at", [r("person_id", "people"), r("member_id", "organization_members")], [u("staff_profiles_organization_person_uq", "person_id")]),
  p("organization_sports", "id organization_id country_code sport_profile_id role status starts_on ends_on created_at updated_at", [f("organization_id country_code", "organizations", "id country_code")], [u("organization_sports_primary_active_uq", "", [oneOf("role", "primary"), oneOf("status", "active")])], "sport_profile_id"),
  p("programs", "id organization_id name kind organization_sport_id activity_key status created_at updated_at", [r("organization_sport_id", "organization_sports")]),
  p("groups", "id organization_id location_id program_id name capacity status created_at updated_at", [r("location_id", "locations"), r("program_id", "programs")]),
  p("group_memberships", "id organization_id group_id athlete_id status starts_on ends_on created_at updated_at", [r("group_id", "groups"), r("athlete_id", "athletes")], [u("group_memberships_open_uq", "group_id athlete_id", [oneOf("status", "pending", "active", "paused")])]),
  p("group_membership_history", "id organization_id membership_id from_status to_status reason_code changed_by_member_id idempotency_key effective_on changed_at", [r("membership_id", "group_memberships"), r("changed_by_member_id", "organization_members")], [], "idempotency_key"),
  p("class_templates", "id organization_id location_id program_id default_space_id name capacity status effective_from effective_to created_at updated_at", [r("location_id", "locations"), r("program_id", "programs"), r("default_space_id", "spaces")]),
  p("class_template_groups", "id organization_id class_template_id group_id", [r("class_template_id", "class_templates"), r("group_id", "groups")], [u("class_template_groups_uq", "class_template_id group_id")]),
  p("class_template_weekdays", "id organization_id class_template_id iso_weekday starts_at_local ends_at_local", [r("class_template_id", "class_templates")], [u("class_template_weekdays_uq", "class_template_id iso_weekday starts_at_local")]),
  p("sessions", "id organization_id location_id class_template_id space_id status starts_at ends_at capacity_override cancellation_reason created_at updated_at", [r("location_id", "locations"), r("class_template_id", "class_templates"), r("space_id", "spaces")], [u("sessions_template_start_uq", "class_template_id starts_at")]),
  p("session_staff", "id organization_id session_id staff_profile_id assignment_role", [r("session_id", "sessions"), r("staff_profile_id", "staff_profiles")], [u("session_staff_uq", "session_id staff_profile_id")]),
  p("price_plans", "id organization_id name cadence amount_cents currency is_active created_at updated_at"),
  p("enrollments", "id organization_id location_id athlete_id class_template_id price_plan_id status starts_on ends_on source source_entity_id version created_at updated_at", [r("location_id", "locations"), r("athlete_id", "athletes"), r("class_template_id", "class_templates"), r("price_plan_id", "price_plans")], [u("enrollments_open_uq", "athlete_id class_template_id", [oneOf("status", "pending", "trial", "active", "paused")])]),
  p("enrollment_status_history", "id organization_id enrollment_id from_status to_status reason_code changed_by_member_id idempotency_key effective_on changed_at", [r("enrollment_id", "enrollments"), r("changed_by_member_id", "organization_members")], [], "idempotency_key"),
  p("enrollment_pauses", "id organization_id enrollment_id starts_on ends_on reason_code created_at", [r("enrollment_id", "enrollments")], [u("enrollment_pauses_one_open_uq", "enrollment_id", [isNull("ends_on")])]),
  p("attendance_records", "id organization_id location_id session_id enrollment_id athlete_id status recorded_by_member_id recorded_at", [r("location_id", "locations"), r("session_id", "sessions"), r("enrollment_id", "enrollments"), r("athlete_id", "athletes"), r("recorded_by_member_id", "organization_members")], [u("attendance_records_session_enrollment_uq", "session_id enrollment_id")]),
  p("trials", "id organization_id location_id athlete_id session_id trial_enrollment_id converted_enrollment_id status version booked_at attended_at completed_at converted_at created_at updated_at", [r("location_id", "locations"), r("athlete_id", "athletes"), r("location_id session_id", "sessions", "location_id id"), r("location_id trial_enrollment_id", "enrollments", "location_id id"), r("location_id converted_enrollment_id", "enrollments", "location_id id")], [u("trials_enrollment_uq", "trial_enrollment_id"), u("trials_athlete_session_uq", "athlete_id session_id")]),
  p("trial_status_history", "id organization_id location_id trial_id from_status to_status effective_at changed_by_member_id idempotency_key changed_at", [r("location_id trial_id", "trials", "location_id id"), r("changed_by_member_id", "organization_members")], [], "idempotency_key"),
  p("trial_followups", "id organization_id location_id trial_id channel outcome completed_by_member_id completed_at idempotency_key created_at", [r("location_id trial_id", "trials", "location_id id"), r("completed_by_member_id", "organization_members")], [], "idempotency_key"),
  p("waitlist_entries", "id organization_id location_id athlete_id class_template_id program_id source_trial_id contact_guardian_id contactable contact_consent_status contact_consent_recorded_at priority preferences status converted_enrollment_id joined_at version created_at updated_at", [r("location_id", "locations"), r("athlete_id", "athletes"), r("location_id class_template_id", "class_templates", "location_id id"), r("program_id", "programs"), r("location_id source_trial_id", "trials", "location_id id"), r("contact_guardian_id", "guardians"), r("location_id converted_enrollment_id", "enrollments", "location_id id")], [u("waitlist_entries_open_template_uq", "athlete_id class_template_id", [notNull("class_template_id"), oneOf("status", "waiting", "offered")]), u("waitlist_entries_open_program_uq", "location_id athlete_id program_id", [notNull("program_id"), oneOf("status", "waiting", "offered")])], "preferences"),
  p("waitlist_offers", "id organization_id location_id waitlist_entry_id class_template_id reserved_enrollment_id status sent_at expires_at responded_at idempotency_key version created_at updated_at", [r("location_id waitlist_entry_id", "waitlist_entries", "location_id id"), r("location_id class_template_id", "class_templates", "location_id id"), r("location_id reserved_enrollment_id", "enrollments", "location_id id")], [u("waitlist_offers_one_pending_uq", "waitlist_entry_id", [oneOf("status", "pending")])], "idempotency_key"),
  p("price_plan_class_template_coverage", "id organization_id location_id price_plan_id class_template_id starts_on ends_on created_at", [r("location_id", "locations"), r("price_plan_id", "price_plans"), r("location_id class_template_id", "class_templates", "location_id id")]),
  p("enrollment_price_assignments", "id organization_id location_id enrollment_id price_plan_id unit_amount_cents currency starts_on ends_on created_at updated_at", [r("location_id enrollment_id", "enrollments", "location_id id"), r("price_plan_id", "price_plans")], [u("enrollment_price_assignments_one_open_uq", "enrollment_id", [isNull("ends_on")])]),
  p("invoices", "id organization_id location_id family_id family_payer_id reference status currency total_amount_cents issued_at due_at voided_at idempotency_key version created_at updated_at", [r("location_id", "locations"), r("family_id", "families"), r("family_id family_payer_id", "family_payers", "family_id id")], [u("invoices_reference_uq", "reference")], "idempotency_key"),
  p("invoice_lines", "id organization_id invoice_id location_id athlete_id enrollment_id price_plan_id line_type quantity unit_amount_cents amount_cents currency service_period_start service_period_end created_at", [r("invoice_id currency", "invoices", "id currency"), r("enrollment_id", "enrollments"), r("price_plan_id", "price_plans"), r("location_id", "locations"), r("athlete_id", "athletes"), r("location_id invoice_id", "invoices", "location_id id")], [u("invoice_lines_monthly_athlete_uq", "invoice_id athlete_id service_period_start service_period_end", [oneOf("line_type", "monthly_fee"), notNull("athlete_id")])]),
  p("invoice_line_enrollments", "organization_id location_id athlete_id invoice_line_id price_plan_id enrollment_id class_template_id price_assignment_id class_name_snapshot created_at", [r("location_id", "locations"), r("athlete_id", "athletes"), r("location_id athlete_id price_plan_id invoice_line_id", "invoice_lines", "location_id athlete_id price_plan_id id"), r("location_id athlete_id class_template_id enrollment_id", "enrollments", "location_id athlete_id class_template_id id"), r("location_id class_template_id", "class_templates", "location_id id"), r("location_id price_plan_id enrollment_id price_assignment_id", "enrollment_price_assignments", "location_id price_plan_id enrollment_id id")], [u("invoice_line_enrollments_line_template_uq", "invoice_line_id class_template_id")], "", "organization_id invoice_line_id enrollment_id"),
  p("charges", "id organization_id location_id invoice_id invoice_line_id family_id family_payer_id enrollment_id collection_mode status amount_cents currency due_at service_period_start service_period_end idempotency_key version created_at updated_at", [r("location_id", "locations"), r("invoice_id currency", "invoices", "id currency"), r("invoice_line_id currency", "invoice_lines", "id currency"), r("family_id", "families"), r("family_id family_payer_id", "family_payers", "family_id id"), r("enrollment_id", "enrollments")], [u("charges_invoice_line_uq", "invoice_line_id")], "idempotency_key"),
  p("payments", "id organization_id location_id family_id family_payer_id source status amount_cents currency processor environment provider_payment_id manual_method manual_reference recorded_by_user_id received_at idempotency_key version created_at updated_at", [r("location_id", "locations"), r("family_id", "families"), r("family_id family_payer_id", "family_payers", "family_id id")], [], "processor environment provider_payment_id recorded_by_user_id idempotency_key"),
  p("payment_allocations", "id organization_id payment_id charge_id amount_cents currency allocated_at idempotency_key created_at", [r("payment_id currency", "payments", "id currency"), r("charge_id currency", "charges", "id currency")], [], "idempotency_key"),
  p("refunds", "id organization_id payment_id payment_allocation_id status amount_cents currency processor environment provider_refund_id reason_code refunded_at provider_event_id idempotency_key created_at", [r("payment_id currency", "payments", "id currency"), r("payment_allocation_id currency", "payment_allocations", "id currency")], [], "processor environment provider_refund_id provider_event_id idempotency_key"),
  p("financial_reconciliation_runs", "id organization_id currency period_start period_end expected_cents allocated_cents refunded_cents net_collected_cents outstanding_cents status formula_version source_watermark idempotency_key computed_at", [], [u("financial_reconciliation_natural_uq", "currency period_start period_end formula_version")], "source_watermark idempotency_key"),
];
