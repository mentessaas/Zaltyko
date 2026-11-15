import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  attendanceRecords,
  auditLog,
  enrollments,
  sessions,
  type AttendanceRecord,
} from "@/db/zaltyko-schema";
import { decideMark, type SyncOutcome } from "@/lib/attendance/offline-sync";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOrganizationOperationalWritable } from "@/modules/saas-billing/application/organization-usage";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const recordAttendanceSchema = z.object({
  organizationId: z.guid(),
  expectedLocationId: z.guid().optional(),
  sessionId: z.guid(),
  enrollmentId: z.guid(),
  status: z.enum(["present", "absent", "excused", "late"]),
  idempotencyKey: z.string().trim().min(8).max(180),
  actor: operationalActorSchema,
});

export type RecordAttendanceCommand = z.infer<typeof recordAttendanceSchema>;

/**
 * Marca hecha en el tapiz sin cobertura y enviada después. `markedAt` es la
 * hora real de la marca (ya corregida con el reloj del móvil y acotada a
 * «ahora»); `seenRecordedAt` es lo que la entrenadora veía en pantalla.
 */
const offlineMarkSchema = z.object({
  opId: z.guid(),
  markedAt: z.date(),
  seenRecordedAt: z.date().nullable().optional(),
});

const recordOfflineAttendanceSchema = recordAttendanceSchema.extend({
  offline: offlineMarkSchema,
});

export type RecordOfflineAttendanceCommand = z.infer<
  typeof recordOfflineAttendanceSchema
>;

export type RecordAttendanceResult = {
  attendance: AttendanceRecord;
  /** `applied` si se guardó; `duplicate`/`superseded` si no cambió nada. */
  outcome: SyncOutcome;
};

async function loadAttendance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  attendanceId: string
): Promise<AttendanceRecord | null> {
  const [attendance] = await tx
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.organizationId, organizationId),
        eq(attendanceRecords.id, attendanceId)
      )
    )
    .limit(1);
  return attendance ?? null;
}

export async function recordAttendance(
  command: RecordAttendanceCommand
): Promise<AttendanceRecord> {
  const input = recordAttendanceSchema.parse(command);
  return (await runRecordAttendance(input)).attendance;
}

/**
 * Misma operación que `recordAttendance` para una marca que llega de la cola
 * sin conexión: idempotente por `opId`, «la última marca gana» según la hora
 * real de la marca y conflicto anotado si alguien cambió esa marca mientras
 * la entrenadora estaba sin red.
 */
export async function recordOfflineAttendance(
  command: RecordOfflineAttendanceCommand
): Promise<RecordAttendanceResult> {
  const input = recordOfflineAttendanceSchema.parse(command);
  return runRecordAttendance(input, input.offline);
}

async function runRecordAttendance(
  input: RecordAttendanceCommand,
  offline?: z.infer<typeof offlineMarkSchema>
): Promise<RecordAttendanceResult> {
  const eventName = "attendance.recorded";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:attendance:${input.sessionId}:${input.enrollmentId}`}, 0))`
    );
    await tx.execute(
      sql`select id from zaltyko.sessions where organization_id = ${input.organizationId}::uuid and id = ${input.sessionId}::uuid for update`
    );

    const [session] = await tx
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.organizationId, input.organizationId),
          eq(sessions.id, input.sessionId)
        )
      )
      .limit(1);
    if (!session) {
      throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
    }
    if (
      input.expectedLocationId &&
      session.locationId !== input.expectedLocationId
    ) {
      throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: session.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "manager", "admin", "coach"],
    });

    // P1 #8, decision 2026-11-09 (option A): assertOperationalAccess above
    // already bounds a coach to the session's site; no per-session staff
    // assignment is required, so a substitute coach can take attendance.
    // Restricting assigned sessions (option B, see
    // findActiveSessionStaffAssignment) is a separate task.
    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent && offline) {
      // Reenvío de una marca ya guardada. La clave debe ser de esta misma
      // sesión e inscripción; el estado no se compara, porque otra marca más
      // reciente pudo sustituirlo. Se devuelve lo que hay.
      assertIdempotencyPayload(priorEvent.payload, {
        sessionId: input.sessionId,
        enrollmentId: input.enrollmentId,
      });
      const [current] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.organizationId, input.organizationId),
            eq(attendanceRecords.sessionId, input.sessionId),
            eq(attendanceRecords.enrollmentId, input.enrollmentId)
          )
        )
        .limit(1);
      if (!current) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El registro previo no identifica una asistencia coherente",
          409
        );
      }
      return { attendance: current, outcome: "duplicate" as const };
    }
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, {
        sessionId: input.sessionId,
        enrollmentId: input.enrollmentId,
        status: input.status,
      });
      const parsedAttendanceId = z.string().uuid().safeParse(priorEvent.payload.attendanceId);
      if (
        !parsedAttendanceId.success ||
        priorEvent.aggregateType !== "attendance" ||
        priorEvent.aggregateId !== parsedAttendanceId.data
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "El registro previo no identifica una asistencia coherente",
          409
        );
      }
      const prior = await loadAttendance(
        tx,
        input.organizationId,
        parsedAttendanceId.data
      );
      if (
        !prior ||
        prior.sessionId !== input.sessionId ||
        prior.enrollmentId !== input.enrollmentId ||
        prior.status !== input.status
      ) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La asistencia del resultado anterior ya no coincide con la operación",
          409
        );
      }
      return { attendance: prior, outcome: "duplicate" as const };
    }

    // A replay only recovers an already committed record; enforce the plan's
    // write gate only when this command would create or correct attendance.
    await assertOrganizationOperationalWritable(tx, input.organizationId);

    if (session.status === "cancelled") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "No se puede registrar asistencia en una sesión cancelada",
        409
      );
    }

    const [enrollment] = await tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.organizationId, input.organizationId),
          eq(enrollments.id, input.enrollmentId)
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new OperationalError("NOT_FOUND", "Inscripción no encontrada", 404);
    }
    if (
      enrollment.locationId !== session.locationId ||
      enrollment.classTemplateId !== session.classTemplateId
    ) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La inscripción no corresponde a la sesión",
        409
      );
    }
    if (enrollment.status !== "active" && enrollment.status !== "trial") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "La inscripción no está activa para registrar asistencia",
        409
      );
    }

    const localDateResult = await tx.execute(sql`
      select (session.starts_at at time zone location.timezone)::date::text as local_date
      from zaltyko.sessions session
      join zaltyko.locations location
        on location.organization_id = session.organization_id
       and location.id = session.location_id
      where session.organization_id = ${input.organizationId}::uuid
        and session.id = ${input.sessionId}::uuid
    `);
    const localDate = String(localDateResult.rows[0]?.local_date ?? "");
    if (
      localDate < enrollment.startsOn ||
      (enrollment.endsOn !== null && localDate >= enrollment.endsOn)
    ) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La sesión queda fuera de la vigencia de la inscripción",
        409
      );
    }

    await tx.execute(
      sql`select id from zaltyko.attendance_records where organization_id = ${input.organizationId}::uuid and session_id = ${input.sessionId}::uuid and enrollment_id = ${input.enrollmentId}::uuid for update`
    );
    const [existing] = await tx
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, input.organizationId),
          eq(attendanceRecords.sessionId, input.sessionId),
          eq(attendanceRecords.enrollmentId, input.enrollmentId)
        )
      )
      .limit(1);

    if (offline) {
      const decision = decideMark(
        existing
          ? { status: existing.status, notes: null, recordedAt: existing.recordedAt }
          : undefined,
        {
          status: input.status,
          notes: null,
          markedAt: offline.markedAt,
          seenRecordedAt: offline.seenRecordedAt,
        }
      );
      if (decision.conflict && existing) {
        // Un valor distinto se pierde: queda en el registro. Si el mismo
        // reenvío vuelve a llegar, no se duplica la anotación.
        await tx
          .insert(auditLog)
          .values({
            organizationId: input.organizationId,
            locationId: session.locationId,
            actorUserId: input.actor.userId,
            action: "attendance.offline_conflict",
            targetType: "attendance",
            targetId: existing.id,
            idempotencyKey: `offline-conflict:${offline.opId}`,
            before: { status: existing.status },
            after: { status: input.status },
            metadata: {
              opId: offline.opId,
              outcome: decision.outcome,
              sessionId: input.sessionId,
              enrollmentId: input.enrollmentId,
              markedAt: offline.markedAt.toISOString(),
              storedRecordedAt: existing.recordedAt.toISOString(),
              seenRecordedAt: offline.seenRecordedAt
                ? offline.seenRecordedAt.toISOString()
                : null,
            },
          })
          .onConflictDoNothing();
      }
      if (decision.outcome !== "applied" && existing) {
        return { attendance: existing, outcome: decision.outcome };
      }
    }

    const now = offline ? offline.markedAt : new Date();
    const [attendance] = existing
      ? await tx
          .update(attendanceRecords)
          .set({
            status: input.status,
            recordedByMemberId: input.actor.memberId,
            recordedAt: now,
          })
          .where(eq(attendanceRecords.id, existing.id))
          .returning()
      : await tx
          .insert(attendanceRecords)
          .values({
            organizationId: input.organizationId,
            locationId: session.locationId,
            sessionId: session.id,
            enrollmentId: enrollment.id,
            athleteId: enrollment.athleteId,
            status: input.status,
            recordedByMemberId: input.actor.memberId,
            recordedAt: now,
          })
          .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: session.locationId,
      eventName,
      aggregateType: "attendance",
      aggregateId: attendance.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        attendanceId: attendance.id,
        sessionId: attendance.sessionId,
        enrollmentId: attendance.enrollmentId,
        status: attendance.status,
        corrected: Boolean(existing),
      },
    });

    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: session.locationId,
      actorUserId: input.actor.userId,
      action: existing ? "attendance.corrected" : eventName,
      targetType: "attendance",
      targetId: attendance.id,
      idempotencyKey: input.idempotencyKey,
      before: existing ? { status: existing.status } : null,
      after: { status: attendance.status },
      metadata: {
        sessionId: attendance.sessionId,
        enrollmentId: attendance.enrollmentId,
      },
    });

    return { attendance, outcome: "applied" as const };
  });
}
