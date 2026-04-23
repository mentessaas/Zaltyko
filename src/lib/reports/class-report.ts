import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  classes,
  classEnrollments,
  classSessions,
  groupAthletes,
} from "@/db/schema";

export interface ClassReportFilters {
  academyId: string;
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  groupId?: string;
}

export interface PopularClass {
  classId: string;
  className: string;
  enrollments: number;
  averageAttendance: number;
  attendanceRate: number;
}

export interface ClassStats {
  totalClasses: number;
  totalSessions: number;
  totalEnrollments: number;
  averageAttendance: number;
  popularClasses: PopularClass[];
}

export async function calculateClassReport(filters: ClassReportFilters): Promise<ClassStats> {
  const classWhere = [
    eq(classes.academyId, filters.academyId),
    filters.tenantId ? eq(classes.tenantId, filters.tenantId) : undefined,
    filters.classId ? eq(classes.id, filters.classId) : undefined,
    filters.groupId ? eq(classes.groupId, filters.groupId) : undefined,
    isNull(classes.deletedAt),
  ].filter(Boolean);

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
      groupId: classes.groupId,
    })
    .from(classes)
    .where(and(...classWhere));

  if (classRows.length === 0) {
    return {
      totalClasses: 0,
      totalSessions: 0,
      totalEnrollments: 0,
      averageAttendance: 0,
      popularClasses: [],
    };
  }

  const classIds = classRows.map((item) => item.id);
  const groupIds = classRows.map((item) => item.groupId).filter((value): value is string => Boolean(value));

  const [enrollmentRows, groupMemberships, sessionRows] = await Promise.all([
    db
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
      ),
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
    db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
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
      ),
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

  const membershipsByGroup = new Map<string, Set<string>>();
  groupMemberships.forEach((membership) => {
    const set = membershipsByGroup.get(membership.groupId) ?? new Set<string>();
    set.add(membership.athleteId);
    membershipsByGroup.set(membership.groupId, set);
  });

  const enrollmentsByClass = new Map<string, Set<string>>();
  classRows.forEach((classRow) => {
    const set = new Set<string>();
    if (classRow.groupId) {
      const groupSet = membershipsByGroup.get(classRow.groupId);
      groupSet?.forEach((athleteId) => set.add(athleteId));
    }
    enrollmentsByClass.set(classRow.id, set);
  });

  enrollmentRows.forEach((row) => {
    const set = enrollmentsByClass.get(row.classId) ?? new Set<string>();
    set.add(row.athleteId);
    enrollmentsByClass.set(row.classId, set);
  });

  const sessionsByClass = new Map<string, string[]>();
  sessionRows.forEach((row) => {
    const list = sessionsByClass.get(row.classId) ?? [];
    list.push(row.id);
    sessionsByClass.set(row.classId, list);
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

  const popularClasses: PopularClass[] = classRows
    .map((classRow) => {
      const enrollmentCount = enrollmentsByClass.get(classRow.id)?.size ?? 0;
      const sessionList = sessionsByClass.get(classRow.id) ?? [];

      let attendanceTotal = 0;
      let attendancePresent = 0;
      sessionList.forEach((sessionId) => {
        const stats = attendanceBySession.get(sessionId);
        if (!stats) return;
        attendanceTotal += stats.total;
        attendancePresent += stats.present;
      });

      const attendanceRate =
        attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;
      const averageAttendance =
        sessionList.length > 0 ? Math.round(attendanceTotal / sessionList.length) : 0;

      return {
        classId: classRow.id,
        className: classRow.name || "Sin nombre",
        enrollments: enrollmentCount,
        averageAttendance,
        attendanceRate,
      };
    })
    .sort((left, right) => {
      if (right.enrollments !== left.enrollments) {
        return right.enrollments - left.enrollments;
      }
      return right.attendanceRate - left.attendanceRate;
    })
    .slice(0, 10);

  const attendanceRates = popularClasses
    .map((item) => item.attendanceRate)
    .filter((value) => value > 0);

  return {
    totalClasses: classRows.length,
    totalSessions: sessionRows.length,
    totalEnrollments: Array.from(enrollmentsByClass.values()).reduce(
      (sum, set) => sum + set.size,
      0
    ),
    averageAttendance:
      attendanceRates.length > 0
        ? Number(
            (
              attendanceRates.reduce((sum, value) => sum + value, 0) /
              attendanceRates.length
            ).toFixed(1)
          )
        : 0,
    popularClasses,
  };
}
