import {
  OPTIONAL_INCLUDED_EXPORT_MODULES,
  type CanonicalExportTableSpec,
  type OptionalIncludedExportModule,
} from "@/modules/data-rights/application/catalog";

/**
 * Filas sintéticas de las funciones activadas el 12-11-2026, con las columnas
 * en el orden exacto de la proyección exportada (como las devuelve el SELECT).
 */
const TIMESTAMP = "2026-11-12 10:00:00.123456+00";
const id = (n: number) => `a0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const ACTIVATED_IDS = {
  athlete: id(1),
  location: id(2),
  member: id(3),
  objective: id(4),
  session: id(5),
  classTemplate: id(6),
  staffProfile: id(7),
  plan: id(8),
  link: id(9),
  guardian: id(10),
  notice: id(11),
} as const;

const VALUES: Record<string, Record<string, unknown>> = {
  athlete_objectives: {
    id: ACTIVATED_IDS.objective, title: "Synthetic objective", discipline: "gaf", apparatus: "beam",
    target_date: "2026-12-01", status: "in_progress", revision: 1,
  },
  athlete_objective_status_history: { id: id(20), objective_id: ACTIVATED_IDS.objective, revision: 1, from_status: null, to_status: "in_progress" },
  athlete_observations: {
    id: id(21), body: "Synthetic observation", visibility: "team", observed_on: "2026-11-12",
    session_id: null, objective_id: ACTIVATED_IDS.objective, revision: 1,
  },
  class_template_staff: { id: id(22), staff_profile_id: ACTIVATED_IDS.staffProfile, assigned_by_member_id: null },
  session_staff_overrides: { id: id(23), reason: "absence" },
  session_plans: { id: ACTIVATED_IDS.plan, focus: "Synthetic focus", note: null, from_template_revision: null, revision: 1 },
  session_plan_blocks: {
    id: id(24), plan_id: ACTIVATED_IDS.plan, position: 1, kind: "warmup", discipline: "gaf", apparatus: "floor",
    content: "Synthetic block", duration_minutes: 10, done_at: null, done_by_member_id: null,
  },
  session_plan_objectives: { plan_id: ACTIVATED_IDS.plan, objective_id: ACTIVATED_IDS.objective },
  class_plan_templates: {
    id: id(25), focus: null, note: "Synthetic template note", revision: 2,
    // Orden de claves de jsonb (longitud y bytes), como lo devuelve PostgreSQL.
    blocks: [
      { kind: "warmup", content: "Synthetic warm-up", apparatus: null, discipline: null, durationMinutes: 15 },
      { kind: "technique", content: "Synthetic beam", apparatus: "beam", discipline: "gaf", durationMinutes: null },
    ],
  },
  // Niveles y progresión (candidato 20261114121000, aún sin aplicar en ningún entorno).
  skill_templates: {
    id: id(30), discipline: "artistic_female", name: "Synthetic template", description: null,
    source: "blank", starter_key: null, revision: 1,
  },
  skill_levels: { id: id(31), template_id: id(30), position: 1, name: "Synthetic level", description: null },
  skill_elements: {
    id: id(32), template_id: id(30), level_id: id(31), position: 1, apparatus: "beam",
    name: "Synthetic element", description: null, is_required: true,
  },
  athlete_skill_progress: {
    id: id(33), template_id: id(30), element_id: id(32), status: "achieved", achieved_on: "2026-11-12", revision: 1,
  },
  athlete_level_passes: { id: id(34), template_id: id(30), level_id: id(31), passed_on: "2026-11-12" },
  admission_links: { id: ACTIVATED_IDS.link, enabled: true, revoked_at: null },
  admission_requests: {
    id: id(26), link_id: ACTIVATED_IDS.link, status: "new", contact_name: "Synthetic family",
    contact_email: "family@example.invalid", contact_phone: null, athlete_given_name: "Synthetic",
    athlete_birth_year: 2016, message: null, privacy_consent_version: "2026-11-10",
    converted_athlete_id: null, waitlist_entry_id: null, handled_by_member_id: null,
    handled_at: null, anonymized_at: null, revision: 1,
  },
  guardian_access_invitations: {
    id: id(27), guardian_id: ACTIVATED_IDS.guardian, normalized_email: "family@example.invalid", status: "accepted",
    grant_view_athletes: true, revision: 2, last_sent_at: null, revoked_by_member_id: null, revoked_at: null,
  },
  family_notices: {
    id: ACTIVATED_IDS.notice, kind: "session_cancelled", class_template_id: ACTIVATED_IDS.classTemplate, group_id: null,
    title: "Sesión cancelada: Base", body: "Se cancela la sesión.",
  },
  family_notice_recipients: { id: id(28), notice_id: ACTIVATED_IDS.notice, guardian_id: ACTIVATED_IDS.guardian, email_status: "sent", email_attempts: 1, read_at: null },
  guardian_notification_preferences: { guardian_id: ACTIVATED_IDS.guardian, email_session_changes: true, email_manual_notices: false },
};

function defaultValue(column: string, organizationId: string): unknown {
  if (column === "organization_id") return organizationId;
  if (column === "athlete_id") return ACTIVATED_IDS.athlete;
  if (column === "location_id") return ACTIVATED_IDS.location;
  if (column === "session_id") return ACTIVATED_IDS.session;
  if (column === "class_template_id") return ACTIVATED_IDS.classTemplate;
  if (column.endsWith("member_id")) return ACTIVATED_IDS.member;
  if (column.endsWith("_at")) return TIMESTAMP;
  throw new Error(`No synthetic value for ${column}`);
}

export function activatedRow(table: CanonicalExportTableSpec, organizationId: string): Record<string, unknown> {
  const values = VALUES[table.name] ?? {};
  return Object.fromEntries(table.exportColumns.map((column) => [
    column,
    Object.prototype.hasOwnProperty.call(values, column) ? values[column] : defaultValue(column, organizationId),
  ]));
}

export function activatedRowsByTable(
  organizationId: string,
  modules: readonly OptionalIncludedExportModule[] = OPTIONAL_INCLUDED_EXPORT_MODULES
): Record<string, Array<Record<string, unknown>>> {
  return Object.fromEntries(modules.flatMap((module) => module.tables.map((table) => [table.name, [activatedRow(table, organizationId)]])));
}

/** information_schema rows for installed modules (all SQL columns, omitted ones included). */
export function activatedCatalogRows(
  modules: readonly OptionalIncludedExportModule[] = OPTIONAL_INCLUDED_EXPORT_MODULES
) {
  return modules.flatMap((module) => module.tables.flatMap((table) => table.expectedColumns.map((column_name) => ({
    table_name: table.name,
    column_name,
    data_type: ["target_date", "observed_on", "achieved_on", "passed_on"].includes(column_name) ? "date" : "text",
  }))));
}
