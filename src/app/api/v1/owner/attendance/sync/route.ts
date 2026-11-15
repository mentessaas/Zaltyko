import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { db } from "@/db";
import { sessions } from "@/db/zaltyko-schema";
import { apiSuccess } from "@/lib/api-response";
import { clockOffsetMs, resolveMarkedAt } from "@/lib/attendance/offline-sync";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { recordOfflineAttendance } from "@/modules/attendance/application/attendance-service";
import { resolveSessionAttendanceAccess } from "@/modules/attendance/application/owner-session-attendance";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { isRetryableDbConflict } from "@/modules/shared/infrastructure/retryable-db-conflict";

/** Mismo tope que el envío por lotes del pasar lista de la cola local. */
const MAX_ENTRIES = 100;

const entrySchema = z
  .object({
    /** Identificador de la marca en el móvil: hace el envío idempotente. */
    opId: z.guid(),
    sessionId: z.guid(),
    enrollmentId: z.guid(),
    status: z.enum(["present", "absent", "excused", "late"]),
    /** Hora real de la marca en el móvil. */
    markedAt: z.string().datetime({ offset: true }).optional(),
    /** `recordedAt` que la entrenadora veía al marcar (null: no había marca). */
    seenRecordedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

const bodySchema = z
  .object({
    organizationId: z.guid(),
    /** Hora del móvil al enviar: el servidor compensa un reloj mal puesto. */
    sentAt: z.string().datetime({ offset: true }).optional(),
    entries: z.array(entrySchema).min(1).max(MAX_ENTRIES),
  })
  .strict();

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: the actor is the verified session user, never the body; for every session in the batch the session's site is read inside the requested organization and resolveSessionAttendanceAccess checks active membership, role and site scope (a coach is bounded to their sites and another site answers as a missing session), and each write repeats role/session/enrollment validation transactionally in recordOfflineAttendance.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para enviar la asistencia.",
      type: "authentication-required",
    });
  }

  const raw = await request.json().catch(() => null);
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return problemResponse({
      status: 400,
      title: "Datos de asistencia incompletos",
      detail: "Comprueba la academia, las sesiones, las inscripciones y los estados.",
      type: "invalid-offline-attendance-command",
      errors: body.error.flatten(),
    });
  }

  try {
    // Primero el acceso a cada sesión del lote: una sesión ajena o de otra
    // sede responde como si no existiera y no se guarda nada del lote.
    const accessBySession = new Map<
      string,
      Awaited<ReturnType<typeof resolveSessionAttendanceAccess>>
    >();
    for (const entry of body.data.entries) {
      if (accessBySession.has(entry.sessionId)) continue;
      const [row] = await db
        .select({ locationId: sessions.locationId })
        .from(sessions)
        .where(
          and(
            eq(sessions.organizationId, body.data.organizationId),
            eq(sessions.id, entry.sessionId)
          )
        )
        .limit(1);
      if (!row) {
        throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
      }
      accessBySession.set(
        entry.sessionId,
        await resolveSessionAttendanceAccess({
          userId: user.id,
          organizationId: body.data.organizationId,
          locationId: row.locationId,
          sessionId: entry.sessionId,
        })
      );
    }

    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        body.data.organizationId
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const now = new Date();
    const offset = clockOffsetMs(body.data.sentAt, now);
    const results: Array<{
      opId: string;
      sessionId: string;
      enrollmentId: string;
      outcome: "applied" | "duplicate" | "superseded";
      recordedAt: string;
    }> = [];

    for (const entry of body.data.entries) {
      const access = accessBySession.get(entry.sessionId);
      if (!access) {
        throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
      }
      const result = await recordOfflineAttendance({
        organizationId: body.data.organizationId,
        expectedLocationId: access.locationId,
        sessionId: entry.sessionId,
        enrollmentId: entry.enrollmentId,
        status: entry.status,
        idempotencyKey: `offline:${entry.opId}`,
        actor: { userId: user.id, memberId: access.memberId },
        offline: {
          opId: entry.opId,
          markedAt: resolveMarkedAt(entry.markedAt, now, offset),
          seenRecordedAt:
            entry.seenRecordedAt === undefined
              ? undefined
              : entry.seenRecordedAt === null
                ? null
                : new Date(entry.seenRecordedAt),
        },
      });
      results.push({
        opId: entry.opId,
        sessionId: entry.sessionId,
        enrollmentId: entry.enrollmentId,
        outcome: result.outcome,
        recordedAt: result.attendance.recordedAt.toISOString(),
      });
    }

    return withPrivateNoStore(apiSuccess({ results }));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    // Interbloqueo con otra escritura sobre la misma sesión: se deshizo la
    // marca en curso y basta reenviar el lote (las anteriores ya quedaron
    // guardadas y vuelven como «ya estaba»). 503 = el móvil lo reintenta.
    if (isRetryableDbConflict(error)) {
      return problemResponse({
        status: 503,
        title: "Operación ocupada, vuelve a intentarlo",
        detail:
          "Otra operación estaba usando esta sesión. Lo marcado se conserva y se enviará de nuevo.",
        type: "concurrency-retry",
      });
    }
    throw error;
  }
}
