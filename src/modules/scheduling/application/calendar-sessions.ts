import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { getSessionCoachSummaries } from "@/modules/coach-assignment/application/coach-assignment-service";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import type { CalendarRange } from "@/modules/scheduling/domain/calendar";

/** Tope de sesiones por consulta: un mes de un club grande cabe de sobra. */
export const ownerCalendarSessionLimit = 600;
const groupOptionsLimit = 300;

export interface OwnerCalendarSession {
  id: string;
  status: "scheduled" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationId: string;
  locationName: string;
  classTemplateId: string;
  className: string;
  programName: string | null;
  groups: Array<{ id: string; name: string }>;
  capacity: number;
  /** Inscritas activas o de prueba ese día (la misma regla que Pasar lista). */
  expectedAthletes: number;
  recordedAttendance: number;
  /** Solo con el candidato de titulares aplicado. */
  coachNames?: string[];
  substitution?: boolean;
}

export interface OwnerCalendarData {
  range: CalendarRange;
  sessions: OwnerCalendarSession[];
  truncated: boolean;
  /** Sedes del alcance de quien mira (para el filtro y la zona horaria). */
  locations: Array<{ id: string; name: string; timezone: string }>;
  /** Grupos de esas sedes (para el filtro). */
  groups: Array<{ id: string; name: string; locationId: string }>;
  /** Falso si las entrenadoras no se pudieron leer (candidato sin aplicar o fallo). */
  coachesAvailable: boolean;
}

const fallbackTimeZone = "Europe/Madrid";

/**
 * Sesiones cuyo día local (en la zona horaria de su sede) cae en el rango,
 * limitadas a las sedes del alcance ya resuelto: el propietario ve todas las
 * suyas y quien tenga alcance por sedes, solo esas. Con `locationId` se
 * restringe a una sola sede (que `resolveOwnerScope` ya validó).
 */
export async function getOwnerCalendar(input: {
  scope: OwnerScope;
  from: string;
  to: string;
  locationId?: string | null;
  groupId?: string | null;
}): Promise<OwnerCalendarData> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const range: CalendarRange = { from: input.from, to: input.to };
  const allowedLocations = scope.locations.map((location) => ({
    id: location.id,
    name: location.name,
    timezone: location.timezone || fallbackTimeZone,
  }));
  const locationIds = input.locationId
    ? allowedLocations.filter((location) => location.id === input.locationId).map((location) => location.id)
    : allowedLocations.map((location) => location.id);
  if (locationIds.length === 0) {
    return { range, sessions: [], truncated: false, locations: allowedLocations, groups: [], coachesAvailable: false };
  }

  const [sessionResult, groupResult] = await Promise.all([
    db.execute(sql`
      with scoped_locations as (
        select l.id, l.name, l.timezone
        from zaltyko.locations l
        where l.organization_id = ${organizationId}::uuid
          and l.id = any(${sqlUuidArray(locationIds)})
      )
      select
        s.id,
        s.status::text as status,
        to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as starts_at,
        to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ends_at,
        l.timezone,
        l.id as location_id,
        l.name as location_name,
        ct.id as class_template_id,
        ct.name as class_name,
        p.name as program_name,
        coalesce(s.capacity_override, ct.capacity)::int as capacity,
        coalesce((
          select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name, g.id)
          from zaltyko.class_template_groups ctg
          join zaltyko.groups g
            on g.organization_id = ctg.organization_id
           and g.id = ctg.group_id
          where ctg.organization_id = s.organization_id
            and ctg.class_template_id = s.class_template_id
        ), '[]'::jsonb) as groups,
        (
          select count(*)
          from zaltyko.enrollments e
          join zaltyko.athletes athlete
            on athlete.organization_id = e.organization_id
           and athlete.id = e.athlete_id
           and athlete.is_active
          where e.organization_id = s.organization_id
            and e.location_id = s.location_id
            and e.class_template_id = s.class_template_id
            and e.status in ('active', 'trial')
            and e.starts_on <= (s.starts_at at time zone l.timezone)::date
            and (e.ends_on is null or e.ends_on > (s.starts_at at time zone l.timezone)::date)
        )::int as expected_athletes,
        (
          select count(*)
          from zaltyko.attendance_records a
          where a.organization_id = s.organization_id
            and a.session_id = s.id
        )::int as recorded_attendance
      from zaltyko.sessions s
      join scoped_locations l on l.id = s.location_id
      join zaltyko.class_templates ct
        on ct.organization_id = s.organization_id
       and ct.id = s.class_template_id
      left join zaltyko.programs p
        on p.organization_id = ct.organization_id
       and p.id = ct.program_id
      where s.organization_id = ${organizationId}::uuid
        -- Cota gruesa sobre el índice; el día local exacto se decide abajo.
        and s.starts_at >= ${input.from}::date::timestamptz - interval '2 days'
        and s.starts_at < ${input.to}::date::timestamptz + interval '3 days'
        and (s.starts_at at time zone l.timezone)::date between ${input.from}::date and ${input.to}::date
        ${
          input.groupId
            ? sql`and exists (
                select 1 from zaltyko.class_template_groups filter_group
                where filter_group.organization_id = s.organization_id
                  and filter_group.class_template_id = s.class_template_id
                  and filter_group.group_id = ${input.groupId}::uuid
              )`
            : sql``
        }
      order by s.starts_at asc, s.id asc
      limit ${ownerCalendarSessionLimit + 1}
    `),
    db.execute(sql`
      select g.id, g.name, g.location_id
      from zaltyko.groups g
      where g.organization_id = ${organizationId}::uuid
        and g.location_id = any(${sqlUuidArray(allowedLocations.map((location) => location.id))})
      order by g.name asc, g.id asc
      limit ${groupOptionsLimit}
    `),
  ]);

  const rows = sessionResult.rows as Array<{
    id: string;
    status: OwnerCalendarSession["status"];
    starts_at: string;
    ends_at: string;
    timezone: string;
    location_id: string;
    location_name: string;
    class_template_id: string;
    class_name: string;
    program_name: string | null;
    capacity: number;
    groups: Array<{ id: string; name: string }>;
    expected_athletes: number;
    recorded_attendance: number;
  }>;
  const truncated = rows.length > ownerCalendarSessionLimit;
  const visible = rows.slice(0, ownerCalendarSessionLimit);

  const sessions: OwnerCalendarSession[] = visible.map((row) => ({
    id: row.id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    locationId: row.location_id,
    locationName: row.location_name,
    classTemplateId: row.class_template_id,
    className: row.class_name,
    programName: row.program_name,
    groups: Array.isArray(row.groups) ? row.groups : [],
    capacity: Number(row.capacity),
    expectedAthletes: Number(row.expected_athletes),
    recordedAttendance: Number(row.recorded_attendance),
  }));

  // Entrenadoras y sustituciones: solo completa lo que ya se ve; si el
  // candidato no está aplicado o la lectura falla, el calendario se pinta igual.
  let coachesAvailable = false;
  if (sessions.length > 0) {
    try {
      const summaries = await getSessionCoachSummaries(db, {
        organizationId,
        viewerMemberId: scope.member.id,
        sessionIds: sessions.map((session) => session.id),
      });
      if (summaries) {
        coachesAvailable = true;
        for (const session of sessions) {
          const summary = summaries.get(session.id.toLowerCase());
          session.coachNames = summary?.coachNames ?? [];
          session.substitution = summary?.substitution ?? false;
        }
      }
    } catch (error) {
      logger.error("Calendar coach summaries failed", error);
    }
  }

  return {
    range,
    sessions,
    truncated,
    locations: allowedLocations,
    groups: (groupResult.rows as Array<{ id: string; name: string; location_id: string }>).map(
      (row) => ({ id: row.id, name: row.name, locationId: row.location_id })
    ),
    coachesAvailable,
  };
}
