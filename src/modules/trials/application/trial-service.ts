import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  enrollments,
  sessions,
  trialFollowups,
  trials,
  trialStatusHistory,
  type Enrollment,
  type Trial,
  type TrialFollowup,
} from "@/db/zaltyko-schema";
import {
  createEnrollmentInTransaction,
  transitionEnrollmentInTransaction,
} from "@/modules/enrollments/application/enrollment-service";
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

const commandKeySchema = z.string().trim().min(8).max(150);
const privilegedRoles = ["owner", "manager", "admin"] as const;

const bookTrialSchema = z.object({
  organizationId: z.guid(),
  athleteId: z.guid(),
  sessionId: z.guid(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const transitionTrialSchema = z.object({
  organizationId: z.guid(),
  trialId: z.guid(),
  expectedVersion: z.number().int().positive(),
  toStatus: z.enum(["attended", "completed", "no_show", "cancelled"]),
  effectiveAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const recordTrialFollowupSchema = z.object({
  organizationId: z.guid(),
  trialId: z.guid(),
  channel: z.enum(["email", "phone", "sms", "in_person"]),
  outcome: z.enum([
    "contacted",
    "no_answer",
    "converted",
    "waitlisted",
    "not_interested",
    "follow_up_needed",
  ]),
  completedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const convertTrialSchema = z.object({
  organizationId: z.guid(),
  trialId: z.guid(),
  expectedVersion: z.number().int().positive(),
  targetLocationId: z.guid(),
  targetClassTemplateId: z.guid(),
  startsOn: z.string().date(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type BookTrialCommand = z.infer<typeof bookTrialSchema>;
export type TransitionTrialCommand = z.infer<typeof transitionTrialSchema>;
export type RecordTrialFollowupCommand = z.infer<
  typeof recordTrialFollowupSchema
>;
export type ConvertTrialCommand = z.infer<typeof convertTrialSchema>;

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

const trialTransitions: Record<Trial["status"], readonly Trial["status"][]> = {
  booked: ["attended", "no_show", "cancelled"],
  attended: ["completed", "cancelled"],
  completed: ["converted"],
  no_show: [],
  cancelled: [],
  converted: [],
};

function trialEventName(status: Trial["status"]): string {
  return `trial.${status}`;
}

async function loadTrial(
  tx: TransactionClient,
  organizationId: string,
  trialId: string
): Promise<Trial> {
  const [trial] = await tx
    .select()
    .from(trials)
    .where(
      and(eq(trials.organizationId, organizationId), eq(trials.id, trialId))
    )
    .limit(1);

  if (!trial) {
    throw new OperationalError("NOT_FOUND", "Trial no encontrado", 404);
  }
  return trial;
}

async function loadTrialFromEvent(
  tx: TransactionClient,
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
    expectedPayload: Record<string, string | number | boolean | null>;
  }
): Promise<Trial | null> {
  const event = await findOutboxEvent(tx, input);
  if (event) {
    assertIdempotencyPayload(event.payload, input.expectedPayload);
  }
  const trialId = event?.payload.trialId;
  if (typeof trialId !== "string") return null;
  return loadTrial(tx, input.organizationId, trialId);
}

async function sessionBusinessDate(
  tx: TransactionClient,
  organizationId: string,
  sessionId: string
): Promise<string> {
  const result = await tx.execute(sql`
    select (session.starts_at at time zone location.timezone)::date::text as local_date
    from zaltyko.sessions session
    join zaltyko.locations location
      on location.organization_id = session.organization_id
     and location.id = session.location_id
    where session.organization_id = ${organizationId}::uuid
      and session.id = ${sessionId}::uuid
  `);
  const localDate = result.rows[0]?.local_date;
  if (typeof localDate !== "string") {
    throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
  }
  return localDate;
}

async function effectiveBusinessDate(
  tx: TransactionClient,
  organizationId: string,
  locationId: string,
  effectiveAt: string
): Promise<string> {
  const result = await tx.execute(sql`
    select (${effectiveAt}::timestamptz at time zone location.timezone)::date::text as local_date
    from zaltyko.locations location
    where location.organization_id = ${organizationId}::uuid
      and location.id = ${locationId}::uuid
  `);
  const localDate = result.rows[0]?.local_date;
  if (typeof localDate !== "string") {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }
  return localDate;
}

export async function bookTrial(command: BookTrialCommand): Promise<Trial> {
  const input = bookTrialSchema.parse(command);
  const eventName = "trial.booked";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const prior = await loadTrialFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        athleteId: input.athleteId,
        sessionId: input.sessionId,
      },
    });
    if (prior) {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: prior.locationId,
        actor: input.actor,
        intent: "write",
        allowedRoles: privilegedRoles,
      });
      return prior;
    }

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
    if (!session || session.status !== "scheduled") {
      throw new OperationalError(
        "NOT_FOUND",
        "Sesión programada no encontrada",
        404
      );
    }
    if (session.endsAt.getTime() <= Date.now()) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "No se puede reservar un trial en una sesión finalizada",
        409
      );
    }

    const trialId = crypto.randomUUID();
    const startsOn = await sessionBusinessDate(
      tx,
      input.organizationId,
      input.sessionId
    );
    const enrollment = await createEnrollmentInTransaction(tx, {
      organizationId: input.organizationId,
      locationId: session.locationId,
      athleteId: input.athleteId,
      classTemplateId: session.classTemplateId,
      status: "trial",
      startsOn,
      source: "trial",
      sourceEntityId: trialId,
      idempotencyKey: `${input.idempotencyKey}:enrollment`,
      actor: input.actor,
    });

    const now = new Date();
    const [trial] = await tx
      .insert(trials)
      .values({
        id: trialId,
        organizationId: input.organizationId,
        locationId: session.locationId,
        athleteId: input.athleteId,
        sessionId: session.id,
        trialEnrollmentId: enrollment.id,
        status: "booked",
        bookedAt: now,
      })
      .returning();

    await tx.insert(trialStatusHistory).values({
      organizationId: input.organizationId,
      locationId: trial.locationId,
      trialId: trial.id,
      fromStatus: null,
      toStatus: "booked",
      effectiveAt: now,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: trial.locationId,
      eventName,
      aggregateType: "trial",
      aggregateId: trial.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        trialId: trial.id,
        athleteId: trial.athleteId,
        sessionId: trial.sessionId,
        trialEnrollmentId: trial.trialEnrollmentId,
        status: trial.status,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: trial.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "trial",
      targetId: trial.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        status: trial.status,
        sessionId: trial.sessionId,
        trialEnrollmentId: trial.trialEnrollmentId,
      },
    });

    return trial;
  });
}

export async function transitionTrial(
  command: TransitionTrialCommand
): Promise<Trial> {
  const input = transitionTrialSchema.parse(command);
  const eventName = trialEventName(input.toStatus);

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await tx.execute(
      sql`select id from zaltyko.trials where organization_id = ${input.organizationId}::uuid and id = ${input.trialId}::uuid for update`
    );
    const current = await loadTrial(tx, input.organizationId, input.trialId);
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });

    const prior = await loadTrialFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        trialId: input.trialId,
        toStatus: input.toStatus,
        effectiveAt: input.effectiveAt,
      },
    });
    if (prior) return prior;

    const effectiveAt = new Date(input.effectiveAt);
    if (effectiveAt.getTime() > Date.now()) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "La transición del trial no puede ser futura",
        409
      );
    }
    const [session] = await tx
      .select({ startsAt: sessions.startsAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.organizationId, input.organizationId),
          eq(sessions.id, current.sessionId)
        )
      )
      .limit(1);
    if (!session) {
      throw new OperationalError("NOT_FOUND", "Sesión no encontrada", 404);
    }
    if (
      input.toStatus !== "cancelled" &&
      effectiveAt.getTime() < session.startsAt.getTime()
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El resultado del trial no puede preceder al inicio de la sesión",
        409
      );
    }
    if (
      current.attendedAt &&
      effectiveAt.getTime() < current.attendedAt.getTime()
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El trial no puede completarse antes de marcar asistencia",
        409
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El trial cambió desde la última lectura",
        409
      );
    }
    if (!trialTransitions[current.status].includes(input.toStatus)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        `No se puede pasar de ${current.status} a ${input.toStatus}`,
        409
      );
    }

    if (
      input.toStatus === "completed" ||
      input.toStatus === "no_show" ||
      input.toStatus === "cancelled"
    ) {
      const [trialEnrollment] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.organizationId, input.organizationId),
            eq(enrollments.id, current.trialEnrollmentId)
          )
        )
        .limit(1);
      if (!trialEnrollment) {
        throw new OperationalError(
          "NOT_FOUND",
          "Inscripción temporal del trial no encontrada",
          404
        );
      }
      const effectiveOn = await effectiveBusinessDate(
        tx,
        input.organizationId,
        current.locationId,
        input.effectiveAt
      );
      await transitionEnrollmentInTransaction(tx, {
        organizationId: input.organizationId,
        enrollmentId: trialEnrollment.id,
        expectedVersion: trialEnrollment.version,
        toStatus: input.toStatus === "cancelled" ? "cancelled" : "completed",
        effectiveOn,
        reasonCode: `trial_${input.toStatus}`,
        idempotencyKey: `${input.idempotencyKey}:enrollment`,
        actor: input.actor,
      });
    }

    const [updated] = await tx
      .update(trials)
      .set({
        status: input.toStatus,
        attendedAt:
          input.toStatus === "attended" ? effectiveAt : current.attendedAt,
        completedAt:
          input.toStatus === "completed" ||
          input.toStatus === "no_show" ||
          input.toStatus === "cancelled"
            ? effectiveAt
            : current.completedAt,
        version: sql`${trials.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(trials.organizationId, input.organizationId),
          eq(trials.id, input.trialId),
          eq(trials.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El trial cambió durante la operación",
        409
      );
    }

    await tx.insert(trialStatusHistory).values({
      organizationId: input.organizationId,
      locationId: updated.locationId,
      trialId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      effectiveAt,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: updated.locationId,
      eventName,
      aggregateType: "trial",
      aggregateId: updated.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        trialId: updated.id,
        fromStatus: current.status,
        toStatus: updated.status,
        effectiveAt: input.effectiveAt,
        version: updated.version,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: updated.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "trial",
      targetId: updated.id,
      idempotencyKey: input.idempotencyKey,
      before: { status: current.status, version: current.version },
      after: { status: updated.status, version: updated.version },
    });

    return updated;
  });
}

export async function recordTrialFollowup(
  command: RecordTrialFollowupCommand
): Promise<TrialFollowup> {
  const input = recordTrialFollowupSchema.parse(command);
  const eventName = "trial.followup_recorded";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    const priorFollowupId = priorEvent?.payload.followupId;
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, {
        trialId: input.trialId,
        channel: input.channel,
        outcome: input.outcome,
        completedAt: new Date(input.completedAt).toISOString(),
      });
    }
    if (typeof priorFollowupId === "string") {
      const [prior] = await tx
        .select()
        .from(trialFollowups)
        .where(
          and(
            eq(trialFollowups.organizationId, input.organizationId),
            eq(trialFollowups.id, priorFollowupId)
          )
        )
        .limit(1);
      if (prior) {
        const priorTrial = await loadTrial(
          tx,
          input.organizationId,
          prior.trialId
        );
        await assertOperationalAccess(tx, {
          organizationId: input.organizationId,
          locationId: priorTrial.locationId,
          actor: input.actor,
          intent: "write",
          allowedRoles: privilegedRoles,
        });
        return prior;
      }
    }

    const trial = await loadTrial(tx, input.organizationId, input.trialId);
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: trial.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });
    if (!new Set(["completed", "no_show", "cancelled"]).has(trial.status)) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "El trial debe haber finalizado antes del seguimiento",
        409
      );
    }
    if (new Date(input.completedAt).getTime() > Date.now()) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El seguimiento no puede ser futuro",
        409
      );
    }
    if (
      trial.completedAt &&
      new Date(input.completedAt).getTime() < trial.completedAt.getTime()
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El seguimiento no puede preceder a la finalización del trial",
        409
      );
    }

    const [followup] = await tx
      .insert(trialFollowups)
      .values({
        organizationId: input.organizationId,
        locationId: trial.locationId,
        trialId: trial.id,
        channel: input.channel,
        outcome: input.outcome,
        completedByMemberId: input.actor.memberId,
        completedAt: new Date(input.completedAt),
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: trial.locationId,
      eventName,
      aggregateType: "trial",
      aggregateId: trial.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        trialId: trial.id,
        followupId: followup.id,
        channel: followup.channel,
        outcome: followup.outcome,
        completedAt: followup.completedAt.toISOString(),
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: trial.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "trial_followup",
      targetId: followup.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        trialId: trial.id,
        channel: followup.channel,
        outcome: followup.outcome,
      },
    });

    return followup;
  });
}

export async function convertTrial(
  command: ConvertTrialCommand
): Promise<{ trial: Trial; enrollment: Enrollment }> {
  const input = convertTrialSchema.parse(command);
  const eventName = "trial.converted";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await tx.execute(
      sql`select id from zaltyko.trials where organization_id = ${input.organizationId}::uuid and id = ${input.trialId}::uuid for update`
    );
    const current = await loadTrial(tx, input.organizationId, input.trialId);
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: privilegedRoles,
    });

    const prior = await loadTrialFromEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
      expectedPayload: {
        trialId: input.trialId,
        targetLocationId: input.targetLocationId,
        classTemplateId: input.targetClassTemplateId,
        startsOn: input.startsOn,
      },
    });
    if (prior?.convertedEnrollmentId) {
      const [enrollment] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.organizationId, input.organizationId),
            eq(enrollments.id, prior.convertedEnrollmentId)
          )
        )
        .limit(1);
      if (enrollment) return { trial: prior, enrollment };
    }

    if (current.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El trial cambió desde la última lectura",
        409
      );
    }
    if (!trialTransitions[current.status].includes("converted")) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Solo un trial completado puede convertirse",
        409
      );
    }

    const enrollment = await createEnrollmentInTransaction(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      athleteId: current.athleteId,
      classTemplateId: input.targetClassTemplateId,
      status: "active",
      startsOn: input.startsOn,
      source: "trial",
      sourceEntityId: current.id,
      idempotencyKey: `${input.idempotencyKey}:enrollment`,
      actor: input.actor,
    });

    const convertedAt = new Date();
    const [updated] = await tx
      .update(trials)
      .set({
        status: "converted",
        convertedEnrollmentId: enrollment.id,
        convertedAt,
        version: sql`${trials.version} + 1`,
        updatedAt: convertedAt,
      })
      .where(
        and(
          eq(trials.organizationId, input.organizationId),
          eq(trials.id, input.trialId),
          eq(trials.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El trial cambió durante la conversión",
        409
      );
    }

    await tx.insert(trialStatusHistory).values({
      organizationId: input.organizationId,
      locationId: updated.locationId,
      trialId: updated.id,
      fromStatus: current.status,
      toStatus: "converted",
      effectiveAt: convertedAt,
      changedByMemberId: input.actor.memberId,
      idempotencyKey: input.idempotencyKey,
    });
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: updated.locationId,
      eventName,
      aggregateType: "trial",
      aggregateId: updated.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        trialId: updated.id,
        enrollmentId: enrollment.id,
        athleteId: updated.athleteId,
        targetLocationId: enrollment.locationId,
        classTemplateId: enrollment.classTemplateId,
        startsOn: enrollment.startsOn,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: updated.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "trial",
      targetId: updated.id,
      idempotencyKey: input.idempotencyKey,
      before: { status: current.status, version: current.version },
      after: {
        status: updated.status,
        version: updated.version,
        enrollmentId: enrollment.id,
      },
    });

    return { trial: updated, enrollment };
  });
}
