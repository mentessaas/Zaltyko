import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  attendanceRecords,
  enrollments,
  sessionStaff,
  sessions,
  staffProfiles,
  type AttendanceRecord,
} from "@/db/zaltyko-schema";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const recordAttendanceSchema = z.object({
  organizationId: z.string().uuid(),
  sessionId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  status: z.enum(["present", "absent", "excused", "late"]),
  idempotencyKey: z.string().trim().min(8).max(180),
  actor: operationalActorSchema,
});

export type RecordAttendanceCommand = z.infer<typeof recordAttendanceSchema>;

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

    const member = await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: session.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "manager", "admin", "coach"],
    });

    if (member.role === "coach") {
      const [assignment] = await tx
        .select({ id: sessionStaff.id })
        .from(sessionStaff)
        .innerJoin(
          staffProfiles,
          and(
            eq(staffProfiles.organizationId, sessionStaff.organizationId),
            eq(staffProfiles.id, sessionStaff.staffProfileId),
            eq(staffProfiles.memberId, member.id),
            eq(staffProfiles.isActive, true)
          )
        )
        .where(
          and(
            eq(sessionStaff.organizationId, input.organizationId),
            eq(sessionStaff.sessionId, session.id)
          )
        )
        .limit(1);

      if (!assignment) {
        throw new OperationalError(
          "FORBIDDEN",
          "El coach no está asignado a esta sesión",
          403
        );
      }
    }

    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, {
        sessionId: input.sessionId,
        enrollmentId: input.enrollmentId,
        status: input.status,
      });
    }
    const priorAttendanceId = priorEvent?.payload.attendanceId;
    if (typeof priorAttendanceId === "string") {
      const prior = await loadAttendance(
        tx,
        input.organizationId,
        priorAttendanceId
      );
      if (prior) return prior;
    }

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

    const now = new Date();
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

    return attendance;
  });
}
