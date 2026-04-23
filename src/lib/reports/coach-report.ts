import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  classCoachAssignments,
  classEnrollments,
  classes,
  classSessions,
  coaches,
  groupAthletes,
  groups,
} from "@/db/schema";

export interface CoachReportFilters {
  academyId: string;
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  coachId?: string;
}

export interface CoachPerformance {
  coachId: string;
  coachName: string;
  classesCount: number;
  athletesCount: number;
  averageAttendance: number;
  sessionsConducted: number;
  technicalFocuses: string[];
  apparatus: string[];
}

export interface CoachStats {
  totalCoaches: number;
  activeCoaches: number;
  totalClasses: number;
  averageAttendance: number;
  coachPerformance: CoachPerformance[];
}

export async function calculateCoachReport(filters: CoachReportFilters): Promise<CoachStats> {
  const coachWhere = [
    eq(coaches.academyId, filters.academyId),
    filters.tenantId ? eq(coaches.tenantId, filters.tenantId) : undefined,
    filters.coachId ? eq(coaches.id, filters.coachId) : undefined,
  ].filter(Boolean);

  const allCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
    })
    .from(coaches)
    .where(and(...coachWhere));

  if (allCoaches.length === 0) {
    return {
      totalCoaches: 0,
      activeCoaches: 0,
      totalClasses: 0,
      averageAttendance: 0,
      coachPerformance: [],
    };
  }

  const classWhere = [
    eq(classes.academyId, filters.academyId),
    filters.tenantId ? eq(classes.tenantId, filters.tenantId) : undefined,
    isNull(classes.deletedAt),
  ].filter(Boolean);

  const [allClasses, allGroups, totalClassesResult] = await Promise.all([
    db
      .select({
        id: classes.id,
        name: classes.name,
        groupId: classes.groupId,
        technicalFocus: classes.technicalFocus,
        apparatus: classes.apparatus,
      })
      .from(classes)
      .where(and(...classWhere)),
    db
      .select({
        id: groups.id,
        coachId: groups.coachId,
        technicalFocus: groups.technicalFocus,
        apparatus: groups.apparatus,
        sessionBlocks: groups.sessionBlocks,
      })
      .from(groups)
      .where(
        and(
          eq(groups.academyId, filters.academyId),
          filters.tenantId ? eq(groups.tenantId, filters.tenantId) : undefined,
          isNull(groups.deletedAt)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(classes)
      .where(and(...classWhere)),
  ]);

  const classIds = allClasses.map((item) => item.id);
  const groupIds = allGroups.map((item) => item.id);

  const [assignments, groupMemberships, classEnrollmentRows, sessionRows] = await Promise.all([
    classIds.length > 0
      ? db
          .select({
            classId: classCoachAssignments.classId,
            coachId: classCoachAssignments.coachId,
          })
          .from(classCoachAssignments)
          .where(
            and(
              inArray(classCoachAssignments.classId, classIds),
              filters.tenantId ? eq(classCoachAssignments.tenantId, filters.tenantId) : undefined
            )
          )
      : Promise.resolve([]),
    groupIds.length > 0
      ? db
          .select({
            groupId: groupAthletes.groupId,
            athleteId: groupAthletes.athleteId,
          })
          .from(groupAthletes)
          .where(
            and(
              inArray(groupAthletes.groupId, groupIds),
              filters.tenantId ? eq(groupAthletes.tenantId, filters.tenantId) : undefined
            )
          )
      : Promise.resolve([]),
    classIds.length > 0
      ? db
          .select({
            classId: classEnrollments.classId,
            athleteId: classEnrollments.athleteId,
          })
          .from(classEnrollments)
          .where(
            and(
              inArray(classEnrollments.classId, classIds),
              eq(classEnrollments.academyId, filters.academyId),
              filters.tenantId ? eq(classEnrollments.tenantId, filters.tenantId) : undefined
            )
          )
      : Promise.resolve([]),
    classIds.length > 0
      ? db
          .select({
            id: classSessions.id,
            classId: classSessions.classId,
            coachId: classSessions.coachId,
          })
          .from(classSessions)
          .where(
            and(
              inArray(classSessions.classId, classIds),
              filters.tenantId ? eq(classSessions.tenantId, filters.tenantId) : undefined,
              filters.startDate
                ? gte(classSessions.sessionDate, filters.startDate.toISOString().slice(0, 10))
                : undefined,
              filters.endDate
                ? lte(classSessions.sessionDate, filters.endDate.toISOString().slice(0, 10))
                : undefined
            )
          )
      : Promise.resolve([]),
  ]);

  const sessionIds = sessionRows.map((item) => item.id);
  const attendanceRows =
    sessionIds.length > 0
      ? await db
          .select({
            sessionId: attendanceRecords.sessionId,
            status: attendanceRecords.status,
          })
          .from(attendanceRecords)
          .where(
            and(
              inArray(attendanceRecords.sessionId, sessionIds),
              filters.tenantId ? eq(attendanceRecords.tenantId, filters.tenantId) : undefined
            )
          )
      : [];

  const groupMap = new Map(allGroups.map((group) => [group.id, group]));
  const classesByCoach = new Map<string, Set<string>>();
  const athletesByCoach = new Map<string, Set<string>>();
  const sessionsByCoach = new Map<string, Set<string>>();
  const focusByCoach = new Map<string, Map<string, number>>();
  const apparatusByCoach = new Map<string, Map<string, number>>();

  const ensureSet = (map: Map<string, Set<string>>, key: string) => {
    let value = map.get(key);
    if (!value) {
      value = new Set<string>();
      map.set(key, value);
    }
    return value;
  };

  const ensureCounter = (map: Map<string, Map<string, number>>, key: string) => {
    let value = map.get(key);
    if (!value) {
      value = new Map<string, number>();
      map.set(key, value);
    }
    return value;
  };

  const recordTechnicalContext = (coachId: string, classId: string) => {
    const classRow = allClasses.find((item) => item.id === classId);
    if (!classRow) return;

    const focusCounter = ensureCounter(focusByCoach, coachId);
    if (classRow.technicalFocus?.trim()) {
      focusCounter.set(
        classRow.technicalFocus,
        (focusCounter.get(classRow.technicalFocus) ?? 0) + 1
      );
    }

    const apparatusCounter = ensureCounter(apparatusByCoach, coachId);
    (classRow.apparatus ?? []).forEach((item) => {
      apparatusCounter.set(item, (apparatusCounter.get(item) ?? 0) + 1);
    });

    if (classRow.groupId) {
      const group = groupMap.get(classRow.groupId);
      if (group?.technicalFocus?.trim()) {
        focusCounter.set(
          group.technicalFocus,
          (focusCounter.get(group.technicalFocus) ?? 0) + 1
        );
      }
      (group?.apparatus ?? []).forEach((item) => {
        apparatusCounter.set(item, (apparatusCounter.get(item) ?? 0) + 1);
      });
    }
  };

  allClasses.forEach((classRow) => {
    const group = classRow.groupId ? groupMap.get(classRow.groupId) : null;
    if (group?.coachId) {
      ensureSet(classesByCoach, group.coachId).add(classRow.id);
      recordTechnicalContext(group.coachId, classRow.id);
    }
  });

  assignments.forEach((assignment) => {
    ensureSet(classesByCoach, assignment.coachId).add(assignment.classId);
    recordTechnicalContext(assignment.coachId, assignment.classId);
  });

  const coachedGroupsByCoach = new Map<string, Set<string>>();
  allGroups.forEach((group) => {
    if (!group.coachId) return;
    ensureSet(coachedGroupsByCoach, group.coachId).add(group.id);
  });

  groupMemberships.forEach((membership) => {
    coachedGroupsByCoach.forEach((groupSet, coachId) => {
      if (groupSet.has(membership.groupId)) {
        ensureSet(athletesByCoach, coachId).add(membership.athleteId);
      }
    });
  });

  classEnrollmentRows.forEach((enrollment) => {
    classesByCoach.forEach((classSet, coachId) => {
      if (classSet.has(enrollment.classId)) {
        ensureSet(athletesByCoach, coachId).add(enrollment.athleteId);
      }
    });
  });

  sessionRows.forEach((session) => {
    if (session.coachId) {
      ensureSet(sessionsByCoach, session.coachId).add(session.id);
    } else {
      classesByCoach.forEach((classSet, coachId) => {
        if (classSet.has(session.classId)) {
          ensureSet(sessionsByCoach, coachId).add(session.id);
        }
      });
    }
  });

  const attendanceBySession = new Map<string, { total: number; present: number }>();
  attendanceRows.forEach((row) => {
    const current = attendanceBySession.get(row.sessionId) ?? { total: 0, present: 0 };
    current.total += 1;
    if (row.status === "present") {
      current.present += 1;
    }
    attendanceBySession.set(row.sessionId, current);
  });

  const coachPerformance: CoachPerformance[] = allCoaches
    .map((coach) => {
      const classSet = classesByCoach.get(coach.id) ?? new Set<string>();
      const athleteSet = athletesByCoach.get(coach.id) ?? new Set<string>();
      const sessionSet = sessionsByCoach.get(coach.id) ?? new Set<string>();

      let attendanceTotal = 0;
      let attendancePresent = 0;
      sessionSet.forEach((sessionId) => {
        const stats = attendanceBySession.get(sessionId);
        if (!stats) return;
        attendanceTotal += stats.total;
        attendancePresent += stats.present;
      });

      const averageAttendance =
        attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

      const technicalFocuses = topEntries(focusByCoach.get(coach.id), 3);
      const apparatus = topEntries(apparatusByCoach.get(coach.id), 3);

      return {
        coachId: coach.id,
        coachName: coach.name || "Sin nombre",
        classesCount: classSet.size,
        athletesCount: athleteSet.size,
        averageAttendance,
        sessionsConducted: sessionSet.size,
        technicalFocuses,
        apparatus,
      };
    })
    .sort((left, right) => {
      if (right.sessionsConducted !== left.sessionsConducted) {
        return right.sessionsConducted - left.sessionsConducted;
      }
      return right.classesCount - left.classesCount;
    });

  const activeCoaches = coachPerformance.filter(
    (coach) => coach.sessionsConducted > 0 || coach.classesCount > 0
  ).length;
  const attendanceAverages = coachPerformance
    .map((coach) => coach.averageAttendance)
    .filter((value) => value > 0);

  return {
    totalCoaches: allCoaches.length,
    activeCoaches,
    totalClasses: totalClassesResult[0]?.count || 0,
    averageAttendance:
      attendanceAverages.length > 0
        ? Number(
            (
              attendanceAverages.reduce((sum, value) => sum + value, 0) /
              attendanceAverages.length
            ).toFixed(1)
          )
        : 0,
    coachPerformance,
  };
}

function topEntries(counter: Map<string, number> | undefined, limit: number) {
  if (!counter) return [];

  return Array.from(counter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value]) => value);
}
