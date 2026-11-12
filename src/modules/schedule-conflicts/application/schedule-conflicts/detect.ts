import { sql, type SQL } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import {
  MAX_CONFLICTS,
  TRAVEL_BUFFER_MINUTES,
  coachConflictKind,
  orderedPair,
  sortConflicts,
  spaceConflictKind,
  type ConflictSession,
  type ScheduleConflict,
} from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { SESSION_HORIZON_TARGET_DAYS } from "@/modules/scheduling/domain/session-horizon";

/**
 * Detección de choques sobre tablas ya aplicadas: zaltyko.sessions,
 * session_staff, spaces, class_templates y locations. Solo lee.
 *
 * Acotada siempre:
 * - a la academia (organization_id en cada tabla y en cada unión);
 * - a las sesiones no canceladas que aún no han terminado, empezadas como
 *   mucho hace un día (no se recorre el histórico) y que empiezan antes de
 *   ahora + `horizonDays` (por defecto, hasta donde se generan);
 * - a las sedes indicadas, si las hay: las dos sesiones de un choque tienen que
 *   estar en ellas (quien solo ve unas sedes no ve choques con otras);
 * - a MAX_CONFLICTS + 1 parejas.
 * Usa los índices existentes: sessions_location_start_idx
 * (organization_id, location_id, starts_at) y session_staff_uq
 * (organization_id, session_id, staff_profile_id).
 */
export type ConflictFilter = {
  organizationId: string;
  /** Sedes visibles; null = todas las de la academia. */
  locationIds?: readonly string[] | null;
  /** Solo choques de estas fichas de equipo (entrenadoras). */
  staffProfileIds?: readonly string[] | null;
  /** Solo choques en los que participe alguna de estas sesiones. */
  involvingSessionIds?: readonly string[] | null;
  /**
   * Qué tipos calcular. Por defecto solo entrenadora: la pista va tras
   * SPACE_CONFLICT_WARNINGS_ENABLED (apagado) y hay que pedirla explícitamente.
   */
  include?: { coach?: boolean; space?: boolean };
  /** Días hacia delante; por defecto CONFLICT_HORIZON_DAYS (horizonte completo). */
  horizonDays?: number;
  /**
   * Se llama justo antes de cada consulta. Las páginas lo usan para no
   * consultar si la carga ya se abandonó y para fijar statement_timeout al
   * presupuesto que queda.
   */
  beforeQuery?: () => Promise<void>;
};

export const CONFLICT_HORIZON_DAYS = SESSION_HORIZON_TARGET_DAYS + 1;

type PairRow = {
  subject_id: string;
  subject_name: string;
  a_id: string;
  a_template: string;
  a_class: string;
  a_location: string;
  a_location_name: string;
  a_timezone: string;
  a_starts: string;
  a_ends: string;
  a_status: ConflictSession["status"];
  b_id: string;
  b_template: string;
  b_class: string;
  b_location: string;
  b_location_name: string;
  b_timezone: string;
  b_starts: string;
  b_ends: string;
  b_status: ConflictSession["status"];
};

const isoUtc = (column: SQL) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

function windowSessions(filter: ConflictFilter): SQL {
  const locations = filter.locationIds ? [...filter.locationIds] : null;
  return sql`
    select session.organization_id, session.id, session.class_template_id, session.location_id,
      session.starts_at, session.ends_at, session.status::text as status,
      coalesce(session.space_id, template.default_space_id) as space_id,
      template.name as class_name, location.name as location_name, location.timezone
    from zaltyko.sessions session
    join zaltyko.class_templates template
      on template.organization_id = session.organization_id
     and template.id = session.class_template_id
    join zaltyko.locations location
      on location.organization_id = session.organization_id
     and location.id = session.location_id
    where session.organization_id = ${filter.organizationId}::uuid
      and session.status <> 'cancelled'
      and session.ends_at > now()
      and session.starts_at > now() - interval '1 day'
      and session.starts_at <= now() + make_interval(days => ${filter.horizonDays ?? CONFLICT_HORIZON_DAYS}::int)
      ${locations ? sql`and session.location_id = any(${sqlUuidArray(locations)})` : sql``}
  `;
}

function pairColumns(): SQL {
  return sql`
    a.id::text as a_id, a.class_template_id::text as a_template, a.class_name as a_class,
    a.location_id::text as a_location, a.location_name as a_location_name, a.timezone as a_timezone,
    ${isoUtc(sql`a.starts_at`)} as a_starts, ${isoUtc(sql`a.ends_at`)} as a_ends, a.status as a_status,
    b.id::text as b_id, b.class_template_id::text as b_template, b.class_name as b_class,
    b.location_id::text as b_location, b.location_name as b_location_name, b.timezone as b_timezone,
    ${isoUtc(sql`b.starts_at`)} as b_starts, ${isoUtc(sql`b.ends_at`)} as b_ends, b.status as b_status
  `;
}

function involving(filter: ConflictFilter): SQL {
  const ids = filter.involvingSessionIds ? [...filter.involvingSessionIds] : null;
  if (!ids) return sql``;
  return sql`and (a.id = any(${sqlUuidArray(ids)}) or b.id = any(${sqlUuidArray(ids)}))`;
}

function toSession(row: PairRow, side: "a" | "b"): ConflictSession {
  const get = (field: string) => (row as unknown as Record<string, string>)[`${side}_${field}`]!;
  return {
    sessionId: get("id"),
    classTemplateId: get("template"),
    className: get("class"),
    locationId: get("location"),
    locationName: get("location_name"),
    timezone: get("timezone"),
    startsAt: get("starts"),
    endsAt: get("ends"),
    status: get("status") as ConflictSession["status"],
  };
}

async function coachPairs(client: DatabaseClient, filter: ConflictFilter): Promise<PairRow[]> {
  const staff = filter.staffProfileIds ? [...filter.staffProfileIds] : null;
  if (staff && staff.length === 0) return [];
  await filter.beforeQuery?.();
  const result = await client.execute(sql`
    with window_sessions as (${windowSessions(filter)}),
    assigned as (
      select assignment.staff_profile_id, window_sessions.*
      from zaltyko.session_staff assignment
      join window_sessions
        on window_sessions.organization_id = assignment.organization_id
       and window_sessions.id = assignment.session_id
      where assignment.organization_id = ${filter.organizationId}::uuid
        and assignment.assignment_role = 'coach'
        ${staff ? sql`and assignment.staff_profile_id = any(${sqlUuidArray(staff)})` : sql``}
    )
    select a.staff_profile_id::text as subject_id,
      coalesce(nullif(btrim(person.preferred_name), '') || ' ' || person.family_name,
               person.given_name || ' ' || person.family_name) as subject_name,
      ${pairColumns()}
    from assigned a
    join assigned b
      on b.staff_profile_id = a.staff_profile_id
     and a.id < b.id
     -- Exactamente las reglas del dominio (coachConflictKind), para que el
     -- LIMIT no se llene de parejas que luego no son choque: o se solapan (en
     -- cualquier sede) o están en sedes distintas sin margen para desplazarse.
     and (
       (a.starts_at < b.ends_at and b.starts_at < a.ends_at)
       or (
         a.location_id <> b.location_id
         and a.starts_at < b.ends_at + make_interval(mins => ${TRAVEL_BUFFER_MINUTES}::int)
         and b.starts_at < a.ends_at + make_interval(mins => ${TRAVEL_BUFFER_MINUTES}::int)
       )
     )
    join zaltyko.staff_profiles staff
      on staff.organization_id = ${filter.organizationId}::uuid
     and staff.id = a.staff_profile_id
    join zaltyko.people person
      on person.organization_id = staff.organization_id
     and person.id = staff.person_id
    where true ${involving(filter)}
    order by a.starts_at, a.id, b.id
    limit ${MAX_CONFLICTS + 1}
  `);
  return result.rows as unknown as PairRow[];
}

async function spacePairs(client: DatabaseClient, filter: ConflictFilter): Promise<PairRow[]> {
  await filter.beforeQuery?.();
  const result = await client.execute(sql`
    with window_sessions as (${windowSessions(filter)})
    select a.space_id::text as subject_id, space.name as subject_name,
      ${pairColumns()}
    from window_sessions a
    join window_sessions b
      on b.space_id = a.space_id
     and b.location_id = a.location_id
     and a.id < b.id
     and a.starts_at < b.ends_at
     and b.starts_at < a.ends_at
    join zaltyko.spaces space
      on space.organization_id = ${filter.organizationId}::uuid
     and space.id = a.space_id
    where a.space_id is not null ${involving(filter)}
    order by a.starts_at, a.id, b.id
    limit ${MAX_CONFLICTS + 1}
  `);
  return result.rows as unknown as PairRow[];
}

/**
 * Choques entre sesiones del horizonte. La consulta preselecciona parejas y el
 * dominio decide (mismas reglas que las pruebas unitarias). Devuelve como
 * mucho MAX_CONFLICTS y si hay más.
 */
export async function findScheduleConflicts(
  client: DatabaseClient,
  filter: ConflictFilter
): Promise<{ conflicts: ScheduleConflict[]; truncated: boolean }> {
  const include = { coach: true, space: false, ...filter.include };
  const conflicts: ScheduleConflict[] = [];
  if (include.coach) {
    const rows = await coachPairs(client, filter);
    for (const row of rows) {
      const [first, second] = orderedPair(toSession(row, "a"), toSession(row, "b"));
      const kind = coachConflictKind(first, second);
      if (kind) conflicts.push({ kind, subjectId: row.subject_id, subjectName: row.subject_name, first, second });
    }
  }
  if (include.space) {
    const rows = await spacePairs(client, filter);
    for (const row of rows) {
      const [first, second] = orderedPair(toSession(row, "a"), toSession(row, "b"));
      const kind = spaceConflictKind(first, second);
      if (kind) conflicts.push({ kind, subjectId: row.subject_id, subjectName: row.subject_name, first, second });
    }
  }
  // Cada consulta pide MAX_CONFLICTS + 1 parejas que ya son choque, así que
  // «hay más» se sabe después de filtrar.
  const sorted = sortConflicts(conflicts);
  return { conflicts: sorted.slice(0, MAX_CONFLICTS), truncated: sorted.length > MAX_CONFLICTS };
}
