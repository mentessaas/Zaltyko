import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";

/** Tope de sesiones de un mismo día que se guardan en el móvil. */
export const OWNER_TODAY_ATTENDANCE_SESSION_LIMIT = 60;

/** Tope de filas de gimnastas del conjunto (todas las sesiones de hoy). */
const ROSTER_ROW_LIMIT = 10_000;

type Status = "present" | "absent" | "late" | "excused";

/**
 * Lista de hoy para guardar en el móvil: la misma forma que
 * `TodayPayload` de `src/lib/offline-attendance`. En el modelo de /owner la
 * «gimnasta» de cada fila es su inscripción (`enrollmentId`), porque es lo
 * que se marca. Solo lo imprescindible: identificador, nombre y grupo.
 * Nunca fecha de nacimiento, salud, familia ni notas.
 */
export interface OwnerTodayAttendance {
  source: "owner";
  academyId: string;
  academyName: string | null;
  userId: string;
  date: string;
  generatedAt: string;
  sessions: Array<{
    id: string;
    classId: string;
    className: string;
    startTime: string | null;
    endTime: string | null;
    athletes: Array<{ id: string; name: string; groupName: string | null }>;
    marks: Record<string, { status: Status; recordedAt: string | null }>;
  }>;
}

function localDate(now: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Sesiones de hoy (día local de cada sede) con las gimnastas inscritas y lo
 * ya marcado, para las sedes que el rol de la persona puede ver:
 *  - dirección y administración, las de su alcance (todas, o las asignadas);
 *  - entrenadora, solo las sedes que tiene asignadas (como pasar lista).
 * Las sesiones canceladas no se guardan: no admiten asistencia.
 * Solo lee las sedes del `scope` recibido: no resuelve permisos por su cuenta.
 */
export async function getOwnerTodayAttendance(input: {
  userId: string;
  /** Alcance ya resuelto de la persona (la ruta lo pide con resolveOwnerScope). */
  scope: OwnerScope;
  now?: Date;
}): Promise<OwnerTodayAttendance> {
  const { scope } = input;
  const now = input.now ?? new Date();
  const organizationId = scope.organization.id;
  const locationIds = scope.locations.map((location) => location.id);

  const base: OwnerTodayAttendance = {
    source: "owner",
    academyId: organizationId,
    academyName: scope.organization.name ?? null,
    userId: input.userId,
    date: localDate(
      now,
      scope.locations.find((l) => l.id === scope.selectedLocationId)?.timezone ??
        scope.locations[0]?.timezone
    ),
    generatedAt: now.toISOString(),
    sessions: [],
  };
  if (locationIds.length === 0) return base;

  const sessionRows = (
    await db.execute(sql`
      select
        s.id,
        ct.id as class_id,
        ct.name as class_name,
        to_char(s.starts_at at time zone l.timezone, 'HH24:MI') as start_time,
        to_char(s.ends_at at time zone l.timezone, 'HH24:MI') as end_time
      from zaltyko.sessions s
      join zaltyko.locations l
        on l.organization_id = s.organization_id
       and l.id = s.location_id
      join zaltyko.class_templates ct
        on ct.organization_id = s.organization_id
       and ct.id = s.class_template_id
      where s.organization_id = ${organizationId}::uuid
        and s.location_id = any(${sqlUuidArray(locationIds)})
        and s.status::text <> 'cancelled'
        and s.starts_at >= ${now.toISOString()}::timestamptz - interval '2 days'
        and s.starts_at < ${now.toISOString()}::timestamptz + interval '2 days'
        and (s.starts_at at time zone l.timezone)::date
            = (${now.toISOString()}::timestamptz at time zone l.timezone)::date
      order by s.starts_at asc, s.id asc
      limit ${OWNER_TODAY_ATTENDANCE_SESSION_LIMIT}
    `)
  ).rows as Array<{
    id: string;
    class_id: string;
    class_name: string;
    start_time: string | null;
    end_time: string | null;
  }>;
  if (sessionRows.length === 0) return base;

  const rosterRows = (
    await db.execute(sql`
      select
        s.id as session_id,
        e.id as enrollment_id,
        p.given_name,
        p.family_name,
        ar.status::text as status,
        ar.recorded_at
      from zaltyko.sessions s
      join zaltyko.locations l
        on l.organization_id = s.organization_id
       and l.id = s.location_id
      join zaltyko.enrollments e
        on e.organization_id = s.organization_id
       and e.location_id = s.location_id
       and e.class_template_id = s.class_template_id
       and e.status in ('active', 'trial')
       and e.starts_on <= (s.starts_at at time zone l.timezone)::date
       and (e.ends_on is null or e.ends_on > (s.starts_at at time zone l.timezone)::date)
      join zaltyko.athletes a
        on a.organization_id = e.organization_id
       and a.id = e.athlete_id
       and a.is_active
      join zaltyko.people p
        on p.organization_id = a.organization_id
       and p.id = a.person_id
      left join zaltyko.attendance_records ar
        on ar.organization_id = e.organization_id
       and ar.session_id = s.id
       and ar.enrollment_id = e.id
      where s.organization_id = ${organizationId}::uuid
        and s.id = any(${sqlUuidArray(sessionRows.map((row) => row.id))})
      order by s.starts_at asc, s.id asc, p.family_name asc, p.given_name asc, e.id asc
      limit ${ROSTER_ROW_LIMIT}
    `)
  ).rows as Array<{
    session_id: string;
    enrollment_id: string;
    given_name: string;
    family_name: string;
    status: string | null;
    recorded_at: Date | string | null;
  }>;

  const bySession = new Map<string, OwnerTodayAttendance["sessions"][number]>();
  for (const row of sessionRows) {
    bySession.set(row.id, {
      id: row.id,
      classId: row.class_id,
      className: row.class_name,
      startTime: row.start_time,
      endTime: row.end_time,
      athletes: [],
      marks: {},
    });
  }
  for (const row of rosterRows) {
    const session = bySession.get(row.session_id);
    if (!session || session.athletes.length >= MAX_CLASS_CAPACITY) continue;
    session.athletes.push({
      id: row.enrollment_id,
      name: `${row.given_name} ${row.family_name}`.trim(),
      groupName: null,
    });
    if (
      row.status === "present" ||
      row.status === "absent" ||
      row.status === "late" ||
      row.status === "excused"
    ) {
      const recorded = row.recorded_at ? new Date(row.recorded_at) : null;
      session.marks[row.enrollment_id] = {
        status: row.status,
        recordedAt:
          recorded && !Number.isNaN(recorded.getTime())
            ? recorded.toISOString()
            : null,
      };
    }
  }

  return { ...base, sessions: [...bySession.values()] };
}
