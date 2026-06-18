import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  attendanceRecords,
  classGroups,
  classSessions,
  classes as classesTable,
  groupAthletes,
  groups,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const GET = withTenant(async (_request, context) => {
  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  try {
    const access = await verifyAcademyAccessForProfile({
      academyId,
      tenantId: context.tenantId,
      profile: context.profile,
    });
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "Access denied", 403);
    }

    const classesData = await db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        weekday: classesTable.weekday,
        startTime: classesTable.startTime,
        endTime: classesTable.endTime,
        groupId: classesTable.groupId,
        groupLevel: groups.level,
      })
      .from(classesTable)
      .leftJoin(groups, eq(classesTable.groupId, groups.id))
      .where(and(eq(classesTable.academyId, academyId), eq(classesTable.tenantId, context.tenantId)));

    const classesWithCounts = await Promise.all(
      classesData.map(async (cls) => {
        const classGroupRows = await db
          .select({ groupId: classGroups.groupId })
          .from(classGroups)
          .where(and(eq(classGroups.classId, cls.id), eq(classGroups.tenantId, context.tenantId)));

        const groupIds = classGroupRows.length > 0
          ? classGroupRows.map((group) => group.groupId)
          : cls.groupId
            ? [cls.groupId]
            : [];

        let totalEnrollments = 0;
        if (groupIds.length > 0) {
          const [athleteCounts] = await db
            .select({ count: count() })
            .from(groupAthletes)
            .where(and(eq(groupAthletes.tenantId, context.tenantId), inArray(groupAthletes.groupId, groupIds)));
          totalEnrollments = Number(athleteCounts?.count ?? 0);
        }

        const [attendanceTotal] = await db
          .select({ count: count() })
          .from(attendanceRecords)
          .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
          .where(and(eq(classSessions.classId, cls.id), eq(attendanceRecords.tenantId, context.tenantId)));

        const [attendancePresent] = await db
          .select({ count: count() })
          .from(attendanceRecords)
          .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
          .where(
            and(
              eq(classSessions.classId, cls.id),
              eq(attendanceRecords.tenantId, context.tenantId),
              eq(attendanceRecords.status, "present")
            )
          );

        const totalAttendance = Number(attendanceTotal?.count ?? 0);
        const averageAttendance = totalAttendance > 0
          ? Math.round((Number(attendancePresent?.count ?? 0) / totalAttendance) * 1000) / 10
          : 0;

        const weekday = cls.weekday !== null ? WEEKDAYS[cls.weekday] : "Sin horario";
        const time = cls.startTime && cls.endTime
          ? `${cls.startTime.slice(0, 5)} - ${cls.endTime.slice(0, 5)}`
          : "Por definir";

        return {
          id: cls.id,
          name: cls.name || "Clase sin nombre",
          level: cls.groupLevel || "general",
          schedule: `${weekday} ${time}`,
          totalEnrollments,
          averageAttendance,
          avgAge: 0,
        };
      })
    );

    return apiSuccess({
      classes: classesWithCounts.sort((a, b) => b.totalEnrollments - a.totalEnrollments),
    });
  } catch (error) {
    logger.error("Error loading popular classes:", error);
    return apiError("POPULAR_CLASSES_FAILED", "Error al cargar clases populares", 500);
  }
});
