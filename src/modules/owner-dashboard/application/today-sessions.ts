import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

export const ownerTodaySessionsLimit = 25;

export interface OwnerTodaySession {
  id: string;
  status: "scheduled" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationId: string;
  locationName: string;
  className: string;
  programName: string | null;
  capacity: number;
  expectedAthletes: number;
  recordedAttendance: number;
  /**
   * O1, solo cuando el candidato de titulares está aplicado (lo rellena
   * coach-assignment-service.withSessionCoaches): quién entrena, si hay
   * sustitución y si la sesión es de quien mira.
   */
  coachNames?: string[];
  substitution?: boolean;
  assignedToViewer?: boolean;
}

export interface OwnerTodaySessions {
  sessions: OwnerTodaySession[];
  truncated: boolean;
}

/**
 * Sessions whose local start date (per location timezone) is today, limited to
 * the locations the already-resolved owner scope allows. "Expected" mirrors the
 * attendance roster rule: active athletes with active or trial enrollments at
 * the same location that started on or before the session date and end
 * strictly after it.
 */
export async function getOwnerTodaySessions(input: {
  scope: OwnerScope;
  locationId?: string | null;
}): Promise<OwnerTodaySessions> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const locationIds =
    scope.canViewOrganizationAggregate && !input.locationId
      ? scope.locations.map((location) => location.id)
      : [scope.selectedLocationId ?? scope.locations[0]?.id ?? ""].filter(Boolean);
  if (locationIds.length === 0) return { sessions: [], truncated: false };

  const result = await db.execute(sql`
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
      ct.name as class_name,
      p.name as program_name,
      coalesce(s.capacity_override, ct.capacity)::int as capacity,
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
      and s.starts_at >= now() - interval '2 days'
      and s.starts_at < now() + interval '2 days'
      and (s.starts_at at time zone l.timezone)::date = (now() at time zone l.timezone)::date
    order by s.starts_at asc, s.id asc
    limit ${ownerTodaySessionsLimit + 1}
  `);

  const rows = result.rows as Array<{
    id: string;
    status: OwnerTodaySession["status"];
    starts_at: string;
    ends_at: string;
    timezone: string;
    location_id: string;
    location_name: string;
    class_name: string;
    program_name: string | null;
    capacity: number;
    expected_athletes: number;
    recorded_attendance: number;
  }>;

  return {
    truncated: rows.length > ownerTodaySessionsLimit,
    sessions: rows.slice(0, ownerTodaySessionsLimit).map((row) => ({
      id: row.id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      locationId: row.location_id,
      locationName: row.location_name,
      className: row.class_name,
      programName: row.program_name,
      capacity: Number(row.capacity),
      expectedAthletes: Number(row.expected_athletes),
      recordedAttendance: Number(row.recorded_attendance),
    })),
  };
}
