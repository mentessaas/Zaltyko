import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendanceRecords, classSessions, classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { verifyAttendanceWriteAccess } from "@/lib/attendance/service";
import { markAcademyActivationIfReady } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";

const entrySchema = z.object({
  athleteId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]).optional(),
  notes: z.string().optional(),
});

const upsertBodySchema = z.object({
  sessionId: z.string().uuid(),
  entries: z.array(entrySchema).min(1).max(500).superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.athleteId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "athleteId"], message: "Atleta repetido en la misma solicitud" });
      }
      seen.add(entry.athleteId);
    });
  }),
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = upsertBodySchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    const [sessionRow] = await db
      .select({
        id: classSessions.id,
        classId: classSessions.classId,
        sessionSportConfigId: classSessions.sportConfigId,
        classSportConfigId: classes.sportConfigId,
        academyId: classes.academyId,
      })
      .from(classSessions)
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(and(eq(classSessions.id, body.sessionId), eq(classSessions.tenantId, context.tenantId)))
      .limit(1);

    if (!sessionRow) {
      return apiError("SESSION_NOT_FOUND", "Sesión no encontrada", 404);
    }

    const classScope = await verifyAttendanceWriteAccess({
      tenantId: context.tenantId,
      academyId: sessionRow.academyId,
      classId: sessionRow.classId,
      profile: context.profile,
    });

    if (!classScope.allowed) {
      return apiError(
        classScope.reason ?? "CLASS_ACCESS_DENIED",
        "No tienes permiso para registrar asistencia en esta clase",
        403
      );
    }

    const classAthletes = await getClassAthletes(sessionRow.classId, sessionRow.academyId);
    const athleteMap = new Map(classAthletes.map((athlete) => [athlete.id, athlete]));
    const effectiveSportConfigId = sessionRow.sessionSportConfigId ?? sessionRow.classSportConfigId ?? null;

    for (const entry of body.entries) {
      const athlete = athleteMap.get(entry.athleteId);
      if (!athlete) {
        return apiError(
          "ATHLETE_NOT_IN_CLASS",
          "Uno o más atletas no pertenecen a esta clase o sesión",
          400,
          { athleteId: entry.athleteId }
        );
      }

      const athleteSportConfigId = athlete.primarySportConfigId ?? athlete.groupSportConfigId ?? null;
      if (effectiveSportConfigId && athleteSportConfigId && athleteSportConfigId !== effectiveSportConfigId) {
        return apiError(
          "ATHLETE_SPORT_CONFIG_MISMATCH",
          "Uno o más atletas pertenecen a otra modalidad/rama",
          400,
          { athleteId: entry.athleteId }
        );
      }
    }

    const now = new Date();

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      for (const entry of body.entries) {
        const status = entry.status ?? "present";
        const notes = entry.notes ?? null;

        await tx
          .insert(attendanceRecords)
          .values({
            id: crypto.randomUUID(),
            tenantId: context.tenantId,
            sessionId: body.sessionId,
            athleteId: entry.athleteId,
            status,
            notes,
            recordedAt: now,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.sessionId, attendanceRecords.athleteId],
            set: {
              status,
              notes,
              recordedAt: now,
            },
          });
      }
    });

    // La primera asistencia es el momento en que la academia obtiene valor
    // operativo real. La clave por academia hace el hito idempotente aunque
    // se guarde la lista varias veces.
    await trackEvent("first_attendance_recorded", {
      academyId: sessionRow.academyId,
      tenantId: context.tenantId,
      idempotencyKey: `first_attendance_recorded:v1:${sessionRow.academyId}`,
    });
    await markAcademyActivationIfReady(sessionRow.academyId, context.tenantId);

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});

const querySchema = z.object({
  sessionId: z.string().uuid().optional(),
  academyId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const params = querySchema.safeParse(search);

    if (!params.success) {
      return handleApiError(params.error);
    }

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    if (!params.data.sessionId && !params.data.academyId) {
      return apiError("SESSION_OR_ACADEMY_REQUIRED", "sessionId o academyId requerido", 400);
    }

    if (context.profile.role === "coach" && !params.data.sessionId) {
      return apiError(
        "SESSION_REQUIRED_FOR_COACH",
        "Los entrenadores deben consultar la asistencia de una sesión asignada",
        403
      );
    }

    if (params.data.sessionId) {
      const [sessionRow] = await db
        .select({
          classId: classSessions.classId,
          academyId: classes.academyId,
        })
        .from(classSessions)
        .innerJoin(classes, eq(classSessions.classId, classes.id))
        .where(
          and(
            eq(classSessions.id, params.data.sessionId),
            eq(classSessions.tenantId, context.tenantId),
            eq(classes.tenantId, context.tenantId)
          )
        )
        .limit(1);

      if (!sessionRow) {
        return apiError("SESSION_NOT_FOUND", "Sesión no encontrada", 404);
      }

      const classScope = await verifyAttendanceWriteAccess({
        tenantId: context.tenantId,
        academyId: sessionRow.academyId,
        classId: sessionRow.classId,
        profile: context.profile,
      });
      if (!classScope.allowed) {
        return apiError(
          classScope.reason ?? "CLASS_ACCESS_DENIED",
          "No tienes permiso para consultar la asistencia de esta clase",
          403
        );
      }
    }

    const whereConditions = [eq(attendanceRecords.tenantId, context.tenantId)];

    if (params.data.sessionId) {
      whereConditions.push(eq(attendanceRecords.sessionId, params.data.sessionId));
    } else if (params.data.academyId) {
      whereConditions.push(eq(classes.academyId, params.data.academyId));
    }

    const rows = await db
      .select({
        id: attendanceRecords.id,
        sessionId: attendanceRecords.sessionId,
        athleteId: attendanceRecords.athleteId,
        status: attendanceRecords.status,
        notes: attendanceRecords.notes,
        recordedAt: attendanceRecords.recordedAt,
        sportConfigId: classSessions.sportConfigId,
      })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
      .innerJoin(classes, eq(classSessions.classId, classes.id))
      .where(and(...whereConditions))
      .limit(10000);

    return apiSuccess({ items: rows });
  } catch (error) {
    return handleApiError(error);
  }
});
