import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { attendanceRecords, auditLogs, classSessions, classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { apiSuccess, apiError } from "@/lib/api-response";
import { getClassAthletes } from "@/lib/classes/get-class-athletes";
import { verifyAttendanceWriteAccess } from "@/lib/attendance/service";
import { markAcademyActivationIfReady } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { assertAcademyOperationalWritable, lockAcademyOperationalWrites } from "@/lib/limits";
import { clockOffsetMs, decideMark, resolveMarkedAt, type SyncOutcome } from "@/lib/attendance/offline-sync";
import { logger } from "@/lib/logger";

const entrySchema = z.object({
  athleteId: z.guid(),
  status: z.enum(["present", "absent", "late", "excused"]).optional(),
  notes: z.string().optional(),
  // Marcas hechas sin conexión: momento real de la marca y operación del móvil.
  markedAt: z.string().datetime({ offset: true }).optional(),
  opId: z.guid().optional(),
  // `recordedAt` que el móvil vio al marcar (null si no había marca).
  seenRecordedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const upsertBodySchema = z.object({
  sessionId: z.guid(),
  // Hora del móvil al enviar: sirve para compensar un reloj mal puesto.
  sentAt: z.string().datetime({ offset: true }).optional(),
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
          "Alguna gimnasta no está en esta clase o sesión",
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

    // «Última marca gana» e idempotencia (ver lib/attendance/offline-sync):
    // se compara el momento de cada marca con lo que ya hay guardado.
    const results: Array<{ athleteId: string; outcome: SyncOutcome; recordedAt: string }> = [];
    const offsetMs = clockOffsetMs(body.sentAt, now);
    const conflicts: Array<Record<string, unknown>> = [];

    await withTransaction(async (tx) => {
      await lockAcademyOperationalWrites(tx, sessionRow.academyId);
      await assertAcademyOperationalWritable(context.tenantId!, sessionRow.academyId, tx);

      const existingRows = await tx
        .select({
          athleteId: attendanceRecords.athleteId,
          status: attendanceRecords.status,
          notes: attendanceRecords.notes,
          recordedAt: attendanceRecords.recordedAt,
        })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.tenantId, context.tenantId!),
            eq(attendanceRecords.sessionId, body.sessionId),
            inArray(
              attendanceRecords.athleteId,
              body.entries.map((entry) => entry.athleteId)
            )
          )
        )
        .limit(1000);
      const existingByAthlete = new Map(existingRows.map((row) => [row.athleteId, row]));

      for (const entry of body.entries) {
        const status = entry.status ?? "present";
        const notes = entry.notes ?? null;
        const markedAt = resolveMarkedAt(entry.markedAt, now, offsetMs);
        const existing = existingByAthlete.get(entry.athleteId);
        const seenRecordedAt =
          entry.seenRecordedAt === undefined
            ? undefined
            : entry.seenRecordedAt === null
              ? null
              : new Date(entry.seenRecordedAt);
        const decision = decideMark(existing, { status, notes, markedAt, seenRecordedAt });

        results.push({
          athleteId: entry.athleteId,
          outcome: decision.outcome,
          // Lo que queda guardado tras esta decisión: el móvil lo usa como
          // «lo que vi» en su siguiente marca.
          recordedAt: (decision.outcome === "applied" ? markedAt : existing?.recordedAt ?? markedAt).toISOString(),
        });

        // Solo las marcas de la cola sin conexión (traen opId) dejan registro
        // de conflicto; el guardado normal en línea no genera ruido.
        if (decision.conflict && entry.opId) {
          conflicts.push({
            athleteId: entry.athleteId,
            opId: entry.opId,
            outcome: decision.outcome,
            incoming: { status, markedAt: markedAt.toISOString() },
            existing: {
              status: existing?.status ?? null,
              recordedAt: existing?.recordedAt ? existing.recordedAt.toISOString() : null,
            },
          });
        }

        if (decision.outcome !== "applied") continue;

        await tx
          .insert(attendanceRecords)
          .values({
            id: crypto.randomUUID(),
            tenantId: context.tenantId,
            sessionId: body.sessionId,
            athleteId: entry.athleteId,
            status,
            notes,
            recordedAt: markedAt,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.sessionId, attendanceRecords.athleteId],
            set: {
              status,
              notes,
              recordedAt: markedAt,
            },
          });
      }
    });

    // Registro de conflictos (best effort, nunca rompe el guardado): quién,
    // qué sesión y qué valor se perdió, para poder explicarlo a la entrenadora.
    if (conflicts.length > 0) {
      try {
        await db.insert(auditLogs).values({
          tenantId: context.tenantId,
          userId: context.userId ?? null,
          action: "attendance.offline_conflict",
          module: "classes",
          resourceType: "attendance_session",
          resourceId: body.sessionId,
          description: "Marca de asistencia hecha sin conexión que coincidió con otra más reciente o más antigua",
          meta: { conflicts },
          status: "warning",
        });
      } catch (error) {
        logger.error("No se pudo registrar el conflicto de asistencia", error);
      }
    }

    // Reenviar marcas ya aplicadas no cuenta como actividad nueva.
    if (results.every((result) => result.outcome === "duplicate")) {
      return apiSuccess({ ok: true, results });
    }

    // La primera asistencia es el momento en que la academia obtiene valor
    // operativo real. La clave por academia hace el hito idempotente aunque
    // se guarde la lista varias veces.
    await trackEvent("first_attendance_recorded", {
      academyId: sessionRow.academyId,
      tenantId: context.tenantId,
      idempotencyKey: `first_attendance_recorded:v1:${sessionRow.academyId}`,
    });
    await markAcademyActivationIfReady(sessionRow.academyId, context.tenantId);

    return apiSuccess({ ok: true, results });
  } catch (error) {
    return handleApiError(error);
  }
});

const querySchema = z.object({
  sessionId: z.guid().optional(),
  academyId: z.guid().optional(),
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
