import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

/** Días sin ninguna asistencia para decir que una gimnasta «lleva sin venir». */
export const INACTIVE_ATHLETE_DAYS = 14;
/** Filas que enseña la pantalla «Gimnastas sin venir». */
export const INACTIVE_ATHLETES_LIST_LIMIT = 200;

/**
 * Regla única de «gimnastas sin venir», compartida por el número del resumen y por
 * la lista a la que enlaza: inscripción activa con al menos 14 días de antigüedad en
 * las sedes dadas, cuya clase ha tenido sesiones con lista en los últimos 14 días, y
 * sin ninguna asistencia (presente o con retraso) en ese tiempo.
 */
function inactiveAthleteIds(input: { organizationId: string; locationIds: string[]; now: Date; today: string }): SQL {
  const at = input.now.toISOString();
  return sql`
    select distinct e.athlete_id
    from zaltyko.enrollments e
    join zaltyko.athletes athlete
      on athlete.organization_id = e.organization_id
     and athlete.id = e.athlete_id
     and athlete.is_active
    where e.organization_id = ${input.organizationId}::uuid
      and e.location_id = any(${sqlUuidArray(input.locationIds)})
      and e.status = 'active'
      and e.starts_on <= ${input.today}::date - ${INACTIVE_ATHLETE_DAYS}::int
      and (e.ends_on is null or e.ends_on > ${input.today}::date)
      and exists (
        select 1
        from zaltyko.sessions s
        where s.organization_id = e.organization_id
          and s.class_template_id = e.class_template_id
          and s.status <> 'cancelled'
          and s.starts_at >= ${at}::timestamptz - make_interval(days => ${INACTIVE_ATHLETE_DAYS})
          and s.starts_at < ${at}::timestamptz
          and exists (
            select 1 from zaltyko.attendance_records r
            where r.organization_id = s.organization_id and r.session_id = s.id
          )
      )
      and not exists (
        select 1
        from zaltyko.attendance_records p
        where p.organization_id = e.organization_id
          and p.athlete_id = e.athlete_id
          and p.status in ('present', 'late')
          and p.recorded_at >= ${at}::timestamptz - make_interval(days => ${INACTIVE_ATHLETE_DAYS})
      )`;
}

export async function countInactiveAthletes(input: {
  organizationId: string;
  locationIds: string[];
  now: Date;
  today: string;
}): Promise<number> {
  if (input.locationIds.length === 0) return 0;
  const result = await db.execute(sql`select count(*)::int as count from (${inactiveAthleteIds(input)}) inactive`);
  return Number((result.rows[0] as { count?: number | string } | undefined)?.count ?? 0);
}

export interface InactiveAthleteRow {
  athleteId: string;
  displayName: string;
  /** Última vez que figuró presente o con retraso («AAAA-MM-DD»), o null si nunca. */
  lastPresentOn: string | null;
}

export async function listInactiveAthletes(input: {
  organizationId: string;
  locationIds: string[];
  now: Date;
  today: string;
  limit?: number;
}): Promise<{ rows: InactiveAthleteRow[]; total: number }> {
  if (input.locationIds.length === 0) return { rows: [], total: 0 };
  const limit = Math.min(Math.max(input.limit ?? INACTIVE_ATHLETES_LIST_LIMIT, 1), 500);
  const result = await db.execute(sql`
    with inactive as (${inactiveAthleteIds(input)})
    select
      ath.id as athlete_id,
      person.given_name,
      person.family_name,
      to_char((
        select max(r.recorded_at) at time zone 'UTC'
        from zaltyko.attendance_records r
        where r.organization_id = ath.organization_id
          and r.athlete_id = ath.id
          and r.status in ('present', 'late')
      ), 'YYYY-MM-DD') as last_present_on,
      (select count(*) from inactive)::int as total
    from inactive
    join zaltyko.athletes ath
      on ath.organization_id = ${input.organizationId}::uuid and ath.id = inactive.athlete_id
    join zaltyko.people person
      on person.organization_id = ath.organization_id and person.id = ath.person_id
    order by person.family_name, person.given_name, ath.id
    limit ${limit}::int
  `);
  const rows = result.rows as unknown as Array<{
    athlete_id: string;
    given_name: string;
    family_name: string;
    last_present_on: string | null;
    total: number;
  }>;
  return {
    rows: rows.map((row) => ({
      athleteId: row.athlete_id,
      displayName: `${row.given_name} ${row.family_name}`.trim(),
      lastPresentOn: row.last_present_on,
    })),
    total: Number(rows[0]?.total ?? 0),
  };
}
