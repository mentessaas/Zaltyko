export interface CanonicalExportTableSpec {
  name: string;
  organizationColumn: "id" | "organization_id";
  expectedColumns: readonly string[];
  exportColumns: readonly string[];
  orderBy: readonly string[];
  /**
   * Reviewed SQL expressions that replace a plain column read. Used only for
   * structured JSON whose nested fields have an explicit classification: the
   * expression projects exactly those fields, so an unclassified nested key
   * never reaches the package.
   */
  projections?: Readonly<Record<string, string>>;
}

export interface CanonicalExportOmission {
  table: string;
  column: string;
  reason: string;
}

export interface CanonicalExportExcludedTable {
  table: string;
  category: string;
  reason: string;
}

/** Optional reviewed module: absent or fully installed, never partially known.
 * Current staff choices are private to that member (GET product-discovery),
 * not part of the Owner's operational return. Withdrawal deletes the choice.
 */
export const OPTIONAL_DISCOVERY_EXPORT_TABLES = [
  { table: "product_discovery_interests", category: "private_member_preferences", reason: "Current voluntary staff interest is read and withdrawn by that member; it is not academy operating data.", columns: ["id", "organization_id", "member_id", "location_id", "scope_key", "feature_id", "intent", "pilot", "updated_at"] },
  { table: "product_discovery_signals", category: "academy_product_discovery", reason: "Deduplicated product-discovery stages contain no actor or operational data; counts are reported separately.", columns: ["organization_id", "feature_id", "catalog_version", "signal", "first_seen_at"] },
] as const;

/** Access credentials and internal command receipts are not operating records.
 * Their scoped counts remain explicit in this partial return; values (including
 * invited emails, credential hashes and shared Auth IDs) never enter the bundle.
 */
export const OPTIONAL_TEAM_ACCESS_EXPORT_TABLES = [
  {
    table: "organization_member_invitations",
    category: "team_access_credentials",
    reason: "Invitation identities, credential hashes and acceptance evidence require a separate protected access-data return; only this academy's count is included.",
    columns: ["id", "organization_id", "normalized_email", "role", "status", "invited_by_member_id", "token_sha256", "expires_at", "revision", "staff_profile_id", "invitee_given_name", "invitee_family_name", "accepted_by_user_id", "accepted_member_id", "accepted_at", "revoked_by_member_id", "revoked_at", "created_at", "updated_at"],
  },
  {
    table: "organization_member_invitation_scopes",
    category: "pending_team_access_scopes",
    reason: "Pending invitation scopes are access-control evidence, not effective operating assignments; only this academy's count is included.",
    columns: ["id", "organization_id", "invitation_id", "location_id", "created_at"],
  },
  {
    table: "organization_team_command_receipts",
    category: "internal_team_access_commands",
    reason: "Team-access idempotency receipts contain shared Auth identifiers and internal hashes; only this academy's count is included.",
    columns: ["id", "organization_id", "actor_user_id", "idempotency_key", "operation", "request_hash", "invitation_id", "invitation_status", "invitation_revision", "invitation_expires_at", "member_id", "created_at"],
  },
] as const;

/** Family portal access and session notices (candidate 20261114120000, not
 * applied). Until a reviewed decision exports their values, only this
 * academy's counts are included: invitations hold invited emails and token
 * hashes, notices and receipts are communications with families. Absent or
 * fully installed, never partially known.
 */
export const OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES = [
  {
    table: "guardian_access_invitations",
    category: "family_access_credentials",
    reason: "Family portal invitation identities, credential hashes and acceptance evidence require a separate protected access-data return; only this academy's count is included.",
    columns: ["id", "organization_id", "guardian_id", "normalized_email", "status", "grant_view_athletes", "invited_by_member_id", "token_sha256", "expires_at", "revision", "last_sent_at", "accepted_by_user_id", "accepted_at", "revoked_by_member_id", "revoked_at", "created_at", "updated_at"],
  },
  {
    table: "family_notices",
    category: "family_communications",
    reason: "Notices the academy sent to families; values are pending a reviewed export decision, so only this academy's count is included.",
    columns: ["id", "organization_id", "location_id", "kind", "session_id", "class_template_id", "group_id", "title", "body", "dedupe_key", "created_by_member_id", "created_at"],
  },
  {
    table: "family_notice_recipients",
    category: "family_communications",
    reason: "Per-guardian read receipts and email outcomes of family notices; only this academy's count is included.",
    columns: ["id", "organization_id", "notice_id", "guardian_id", "email_status", "email_attempted_at", "read_at", "created_at"],
  },
  {
    table: "guardian_notification_preferences",
    category: "user_preferences",
    reason: "Email preferences a family set in the portal; only this academy's count is included.",
    columns: ["organization_id", "guardian_id", "email_session_changes", "email_manual_notices", "updated_at"],
  },
] as const;

export const OPTIONAL_EXPORT_MODULE_GROUPS: readonly (readonly (CanonicalExportExcludedTable & {
  columns: readonly string[];
})[])[] = [OPTIONAL_DISCOVERY_EXPORT_TABLES, OPTIONAL_TEAM_ACCESS_EXPORT_TABLES, OPTIONAL_FAMILY_ACCESS_EXPORT_TABLES];

function columns(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

const omittedColumnReasons: Record<string, string> = {
  "organization_members.user_id":
    "Supabase Auth user IDs identify accounts shared across academies and are outside this tenant export.",
  "guardians.auth_user_id":
    "Supabase Auth user IDs identify accounts shared across academies and are outside this tenant export.",
  "guardian_contacts.normalized_value":
    "This normalized duplicate of the contact value is an internal matching aid; the original contact value is included.",
  "organization_sports.sport_profile_id":
    "This points to a shared global sport catalog that is excluded from the package.",
  "group_membership_history.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the membership history.",
  "enrollment_status_history.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the enrollment history.",
  "trial_status_history.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the trial history.",
  "trial_followups.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the follow-up.",
  "waitlist_entries.preferences":
    "This is arbitrary JSON and is excluded until every nested field has an explicit privacy classification.",
  "waitlist_offers.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the offer.",
  "invoices.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the invoice.",
  "charges.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the charge.",
  "payments.processor":
    "Provider routing metadata is excluded from this operational package.",
  "payments.environment":
    "Provider environment metadata is excluded from this operational package.",
  "payments.provider_payment_id":
    "Provider payment references are excluded from this operational package.",
  "payments.recorded_by_user_id":
    "Supabase Auth user IDs identify accounts shared across academies and are outside this tenant export.",
  "payments.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the payment.",
  "payment_allocations.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the allocation.",
  "refunds.processor":
    "Provider routing metadata is excluded from this operational package.",
  "refunds.environment":
    "Provider environment metadata is excluded from this operational package.",
  "refunds.provider_refund_id":
    "Provider refund references are excluded from this operational package.",
  "refunds.provider_event_id":
    "Provider event references are excluded from this operational package.",
  "refunds.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the refund.",
  "financial_reconciliation_runs.source_watermark":
    "This internal source watermark is implementation metadata; the reconciled totals and period are included.",
  "financial_reconciliation_runs.idempotency_key":
    "This server-side command key is operational metadata and is not needed to interpret the reconciliation.",
  "athlete_objectives.client_request_id":
    "This client retry key is operational metadata and is not needed to interpret the objective.",
  "athlete_observations.client_request_id":
    "This client retry key is operational metadata and is not needed to interpret the observation.",
  "session_plans.client_request_id":
    "This client retry key is operational metadata and is not needed to interpret the session plan.",
  "session_plans.last_request_id":
    "This client retry key is operational metadata and is not needed to interpret the session plan.",
  "admission_links.token":
    "The public link token is a live access credential; the link's site, state and dates are included.",
  "admission_requests.submission_id":
    "This client retry key is operational metadata and is not needed to interpret the request.",
};

function includedTable(input: {
  name: string;
  organizationColumn?: "id" | "organization_id";
  expectedColumns: string;
  omit?: readonly string[];
  orderBy?: readonly string[];
  projections?: Readonly<Record<string, string>>;
}): CanonicalExportTableSpec {
  const expectedColumns = columns(input.expectedColumns);
  const omitted = new Set(input.omit ?? []);
  const organizationColumn = input.organizationColumn ?? "organization_id";
  const orderBy = input.orderBy ?? ["id"];

  if (
    !expectedColumns.includes(organizationColumn) ||
    orderBy.some((column) => !expectedColumns.includes(column))
  ) {
    throw new Error(`Invalid canonical export keys for ${input.name}`);
  }

  for (const column of omitted) {
    if (!expectedColumns.includes(column)) {
      throw new Error(`Unknown omitted column ${input.name}.${column}`);
    }
    if (!omittedColumnReasons[`${input.name}.${column}`]) {
      throw new Error(`Missing export omission reason for ${input.name}.${column}`);
    }
  }

  const exportColumns = expectedColumns.filter((column) => !omitted.has(column));
  if (exportColumns.length === 0) {
    throw new Error(`Canonical export table ${input.name} has no columns`);
  }
  for (const column of Object.keys(input.projections ?? {})) {
    if (!exportColumns.includes(column) || column === organizationColumn || orderBy.includes(column)) {
      throw new Error(`Invalid projected export column ${input.name}.${column}`);
    }
  }

  return {
    name: input.name,
    organizationColumn,
    expectedColumns,
    exportColumns,
    orderBy,
    ...(input.projections ? { projections: input.projections } : {}),
  };
}

export const CANONICAL_EXPORT_TABLES: readonly CanonicalExportTableSpec[] = [
  includedTable({
    name: "organizations",
    organizationColumn: "id",
    expectedColumns:
      "id name legal_name status country_code default_currency default_timezone created_at updated_at",
  }),
  includedTable({
    name: "locations",
    expectedColumns:
      "id organization_id code name timezone is_active created_at updated_at",
  }),
  includedTable({
    name: "facilities",
    expectedColumns:
      "id organization_id location_id name is_active created_at updated_at",
  }),
  includedTable({
    name: "spaces",
    expectedColumns:
      "id organization_id location_id facility_id name capacity is_active created_at updated_at",
  }),
  includedTable({
    name: "organization_members",
    expectedColumns:
      "id organization_id user_id role status location_scope_mode created_at updated_at",
    omit: ["user_id"],
  }),
  includedTable({
    name: "member_location_scopes",
    expectedColumns: "id organization_id member_id location_id created_at",
  }),
  includedTable({
    name: "people",
    expectedColumns:
      "id organization_id given_name family_name preferred_name date_of_birth created_at updated_at",
  }),
  includedTable({
    name: "athletes",
    expectedColumns:
      "id organization_id person_id external_reference is_active created_at updated_at",
  }),
  includedTable({
    name: "families",
    expectedColumns:
      "id organization_id external_reference is_active created_at updated_at",
  }),
  includedTable({
    name: "guardians",
    expectedColumns:
      "id organization_id person_id auth_user_id is_active created_at updated_at",
    omit: ["auth_user_id"],
  }),
  includedTable({
    name: "guardian_contacts",
    expectedColumns:
      "id organization_id guardian_id kind value normalized_value is_primary verified_at created_at updated_at",
    omit: ["normalized_value"],
  }),
  includedTable({
    name: "family_guardians",
    expectedColumns:
      "id organization_id family_id guardian_id relationship can_view_athletes can_manage_enrollments is_active created_at updated_at",
  }),
  includedTable({
    name: "family_members",
    expectedColumns:
      "id organization_id family_id athlete_id relationship starts_on ends_on created_at updated_at",
  }),
  includedTable({
    name: "family_payers",
    expectedColumns:
      "id organization_id family_id guardian_id is_primary starts_on ends_on created_at updated_at",
  }),
  includedTable({
    name: "family_collection_preferences",
    expectedColumns:
      "organization_id family_id requested_mode version entitlement_revision updated_by_member_id created_at updated_at",
    orderBy: ["family_id"],
  }),
  includedTable({
    name: "staff_profiles",
    expectedColumns:
      "id organization_id person_id member_id is_active created_at updated_at",
  }),
  includedTable({
    name: "organization_sports",
    expectedColumns:
      "id organization_id country_code sport_profile_id role status starts_on ends_on created_at updated_at",
    omit: ["sport_profile_id"],
  }),
  includedTable({
    name: "programs",
    expectedColumns:
      "id organization_id name kind organization_sport_id activity_key status created_at updated_at",
  }),
  includedTable({
    name: "groups",
    expectedColumns:
      "id organization_id location_id program_id name capacity status created_at updated_at",
  }),
  includedTable({
    name: "group_memberships",
    expectedColumns:
      "id organization_id group_id athlete_id status starts_on ends_on created_at updated_at",
  }),
  includedTable({
    name: "group_membership_history",
    expectedColumns:
      "id organization_id membership_id from_status to_status reason_code changed_by_member_id idempotency_key effective_on changed_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "class_templates",
    expectedColumns:
      "id organization_id location_id program_id default_space_id name capacity status effective_from effective_to created_at updated_at",
  }),
  includedTable({
    name: "class_template_groups",
    expectedColumns: "id organization_id class_template_id group_id",
  }),
  includedTable({
    name: "class_template_weekdays",
    expectedColumns:
      "id organization_id class_template_id iso_weekday starts_at_local ends_at_local",
  }),
  includedTable({
    name: "sessions",
    expectedColumns:
      "id organization_id location_id class_template_id space_id status starts_at ends_at capacity_override cancellation_reason created_at updated_at",
  }),
  includedTable({
    name: "session_staff",
    expectedColumns:
      "id organization_id session_id staff_profile_id assignment_role",
  }),
  includedTable({
    name: "price_plans",
    expectedColumns:
      "id organization_id name cadence amount_cents currency is_active created_at updated_at",
  }),
  includedTable({
    name: "enrollments",
    expectedColumns:
      "id organization_id location_id athlete_id class_template_id price_plan_id status starts_on ends_on source source_entity_id version created_at updated_at",
  }),
  includedTable({
    name: "enrollment_status_history",
    expectedColumns:
      "id organization_id enrollment_id from_status to_status reason_code changed_by_member_id idempotency_key effective_on changed_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "enrollment_pauses",
    expectedColumns:
      "id organization_id enrollment_id starts_on ends_on reason_code created_at",
  }),
  includedTable({
    name: "attendance_records",
    expectedColumns:
      "id organization_id location_id session_id enrollment_id athlete_id status recorded_by_member_id recorded_at",
  }),
  includedTable({
    name: "trials",
    expectedColumns:
      "id organization_id location_id athlete_id session_id trial_enrollment_id converted_enrollment_id status version booked_at attended_at completed_at converted_at created_at updated_at",
  }),
  includedTable({
    name: "trial_status_history",
    expectedColumns:
      "id organization_id location_id trial_id from_status to_status effective_at changed_by_member_id idempotency_key changed_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "trial_followups",
    expectedColumns:
      "id organization_id location_id trial_id channel outcome completed_by_member_id completed_at idempotency_key created_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "waitlist_entries",
    expectedColumns:
      "id organization_id location_id athlete_id class_template_id program_id source_trial_id contact_guardian_id contactable contact_consent_status contact_consent_recorded_at priority preferences status converted_enrollment_id joined_at version created_at updated_at",
    omit: ["preferences"],
  }),
  includedTable({
    name: "waitlist_offers",
    expectedColumns:
      "id organization_id location_id waitlist_entry_id class_template_id reserved_enrollment_id status sent_at expires_at responded_at idempotency_key version created_at updated_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "price_plan_class_template_coverage",
    expectedColumns:
      "id organization_id location_id price_plan_id class_template_id starts_on ends_on created_at",
  }),
  includedTable({
    name: "enrollment_price_assignments",
    expectedColumns:
      "id organization_id location_id enrollment_id price_plan_id unit_amount_cents currency starts_on ends_on created_at updated_at",
  }),
  includedTable({
    name: "invoices",
    expectedColumns:
      "id organization_id location_id family_id family_payer_id reference status currency total_amount_cents issued_at due_at voided_at idempotency_key version created_at updated_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "invoice_lines",
    expectedColumns:
      "id organization_id invoice_id location_id athlete_id enrollment_id price_plan_id line_type quantity unit_amount_cents amount_cents currency service_period_start service_period_end created_at",
  }),
  includedTable({
    name: "invoice_line_enrollments",
    expectedColumns:
      "organization_id location_id athlete_id invoice_line_id price_plan_id enrollment_id class_template_id price_assignment_id class_name_snapshot created_at",
    orderBy: ["invoice_line_id", "enrollment_id"],
  }),
  includedTable({
    name: "charges",
    expectedColumns:
      "id organization_id location_id invoice_id invoice_line_id family_id family_payer_id enrollment_id collection_mode status amount_cents currency due_at service_period_start service_period_end idempotency_key version created_at updated_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "payments",
    expectedColumns:
      "id organization_id location_id family_id family_payer_id source status amount_cents currency processor environment provider_payment_id manual_method manual_reference recorded_by_user_id received_at idempotency_key version created_at updated_at",
    omit: [
      "processor",
      "environment",
      "provider_payment_id",
      "recorded_by_user_id",
      "idempotency_key",
    ],
  }),
  includedTable({
    name: "payment_allocations",
    expectedColumns:
      "id organization_id payment_id charge_id amount_cents currency allocated_at idempotency_key created_at",
    omit: ["idempotency_key"],
  }),
  includedTable({
    name: "refunds",
    expectedColumns:
      "id organization_id payment_id payment_allocation_id status amount_cents currency processor environment provider_refund_id reason_code refunded_at provider_event_id idempotency_key created_at",
    omit: [
      "processor",
      "environment",
      "provider_refund_id",
      "provider_event_id",
      "idempotency_key",
    ],
  }),
  includedTable({
    name: "financial_reconciliation_runs",
    expectedColumns:
      "id organization_id currency period_start period_end expected_cents allocated_cents refunded_cents net_collected_cents outstanding_cents status formula_version source_watermark idempotency_key computed_at",
    omit: ["source_watermark", "idempotency_key"],
  }),
];

export function exportOmissionsFor(
  tables: readonly CanonicalExportTableSpec[]
): CanonicalExportOmission[] {
  return tables.flatMap((table) =>
    table.expectedColumns
      .filter((column) => !table.exportColumns.includes(column))
      .map((column) => ({
        table: table.name,
        column,
        reason: omittedColumnReasons[`${table.name}.${column}`],
      }))
  );
}

export const CANONICAL_EXPORT_OMISSIONS: readonly CanonicalExportOmission[] =
  exportOmissionsFor(CANONICAL_EXPORT_TABLES);

/**
 * Fields of each block of a class plan template, classified as academy
 * training content (the same fields as zaltyko.session_plan_blocks, written
 * through templateBlockSchema): kind, discipline, apparatus, free content up
 * to 300 characters and duration in minutes. No personal data.
 */
export const CLASS_PLAN_TEMPLATE_BLOCK_FIELDS = [
  "kind",
  "discipline",
  "apparatus",
  "content",
  "durationMinutes",
] as const;

/**
 * Exports the jsonb array with exactly the classified fields of each object
 * element, in stored order. Any other nested key is dropped in SQL, before
 * the value leaves the database. Text fields become JSON strings or null;
 * durationMinutes is kept only when it is a JSON number.
 */
const CLASS_PLAN_TEMPLATE_BLOCKS_PROJECTION = `coalesce((
  select jsonb_agg(jsonb_build_object(
    'kind', element.value ->> 'kind',
    'discipline', element.value ->> 'discipline',
    'apparatus', element.value ->> 'apparatus',
    'content', element.value ->> 'content',
    'durationMinutes', case when jsonb_typeof(element.value -> 'durationMinutes') = 'number'
      then element.value -> 'durationMinutes' end
  ) order by element.ordinality)
  from jsonb_array_elements(case when jsonb_typeof("blocks") = 'array' then "blocks" else '[]'::jsonb end)
    with ordinality as element(value, ordinality)
  where jsonb_typeof(element.value) = 'object'
), '[]'::jsonb)`;

/**
 * Academy operating modules installed from reviewed candidates (activated in
 * production on 2026-11-12). Each module is absent or fully installed, never
 * partially known: when present its rows are exported with values, checksums
 * and the same fail-closed column check as the core tables; when absent the
 * package is byte-identical to one generated before the module existed.
 * Sources: docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql,
 * 20261111180000_coach_assignment_candidate.sql,
 * 20261111200000_session_plans_candidate.sql and
 * 20261110120000_admission_requests_candidate.sql.
 */
export interface OptionalIncludedExportModule {
  module: "athlete_progress" | "coach_assignment" | "session_plans" | "admissions";
  tables: readonly CanonicalExportTableSpec[];
}

export const OPTIONAL_INCLUDED_EXPORT_MODULES: readonly OptionalIncludedExportModule[] = [
  {
    module: "athlete_progress",
    tables: [
      includedTable({
        name: "athlete_objectives",
        expectedColumns:
          "id organization_id athlete_id location_id client_request_id title discipline apparatus target_date status created_by_member_id created_at status_changed_by_member_id status_changed_at revision updated_at",
        omit: ["client_request_id"],
      }),
      includedTable({
        name: "athlete_objective_status_history",
        expectedColumns:
          "id organization_id objective_id revision from_status to_status changed_by_member_id changed_at",
      }),
      includedTable({
        name: "athlete_observations",
        expectedColumns:
          "id organization_id athlete_id location_id client_request_id body visibility observed_on session_id objective_id author_member_id created_at updated_by_member_id updated_at revision",
        omit: ["client_request_id"],
      }),
    ],
  },
  {
    module: "coach_assignment",
    tables: [
      includedTable({
        name: "class_template_staff",
        expectedColumns:
          "id organization_id class_template_id staff_profile_id assigned_by_member_id assigned_at",
      }),
      includedTable({
        name: "session_staff_overrides",
        expectedColumns:
          "id organization_id session_id reason changed_by_member_id changed_at",
      }),
    ],
  },
  {
    module: "session_plans",
    tables: [
      includedTable({
        name: "session_plans",
        expectedColumns:
          "id organization_id location_id session_id client_request_id last_request_id focus note from_template_revision revision created_by_member_id created_at updated_by_member_id updated_at",
        omit: ["client_request_id", "last_request_id"],
      }),
      includedTable({
        name: "session_plan_blocks",
        expectedColumns:
          "id organization_id plan_id position kind discipline apparatus content duration_minutes done_at done_by_member_id created_at",
      }),
      includedTable({
        name: "session_plan_objectives",
        expectedColumns: "organization_id plan_id athlete_id objective_id created_at",
        orderBy: ["plan_id", "objective_id"],
      }),
      includedTable({
        name: "class_plan_templates",
        expectedColumns:
          "id organization_id location_id class_template_id focus note blocks revision updated_by_member_id updated_at",
        projections: { blocks: CLASS_PLAN_TEMPLATE_BLOCKS_PROJECTION },
      }),
    ],
  },
  {
    module: "admissions",
    tables: [
      includedTable({
        name: "admission_links",
        expectedColumns:
          "id organization_id location_id token enabled created_by_member_id created_at revoked_at",
        omit: ["token"],
      }),
      includedTable({
        name: "admission_requests",
        expectedColumns:
          "id organization_id location_id link_id submission_id status contact_name contact_email contact_phone athlete_given_name athlete_birth_year message privacy_consent_version privacy_consent_at converted_athlete_id waitlist_entry_id handled_by_member_id handled_at anonymized_at revision created_at updated_at",
        omit: ["submission_id"],
      }),
    ],
  },
];

export const OPTIONAL_INCLUDED_EXPORT_TABLES: readonly CanonicalExportTableSpec[] =
  OPTIONAL_INCLUDED_EXPORT_MODULES.flatMap((module) => module.tables);

export const EXCLUDED_CANONICAL_TABLES: readonly CanonicalExportExcludedTable[] = [
  {
    table: "organization_bootstrap_commands",
    category: "internal_commands",
    reason: "Bootstrap idempotency records include shared Auth IDs and request hashes, not academy operating records.",
  },
  {
    table: "organization_payment_provider_accounts",
    category: "payment_provider_configuration",
    reason: "Provider account references, capabilities, and reconciliation state are excluded.",
  },
  {
    table: "family_payment_authorizations",
    category: "payment_authorizations",
    reason: "Payment method, mandate, and consent evidence references are excluded.",
  },
  {
    table: "sport_profiles",
    category: "shared_catalogs",
    reason: "This shared catalog includes configuration and source metadata rather than tenant-owned records.",
  },
  {
    table: "outbox_events",
    category: "internal_event_payloads",
    reason: "Outbox payloads are arbitrary JSON and may contain fields without an export classification.",
  },
  {
    table: "audit_log",
    category: "internal_audit_payloads",
    reason: "Audit before, after, and metadata fields are arbitrary JSON and may include shared Auth identifiers.",
  },
  {
    table: "owner_dashboard_layouts",
    category: "user_preferences",
    reason: "Dashboard layout is a user preference and may be shared with an Auth identity across academies.",
  },
  {
    table: "payment_provider_events",
    category: "payment_provider_events",
    reason: "Provider event payloads and references are excluded.",
  },
  {
    table: "payment_attempts",
    category: "payment_provider_attempts",
    reason: "Provider attempt and event references are excluded.",
  },
  {
    table: "metric_definitions",
    category: "analytics_and_internal_configuration",
    reason: "Shared metric definitions and formulas are not academy operating records.",
  },
  {
    table: "metric_runs",
    category: "analytics_and_internal_configuration",
    reason: "Metric runs contain analytics parameters, watermarks, and internal processing state.",
  },
  {
    table: "metric_run_values",
    category: "analytics_and_internal_configuration",
    reason: "Metric run values are derived analytics outputs and are outside this operational package.",
  },
  {
    table: "metric_values",
    category: "analytics_and_internal_configuration",
    reason: "Metric values are derived analytics outputs and are outside this operational package.",
  },
  {
    table: "metric_event_consumptions",
    category: "analytics_and_internal_configuration",
    reason: "Event consumption records are internal analytics processing state.",
  },
  {
    table: "metric_invalidations",
    category: "analytics_and_internal_configuration",
    reason: "Metric invalidation records are internal analytics processing state.",
  },
  {
    table: "retention_cohort_projection_runs",
    category: "analytics_and_internal_configuration",
    reason: "Retention projection runs are derived analytics processing state.",
  },
  {
    table: "retention_cohort_projections",
    category: "analytics_and_internal_configuration",
    reason: "Retention cohort projections are derived analytics outputs.",
  },
  {
    table: "data_quality_issues",
    category: "analytics_and_internal_configuration",
    reason: "Data quality issue evidence is internal analytics metadata.",
  },
  {
    table: "benchmark_profiles",
    category: "health_score_and_benchmarks",
    reason: "Benchmark methodology and source records are shared reference data.",
  },
  {
    table: "benchmark_metric_targets",
    category: "health_score_and_benchmarks",
    reason: "Benchmark targets are shared reference data.",
  },
  {
    table: "health_score_versions",
    category: "health_score_and_benchmarks",
    reason: "Health score definitions and versioning are internal product configuration.",
  },
  {
    table: "health_score_dimension_weights",
    category: "health_score_and_benchmarks",
    reason: "Health score weights are internal product configuration.",
  },
  {
    table: "health_score_metric_weights",
    category: "health_score_and_benchmarks",
    reason: "Health score weights are internal product configuration.",
  },
  {
    table: "health_score_snapshots",
    category: "health_score_and_benchmarks",
    reason: "Health score snapshots are derived analytics and may contain free-form explanations.",
  },
  {
    table: "health_score_dimension_snapshots",
    category: "health_score_and_benchmarks",
    reason: "Health score snapshots are derived analytics and may contain free-form explanations.",
  },
  {
    table: "health_score_metric_contributions",
    category: "health_score_and_benchmarks",
    reason: "Health score contributions are derived analytics and may contain free-form explanations.",
  },
  {
    table: "insight_rule_versions",
    category: "insights_and_recommendations",
    reason: "Insight rules and configuration are internal product logic.",
  },
  {
    table: "insight_rule_runs",
    category: "insights_and_recommendations",
    reason: "Insight run results and free-form error details are derived product data.",
  },
  {
    table: "insights",
    category: "insights_and_recommendations",
    reason: "Insight details, evidence, assumptions, and action payloads are free-form derived content.",
  },
  {
    table: "insight_run_observations",
    category: "insights_and_recommendations",
    reason: "Insight observation links are derived product data.",
  },
  {
    table: "insight_status_history",
    category: "insights_and_recommendations",
    reason: "Insight history includes shared Auth IDs and arbitrary metadata.",
  },
  {
    table: "insight_actions",
    category: "insights_and_recommendations",
    reason: "Insight action values and outcomes are free-form derived content.",
  },
  {
    table: "insight_notifications",
    category: "insights_and_recommendations",
    reason: "Insight notification delivery state is derived product data.",
  },
  {
    table: "organization_saas_customers",
    category: "saas_billing_and_provider_data",
    reason: "SaaS customer, provider account, and idempotency references are excluded.",
  },
  {
    table: "organization_saas_checkout_operations",
    category: "saas_billing_and_provider_data",
    reason: "Checkout operations contain provider references, leases, and idempotency data.",
  },
  {
    table: "organization_saas_trials",
    category: "saas_billing_and_provider_data",
    reason: "SaaS subscription trial records are outside academy operating data.",
  },
  {
    table: "organization_saas_subscriptions",
    category: "saas_billing_and_provider_data",
    reason: "SaaS subscription and provider references are excluded.",
  },
  {
    table: "organization_entitlements",
    category: "saas_billing_and_provider_data",
    reason: "Product entitlements and plan state are excluded from the academy data package.",
  },
  {
    table: "organization_entitlement_changes",
    category: "saas_billing_and_provider_data",
    reason: "Product entitlement history is excluded from the academy data package.",
  },
  {
    table: "organization_saas_webhook_events",
    category: "saas_billing_and_provider_data",
    reason: "Webhook records contain provider references and processing metadata.",
  },
  {
    table: "organization_saas_webhook_payload_conflicts",
    category: "saas_billing_and_provider_data",
    reason: "Webhook payload conflict records are excluded.",
  },
  {
    table: "organization_saas_webhook_reconciliation_decisions",
    category: "saas_billing_and_provider_data",
    reason: "Webhook reconciliation decisions contain provider references and evidence fingerprints.",
  },
  {
    table: "organization_saas_webhook_reconciliation_results",
    category: "saas_billing_and_provider_data",
    reason: "Webhook reconciliation results are internal billing control records.",
  },
  {
    table: "owner_signup_consent_policy",
    category: "identity_and_consent",
    reason: "Signup consent policy is associated with shared Auth identity, not an academy tenant.",
  },
  {
    table: "owner_signup_consents",
    category: "identity_and_consent",
    reason: "Signup consent records are associated with shared Auth identity, not an academy tenant.",
  },
  {
    table: "owner_signup_consent_audits",
    category: "identity_and_consent",
    reason: "Signup consent audit records are associated with shared Auth identity, not an academy tenant.",
  },
];

export const EXCLUDED_CANONICAL_SOURCES = [
  {
    source: "Supabase Auth identities and credentials",
    reason:
      "Auth accounts are shared across academy tenants; account credentials, sessions, and identity records are not included.",
  },
  {
    source: "Supabase Storage objects and metadata",
    reason:
      "Storage was not inventoried by this service. The package does not claim that files are absent or covered.",
  },
  {
    source: "Legacy public schema",
    reason:
      "The package is canonical zaltyko data only; legacy public tables are outside the approved scope.",
  },
];

/** These excluded tables expose counts only, always filtered by this tenant's organization_id. */
export const EXCLUDED_CANONICAL_SCOPED_TABLES = [
  "organization_bootstrap_commands",
  "organization_payment_provider_accounts",
  "family_payment_authorizations",
  "outbox_events",
  "audit_log",
  "owner_dashboard_layouts",
  "payment_provider_events",
  "payment_attempts",
  "metric_runs",
  "metric_run_values",
  "metric_values",
  "metric_event_consumptions",
  "metric_invalidations",
  "retention_cohort_projection_runs",
  "retention_cohort_projections",
  "data_quality_issues",
  "benchmark_profiles",
  "health_score_snapshots",
  "health_score_dimension_snapshots",
  "health_score_metric_contributions",
  "insight_rule_runs",
  "insights",
  "insight_run_observations",
  "insight_status_history",
  "insight_actions",
  "insight_notifications",
  "organization_saas_customers",
  "organization_saas_checkout_operations",
  "organization_saas_trials",
  "organization_saas_subscriptions",
  "organization_entitlements",
  "organization_entitlement_changes",
  "organization_saas_webhook_events",
  "organization_saas_webhook_reconciliation_decisions",
] as const;

/**
 * Internal super-admin market catalog in the public schema
 * (docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql).
 * Public information about software companies only: no academy, family,
 * minor or member data (only public.profiles references to the super-admin
 * who edited a record). Outside the zaltyko schema and the academy package;
 * no academy or athlete erasure touches it.
 */
export const INTERNAL_NON_CUSTOMER_TABLES = [
  "ci_competitors",
  "ci_sources",
  "ci_competitor_sections",
  "ci_flows",
  "ci_competitor_flows",
  "ci_pricing_plans",
  "ci_opportunities",
  "ci_change_events",
].map((table) => ({
  schema: "public" as const,
  table,
  category: "internal_market_catalog" as const,
  reason:
    "Internal super-admin catalog of public market information; it holds no academy, family, minor or member data, only references to the internal staff profile that edited it.",
}));

export const ALL_KNOWN_CANONICAL_TABLE_NAMES: readonly string[] = [
  ...CANONICAL_EXPORT_TABLES.map((table) => table.name),
  ...EXCLUDED_CANONICAL_TABLES.map((table) => table.table),
];

const duplicateNames = [
  ...ALL_KNOWN_CANONICAL_TABLE_NAMES,
  ...OPTIONAL_EXPORT_MODULE_GROUPS.flat().map((table) => table.table),
  ...OPTIONAL_INCLUDED_EXPORT_TABLES.map((table) => table.name),
].filter(
  (name, index, names) => names.indexOf(name) !== index
);
if (duplicateNames.length > 0) {
  throw new Error(`Duplicate canonical export table classification: ${duplicateNames.join(", ")}`);
}

if (
  EXCLUDED_CANONICAL_SCOPED_TABLES.some(
    (name) => !EXCLUDED_CANONICAL_TABLES.some((table) => table.table === name)
  )
) {
  throw new Error("Scoped canonical export count refers to an unclassified table");
}

if (
  new Set(EXCLUDED_CANONICAL_SCOPED_TABLES).size !==
  EXCLUDED_CANONICAL_SCOPED_TABLES.length
) {
  throw new Error("Duplicate scoped canonical export count classification");
}
