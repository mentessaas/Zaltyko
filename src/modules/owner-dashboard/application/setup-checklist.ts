import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import type { OwnerSetupProgress } from "@/modules/owner-dashboard/application/setup-checklist-steps";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

export const emptyOwnerSetupProgress: OwnerSetupProgress = {
  activeLocations: 0,
  hasScheduledClass: false,
  hasAthletes: false,
  hasEnrolledAthletes: false,
  hasAttendance: false,
};

/**
 * Read-only facts behind the "Puesta en marcha" checklist, derived from the
 * canonical model for the already-authorized owner scope (and selected site).
 * Nothing is persisted: each step is done as soon as the real data exists.
 * - Site: active locations within scope.
 * - Class: an active class template with at least one weekly time slot.
 * - Athletes: an active athlete with an active or trial enrollment at a scoped
 *   location (the attendance roster is built from enrollments).
 *   `hasAthletes` (organization-wide, athletes are not per-site) only chooses
 *   which screen the pending step links to.
 * - Attendance: at least one attendance record at a scoped location.
 */
export async function getOwnerSetupProgress(input: {
  scope: OwnerScope;
  locationId?: string | null;
}): Promise<OwnerSetupProgress> {
  const { scope } = input;
  const organizationId = scope.organization.id;
  const locationIds =
    scope.canViewOrganizationAggregate && !input.locationId
      ? scope.locations.map((location) => location.id)
      : [scope.selectedLocationId ?? scope.locations[0]?.id ?? ""].filter(Boolean);
  if (locationIds.length === 0) return { ...emptyOwnerSetupProgress };

  const result = await db.execute(sql`
    with scoped_locations as (
      select l.id, l.is_active
      from zaltyko.locations l
      where l.organization_id = ${organizationId}::uuid
        and l.id = any(${sqlUuidArray(locationIds)})
    )
    select
      (select count(*) from scoped_locations where is_active)::int as active_locations,
      exists (
        select 1
        from zaltyko.class_templates ct
        join scoped_locations l on l.id = ct.location_id
        where ct.organization_id = ${organizationId}::uuid
          and ct.status = 'active'
          and exists (
            select 1
            from zaltyko.class_template_weekdays w
            where w.organization_id = ct.organization_id
              and w.class_template_id = ct.id
          )
      ) as has_scheduled_class,
      exists (
        select 1
        from zaltyko.athletes athlete
        where athlete.organization_id = ${organizationId}::uuid
          and athlete.is_active
      ) as has_athletes,
      exists (
        select 1
        from zaltyko.enrollments e
        join scoped_locations l on l.id = e.location_id
        join zaltyko.athletes athlete
          on athlete.organization_id = e.organization_id
         and athlete.id = e.athlete_id
         and athlete.is_active
        where e.organization_id = ${organizationId}::uuid
          and e.status in ('active', 'trial')
      ) as has_enrolled_athletes,
      exists (
        select 1
        from zaltyko.attendance_records a
        join scoped_locations l on l.id = a.location_id
        where a.organization_id = ${organizationId}::uuid
      ) as has_attendance
  `);

  const row = result.rows[0] as
    | {
        active_locations: number | string;
        has_scheduled_class: boolean;
        has_athletes: boolean;
        has_enrolled_athletes: boolean;
        has_attendance: boolean;
      }
    | undefined;
  if (!row) throw new Error("Owner setup progress returned no row");

  return {
    activeLocations: Number(row.active_locations),
    hasScheduledClass: row.has_scheduled_class === true,
    hasAthletes: row.has_athletes === true,
    hasEnrolledAthletes: row.has_enrolled_athletes === true,
    hasAttendance: row.has_attendance === true,
  };
}
