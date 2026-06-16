import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  classes,
  classEnrollments,
  classGroups,
  classSessions,
  groupAthletes,
} from "@/db/schema";

export interface AthleteMetrics {
  classesCount: number;
  upcomingSessionsCount: number;
}

export async function getAthleteMetrics(args: {
  athleteId: string;
  academyId: string;
  groupId?: string | null;
}): Promise<AthleteMetrics> {
  const classIdSet = new Set<string>();

  const effectiveGroupIds = new Set<string>();
  if (args.groupId) {
    effectiveGroupIds.add(args.groupId);
  }

  const extraGroups = await db
    .select({ groupId: groupAthletes.groupId })
    .from(groupAthletes)
    .where(eq(groupAthletes.athleteId, args.athleteId));

  extraGroups.forEach((row) => {
    if (row.groupId) {
      effectiveGroupIds.add(row.groupId);
    }
  });

  const groupIds = Array.from(effectiveGroupIds);

  if (groupIds.length > 0) {
    const groupLinkedClasses = await db
      .select({ classId: classes.id })
      .from(classes)
      .leftJoin(classGroups, eq(classGroups.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, args.academyId),
          or(
            inArray(classes.groupId, groupIds),
            inArray(classGroups.groupId, groupIds)
          )
        )
      );

    groupLinkedClasses.forEach((row) => classIdSet.add(row.classId));
  }

  const enrollmentRows = await db
    .select({ classId: classEnrollments.classId })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.athleteId, args.athleteId),
        eq(classEnrollments.academyId, args.academyId)
      )
    );

  enrollmentRows.forEach((row) => classIdSet.add(row.classId));

  const classIds = Array.from(classIdSet);
  if (classIds.length === 0) {
    return {
      classesCount: 0,
      upcomingSessionsCount: 0,
    };
  }

  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysIso = thirtyDaysFromNow.toISOString().split("T")[0];

  const upcomingSessions = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(
        inArray(classSessions.classId, classIds),
        eq(classSessions.status, "scheduled"),
        gte(classSessions.sessionDate, todayIso),
        lt(classSessions.sessionDate, thirtyDaysIso)
      )
    );

  return {
    classesCount: classIds.length,
    upcomingSessionsCount: upcomingSessions.length,
  };
}
