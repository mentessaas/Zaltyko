import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, attendanceRecords, classSessions, classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyAttendanceWriteAccess } from "@/lib/attendance/service";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { formatDateToISOString } from "@/lib/date-utils";

const querySchema = z.object({ academyId: z.guid() });

/** Tope razonable de clases en un mismo día para una academia. */
const MAX_CLASSES_PER_DAY = 60;

/**
 * Lista de las sesiones de hoy para guardarla en el móvil y poder pasar lista
 * sin cobertura. Solo lo imprescindible de cada gimnasta: identificador,
 * nombre y grupo. Nada de fechas de nacimiento, salud, familia ni notas.
 */
export const GET = withTenant(async (request, context) => {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return handleApiError(parsed.error);
    if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);

    const { academyId } = parsed.data;

    const [academy] = await db
      .select({ id: academies.id, name: academies.name, country: academies.country })
      .from(academies)
      .where(and(eq(academies.id, academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const date = formatDateToISOString(new Date(), academy.country);

    const todaySessions = await db
      .select({
        id: classSessions.id,
        classId: classes.id,
        className: classes.name,
        startTime: classSessions.startTime,
        endTime: classSessions.endTime,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(
        and(
          eq(classes.academyId, academyId),
          eq(classes.tenantId, context.tenantId),
          eq(classSessions.tenantId, context.tenantId),
          eq(classSessions.sessionDate, date),
          isNull(classes.deletedAt)
        )
      )
      .orderBy(asc(classSessions.startTime))
      .limit(500);

    // Una entrenadora solo recibe las clases que tiene asignadas; la
    // dirección, todas. El mismo control que al guardar la asistencia.
    const classIds = Array.from(new Set(todaySessions.map((row) => row.classId))).slice(0, MAX_CLASSES_PER_DAY);
    const athletesByClass = new Map<string, Awaited<ReturnType<typeof getClassAthletes>>>();
    await Promise.all(
      classIds.map(async (classId) => {
        const scope = await verifyAttendanceWriteAccess({
          tenantId: context.tenantId!,
          academyId,
          classId,
          profile: context.profile,
        });
        if (!scope.allowed) return;
        athletesByClass.set(classId, await getClassAthletes(classId, academyId));
      })
    );

    const allowedSessions = todaySessions.filter((row) => athletesByClass.has(row.classId));
    const sessionIds = allowedSessions.map((row) => row.id);

    const records =
      sessionIds.length === 0
        ? []
        : await db
            .select({
              sessionId: attendanceRecords.sessionId,
              athleteId: attendanceRecords.athleteId,
              status: attendanceRecords.status,
              recordedAt: attendanceRecords.recordedAt,
            })
            .from(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.tenantId, context.tenantId),
                inArray(attendanceRecords.sessionId, sessionIds)
              )
            )
            .limit(10000);

    const marksBySession = new Map<string, Record<string, { status: string; recordedAt: string | null }>>();
    for (const record of records) {
      const marks = marksBySession.get(record.sessionId) ?? {};
      marks[record.athleteId] = {
        status: record.status,
        recordedAt: record.recordedAt ? new Date(record.recordedAt).toISOString() : null,
      };
      marksBySession.set(record.sessionId, marks);
    }

    const response = apiSuccess({
      academyId,
      academyName: academy.name ?? null,
      userId: context.userId,
      date,
      generatedAt: new Date().toISOString(),
      sessions: allowedSessions.map((row) => ({
        id: row.id,
        classId: row.classId,
        className: row.className ?? "Clase",
        startTime: row.startTime ?? null,
        endTime: row.endTime ?? null,
        athletes: (athletesByClass.get(row.classId) ?? []).map((athlete) => ({
          id: athlete.id,
          name: athlete.name,
          groupName: athlete.groupName,
        })),
        marks: marksBySession.get(row.id) ?? {},
      })),
    });
    // Datos de menores: que ningún intermediario los guarde.
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
});
