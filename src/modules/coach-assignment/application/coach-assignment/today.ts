import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import {
  coachDisplayName,
  normalizeStaffProfileIds,
  type SessionCoachSummary,
} from "@/modules/coach-assignment/domain/coach-assignment";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import type { OwnerTodaySessions } from "@/modules/owner-dashboard/application/today-sessions";

import { staffProfileIdsOfMember } from "./queries";
import { isCoachAssignmentStorageAvailable } from "./storage";

/**
 * Quién está en cada sesión de Hoy y si hay sustitución. Solo recibe ids de
 * sesiones que la página ya resolvió con el alcance de quien mira (Hoy en el
 * club o Hoy de la entrenadora): no amplía lo que se ve, solo lo completa.
 * Devuelve null si el candidato no está aplicado o la consulta falla, para que
 * Hoy se pinte igual que antes.
 */
export async function getSessionCoachSummaries(
  client: DatabaseClient,
  input: { organizationId: string; viewerMemberId: string; sessionIds: readonly string[] }
): Promise<Map<string, SessionCoachSummary> | null> {
  try {
    if (!(await isCoachAssignmentStorageAvailable(client))) return null;
    const summaries = new Map<string, SessionCoachSummary>();
    const sessionIds = normalizeStaffProfileIds(input.sessionIds);
    if (sessionIds.length === 0) return summaries;
    const viewerProfiles = new Set(
      await staffProfileIdsOfMember(client, input.organizationId, input.viewerMemberId)
    );
    const result = await client.execute(sql`
      select session.id::text as session_id,
        exists (
          select 1 from zaltyko.session_staff_overrides marker
          where marker.organization_id = session.organization_id
            and marker.session_id = session.id
        ) as substitution,
        staff.id::text as staff_profile_id,
        person.given_name, person.family_name, person.preferred_name
      from zaltyko.sessions session
      left join zaltyko.session_staff assignment
        on assignment.organization_id = session.organization_id
       and assignment.session_id = session.id
       and assignment.assignment_role = 'coach'
      left join zaltyko.staff_profiles staff
        on staff.organization_id = assignment.organization_id
       and staff.id = assignment.staff_profile_id
      left join zaltyko.people person
        on person.organization_id = staff.organization_id
       and person.id = staff.person_id
      where session.organization_id = ${input.organizationId}::uuid
        and session.id = any(${sqlUuidArray(sessionIds)})
      order by person.family_name, person.given_name, staff.id
    `);
    for (const row of result.rows as Array<{
      session_id: string;
      substitution: boolean;
      staff_profile_id: string | null;
      given_name: string | null;
      family_name: string | null;
      preferred_name: string | null;
    }>) {
      const summary = summaries.get(row.session_id) ?? {
        coachNames: [],
        substitution: row.substitution === true,
        assignedToViewer: false,
      };
      if (row.staff_profile_id && row.given_name && row.family_name) {
        summary.coachNames.push(
          coachDisplayName({ givenName: row.given_name, familyName: row.family_name, preferredName: row.preferred_name })
        );
        if (viewerProfiles.has(row.staff_profile_id)) summary.assignedToViewer = true;
      }
      summaries.set(row.session_id, summary);
    }
    const byName = (left: string, right: string) => left.localeCompare(right, "es", { sensitivity: "base" });
    for (const summary of summaries.values()) summary.coachNames.sort(byName);
    return summaries;
  } catch (error) {
    logger.error("Session coach summaries failed", error);
    return null;
  }
}

/**
 * Completa Hoy (en el club o de la entrenadora) con las entrenadoras de cada
 * sesión. Si no hay datos, devuelve Hoy tal cual.
 */
export async function withSessionCoaches(
  client: DatabaseClient,
  today: OwnerTodaySessions | null,
  input: { organizationId: string; viewerMemberId: string }
): Promise<OwnerTodaySessions | null> {
  if (!today || today.sessions.length === 0) return today;
  const summaries = await getSessionCoachSummaries(client, {
    organizationId: input.organizationId,
    viewerMemberId: input.viewerMemberId,
    sessionIds: today.sessions.map((session) => session.id),
  });
  if (!summaries) return today;
  return {
    ...today,
    sessions: today.sessions.map((session) => ({
      ...session,
      ...(summaries.get(session.id.toLowerCase()) ?? { coachNames: [], substitution: false, assignedToViewer: false }),
    })),
  };
}
