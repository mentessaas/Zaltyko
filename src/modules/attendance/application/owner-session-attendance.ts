import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  attendanceRecords,
  athletes,
  enrollments,
  locations,
  memberLocationScopes,
  organizationMembers,
  people,
  sessionStaff,
  sessions,
  staffProfiles,
} from "@/db/zaltyko-schema";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const scopeSchema = z.object({
  userId: z.guid(),
  organizationId: z.guid(),
  locationId: z.guid(),
  sessionId: z.guid(),
});

const attendanceRoles = ["owner", "admin", "manager", "coach"] as const;

export type OwnerSessionAttendanceItem = {
  enrollmentId: string;
  athleteName: string;
  attendanceStatus: "present" | "absent" | "excused" | "late" | null;
};

/**
 * Resolves an authenticated member's access to one session. Unlike
 * resolveOwnerScope this permits coaches, but only for sessions assigned to
 * their active staff profile.
 */
export async function resolveSessionAttendanceAccess(command: {
  userId: string;
  organizationId: string;
  locationId: string;
  sessionId: string;
}): Promise<{
  memberId: string;
  role: (typeof attendanceRoles)[number];
  organizationId: string;
  locationId: string;
  sessionId: string;
  session: {
    locationId: string;
    classTemplateId: string;
    startsAt: Date;
    timezone: string;
  };
}> {
  const input = scopeSchema.parse(command);
  const [session] = await db
    .select({
      locationId: sessions.locationId,
      classTemplateId: sessions.classTemplateId,
      startsAt: sessions.startsAt,
      timezone: locations.timezone,
    })
    .from(sessions)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, sessions.organizationId),
        eq(locations.id, sessions.locationId)
      )
    )
    .where(
      and(
        eq(sessions.organizationId, input.organizationId),
        eq(sessions.id, input.sessionId),
        eq(sessions.locationId, input.locationId)
      )
    )
    .limit(1);

  if (!session) {
    throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
  }

  const [member] = await db
    .select({
      id: organizationMembers.id,
      role: organizationMembers.role,
      locationScopeMode: organizationMembers.locationScopeMode,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, input.organizationId),
        eq(organizationMembers.userId, input.userId),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);

  if (
    !member ||
    !attendanceRoles.includes(member.role as (typeof attendanceRoles)[number])
  ) {
    throw new OperationalError("FORBIDDEN", "Sin acceso a esta sesión", 403);
  }

  if (member.locationScopeMode !== "all") {
    const [locationScope] = await db
      .select({ id: memberLocationScopes.id })
      .from(memberLocationScopes)
      .where(
        and(
          eq(memberLocationScopes.organizationId, input.organizationId),
          eq(memberLocationScopes.memberId, member.id),
          eq(memberLocationScopes.locationId, input.locationId)
        )
      )
      .limit(1);
    if (!locationScope) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "El miembro no tiene acceso a esta sede",
        403
      );
    }
  }

  if (member.role === "coach") {
    const [assignment] = await db
      .select({ id: sessionStaff.id })
      .from(sessionStaff)
      .innerJoin(
        staffProfiles,
        and(
          eq(staffProfiles.organizationId, sessionStaff.organizationId),
          eq(staffProfiles.id, sessionStaff.staffProfileId),
          eq(staffProfiles.memberId, member.id),
          eq(staffProfiles.isActive, true)
        )
      )
      .where(
        and(
          eq(sessionStaff.organizationId, input.organizationId),
          eq(sessionStaff.sessionId, input.sessionId)
        )
      )
      .limit(1);
    if (!assignment) {
      throw new OperationalError(
        "FORBIDDEN",
        "El coach no está asignado a esta sesión",
        403
      );
    }
  }

  return {
    memberId: member.id,
    role: member.role as (typeof attendanceRoles)[number],
    organizationId: input.organizationId,
    locationId: input.locationId,
    sessionId: input.sessionId,
    session,
  };
}

/** Returns only the active roster and the current attendance status. */
export async function getOwnerSessionAttendance(input: {
  userId: string;
  organizationId: string;
  locationId: string;
  sessionId: string;
}): Promise<OwnerSessionAttendanceItem[]> {
  const access = await resolveSessionAttendanceAccess(input);
  return loadOwnerSessionAttendanceRoster(input, access);
}

/** Call with the session scope returned by resolveSessionAttendanceAccess. */
export async function loadOwnerSessionAttendanceRoster(
  input: {
    organizationId: string;
    locationId: string;
    sessionId: string;
  },
  access: {
    organizationId: string;
    locationId: string;
    sessionId: string;
    session: {
      locationId: string;
      classTemplateId: string;
      startsAt: Date;
      timezone: string;
    };
  }
): Promise<OwnerSessionAttendanceItem[]> {
  if (
    access.organizationId !== input.organizationId ||
    access.locationId !== input.locationId ||
    access.sessionId !== input.sessionId ||
    access.session.locationId !== input.locationId
  ) {
    throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
  }

  const effectiveDate = sql`(${access.session.startsAt} at time zone ${access.session.timezone})::date`;

  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      givenName: people.givenName,
      familyName: people.familyName,
      attendanceStatus: attendanceRecords.status,
    })
    .from(enrollments)
    .innerJoin(
      sessions,
      and(
        eq(sessions.organizationId, enrollments.organizationId),
        eq(sessions.locationId, enrollments.locationId),
        eq(sessions.classTemplateId, enrollments.classTemplateId),
        eq(sessions.id, input.sessionId),
        eq(sessions.locationId, input.locationId),
        eq(sessions.classTemplateId, access.session.classTemplateId)
      )
    )
    .innerJoin(
      athletes,
      and(
        eq(athletes.organizationId, enrollments.organizationId),
        eq(athletes.id, enrollments.athleteId),
        eq(athletes.isActive, true)
      )
    )
    .innerJoin(
      people,
      and(
        eq(people.organizationId, athletes.organizationId),
        eq(people.id, athletes.personId)
      )
    )
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.organizationId, enrollments.organizationId),
        eq(attendanceRecords.sessionId, input.sessionId),
        eq(attendanceRecords.enrollmentId, enrollments.id)
      )
    )
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.locationId, input.locationId),
        eq(enrollments.classTemplateId, access.session.classTemplateId),
        inArray(enrollments.status, ["active", "trial"]),
        lte(enrollments.startsOn, effectiveDate),
        or(isNull(enrollments.endsOn), gt(enrollments.endsOn, effectiveDate))
      )
    )
    .orderBy(people.familyName, people.givenName)
    .limit(MAX_CLASS_CAPACITY);

  return rows.map((row) => ({
    enrollmentId: row.enrollmentId,
    athleteName: `${row.givenName} ${row.familyName}`.trim(),
    attendanceStatus: row.attendanceStatus ?? null,
  }));
}
