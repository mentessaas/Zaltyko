import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { athletes, attendanceRecords, classSessions, classes } from "@/db/schema";
import { verifyCoachAthleteScope } from "@/lib/permissions";
import type { ProfileRow } from "@/lib/authz";

export interface AttendanceSnapshot {
  sessionDate: string | Date;
  status: string;
}

export type ScopedAthleteResult =
  | {
      status: "ok";
      athlete: { id: string; groupId: string | null; dob: string | Date | null };
    }
  | { status: "not_found" }
  | { status: "forbidden"; reason?: string };

export type ScopedAttendanceResult =
  | {
      status: "ok";
      athlete: { id: string; groupId: string | null; dob: string | Date | null };
      records: AttendanceSnapshot[];
    }
  | { status: "not_found" }
  | { status: "forbidden"; reason?: string };

/**
 * Loads an athlete's attendance only after checking tenant, academy and the
 * coach's assignment. AI endpoints must call this helper instead of trusting
 * history or names posted by the browser.
 */
export async function getScopedAthlete({
  tenantId,
  academyId,
  athleteId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  athleteId: string;
  profile: Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;
}): Promise<ScopedAthleteResult> {
  const [athlete] = await db
    .select({ id: athletes.id, groupId: athletes.groupId, dob: athletes.dob })
    .from(athletes)
    .where(
      and(
        eq(athletes.id, athleteId),
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        isNull(athletes.deletedAt),
      ),
    )
    .limit(1);

  if (!athlete) return { status: "not_found" };

  const scope = await verifyCoachAthleteScope({
    tenantId,
    academyId,
    athleteId,
    athleteGroupId: athlete.groupId,
    profile,
  });
  if (!scope.allowed) return { status: "forbidden", reason: scope.reason };

  return { status: "ok", athlete };
}

export async function getScopedAttendanceSnapshot({
  tenantId,
  academyId,
  athleteId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  athleteId: string;
  profile: Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;
}): Promise<ScopedAttendanceResult> {
  const athleteResult = await getScopedAthlete({ tenantId, academyId, athleteId, profile });
  if (athleteResult.status !== "ok") return athleteResult;
  const { athlete } = athleteResult;

  const records = await db
    .select({
      sessionDate: classSessions.sessionDate,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .innerJoin(classes, eq(classSessions.classId, classes.id))
    .where(
      and(
        eq(attendanceRecords.tenantId, tenantId),
        eq(attendanceRecords.athleteId, athleteId),
        eq(classSessions.tenantId, tenantId),
        eq(classes.tenantId, tenantId),
        eq(classes.academyId, academyId),
        isNull(classes.deletedAt),
      ),
    )
    .orderBy(desc(classSessions.sessionDate))
    .limit(100);

  return { status: "ok", athlete, records };
}
