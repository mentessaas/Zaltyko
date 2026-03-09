// Simplified class report - returns mock data for now
// In production, implement proper queries based on actual schema

import { db } from "@/db";
import { classes, classEnrollments, classSessions, attendanceRecords } from "@/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

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
  // Get all classes for the academy
  const allClasses = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .where(eq(classes.academyId, filters.academyId));

  // Get enrollment counts per class
  const enrollmentCounts = await db
    .select({
      classId: classEnrollments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(eq(classes.academyId, filters.academyId))
    .groupBy(classEnrollments.classId);

  // Get session counts per class
  const sessionCounts = await db
    .select({
      classId: classSessions.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(eq(classes.academyId, filters.academyId))
    .groupBy(classSessions.classId);

  // Build the popular classes list
  const popularClasses: PopularClass[] = allClasses.map((cls) => {
    const enrollment = enrollmentCounts.find((e) => e.classId === cls.id);
    const session = sessionCounts.find((s) => s.classId === cls.id);

    return {
      classId: cls.id,
      className: cls.name || "Sin nombre",
      enrollments: enrollment?.count || 0,
      averageAttendance: 0,
      attendanceRate: 0,
    };
  }).sort((a, b) => b.enrollments - a.enrollments).slice(0, 10);

  return {
    totalClasses: allClasses.length,
    totalSessions: sessionCounts.reduce((sum, s) => sum + (s.count || 0), 0),
    totalEnrollments: enrollmentCounts.reduce((sum, e) => sum + e.count, 0),
    averageAttendance: 0,
    popularClasses,
  };
}
