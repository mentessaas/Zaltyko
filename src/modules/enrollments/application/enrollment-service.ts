import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  classTemplates,
  enrollmentPauses,
  enrollmentStatusHistory,
  enrollments,
  locations,
  spaces,
  type Enrollment,
} from "@/db/zaltyko-schema";
import {
  canTransitionEnrollment,
  enrollmentStatusSchema,
} from "@/modules/enrollments/domain/contracts";
import { calculateEffectiveCapacity } from "@/modules/scheduling/domain/capacity";
import type { TransactionClient } from "@/lib/db-transactions";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCapacity,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const commandKeySchema = z.string().trim().min(8).max(180);
const privilegedRoles = ["owner", "manager", "admin"] as const;
const openEnrollmentStatuses = [
  "pending",
  "trial",
  "active",
  "paused",
] as const;

const createEnrollmentSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  athleteId: z.string().uuid(),
  classTemplateId: z.string().uuid(),
  pricePlanId: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "trial", "active"]),
  startsOn: z.string().date(),
  source: z.enum([
    "import",
    "owner",
    "parent",
    "trial",
    "waitlist",
    "transfer",
    "api",
  ]),
  sourceEntityId: z.string().uuid().nullable().optional(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const transitionEnrollmentSchema = z.object({
  organizationId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  toStatus: enrollmentStatusSchema,
  effectiveOn: z.string().date(),
  reasonCode: z.string().trim().min(1).max(80).nullable().optional(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const transferEnrollmentCommandSchema = z.object({
  organizationId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  targetLocationId: z.string().uuid(),
  targetClassTemplateId: z.string().uuid(),
  startsOn: z.string().date(),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

export type CreateEnrollmentCommand = z.infer<typeof createEnrollmentSchema>;
export type TransitionEnrollmentCommand = z.infer<
  typeof transitionEnrollmentSchema
>;
export type TransferEnrollmentCommand = z.infer<
  typeof transferEnrollmentCommandSchema
>;

function creationEventName(status: CreateEnrollmentCommand["status"]): string {
  if (status === "active") return "enrollment.activated";
  if (status === "trial") return "enrollment.trial_started";
  return "enrollment.requested";
}

function transitionEventName(
  status: TransitionEnrollmentCommand["toStatus"]
): string {
  switch (status) {
    case "active":
      return "enrollment.activated";
    case "paused":
      return "enrollment.paused";
    case "cancelled":
      return "enrollment.cancelled";
    case "completed":
      return "enrollment.completed";
    case "trial":
      return "enrollment.trial_started";
    case "pending":
      return "enrollment.requested";
  }
}

async function loadEnrollment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  enrollmentId: string
): Promise<Enrollment> {
  const [enrollment] = await tx
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, organizationId),
        eq(enrollments.id, enrollmentId)
      )
    )
    .limit(1);

  if (!enrollment) {
    throw new OperationalError("NOT_FOUND", "Inscripción no encontrada", 404);
  }

  return enrollment;
}

async function loadIdempotentEnrollment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    organizationId: string;
    eventName: string;
    idempotencyKey: string;
    expectedPayload: Record<string, string | number | boolean | null>;
  }
): Promise<Enrollment | null> {
  const event = await findOutboxEvent(tx, input);
  if (event) {
    assertIdempotencyPayload(event.payload, input.expectedPayload);
  }
  const enrollmentId = event?.payload.enrollmentId;
  if (typeof enrollmentId !== "string") return null;
  return loadEnrollment(tx, input.organizationId, enrollmentId);
}

async function assertEffectiveDateNotFuture(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    organizationId: string;
    locationId: string;
    effectiveOn: string;
  }
): Promise<void> {
  const [location] = await tx
    .select({
      localDate: sql<string>`(current_timestamp at time zone ${locations.timezone})::date::text`,
    })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.id, input.locationId)
      )
    )
    .limit(1);

  if (!location) {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }
  if (input.effectiveOn > location.localDate) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "Las transiciones futuras requieren un comando programado",
      409
    );
  }
}

async function assertTemplateCapacity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    organizationId: string;
    locationId: string;
    classTemplateId: string;
    athleteId: string;
    startsOn: string;
  }
): Promise<void> {
  await lockCapacity(tx, input.organizationId, input.classTemplateId);

  const [template] = await tx
    .select({
      id: classTemplates.id,
      locationId: classTemplates.locationId,
      status: classTemplates.status,
      templateCapacity: classTemplates.capacity,
      effectiveFrom: classTemplates.effectiveFrom,
      effectiveTo: classTemplates.effectiveTo,
      spaceCapacity: spaces.capacity,
      locationIsActive: locations.isActive,
    })
    .from(classTemplates)
    .innerJoin(
      locations,
      and(
        eq(locations.organizationId, classTemplates.organizationId),
        eq(locations.id, classTemplates.locationId)
      )
    )
    .leftJoin(
      spaces,
      and(
        eq(spaces.organizationId, classTemplates.organizationId),
        eq(spaces.id, classTemplates.defaultSpaceId),
        eq(spaces.locationId, classTemplates.locationId)
      )
    )
    .where(
      and(
        eq(classTemplates.organizationId, input.organizationId),
        eq(classTemplates.id, input.classTemplateId)
      )
    )
    .limit(1);

  if (!template || template.status !== "active" || !template.locationIsActive) {
    throw new OperationalError(
      "NOT_FOUND",
      "Plantilla de clase activa no encontrada",
      404
    );
  }
  if (template.locationId !== input.locationId) {
    throw new OperationalError(
      "INVALID_RELATION",
      "La plantilla no pertenece a la sede indicada",
      409
    );
  }
  if (
    input.startsOn < template.effectiveFrom ||
    (template.effectiveTo !== null && input.startsOn > template.effectiveTo)
  ) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha de inicio queda fuera del periodo de la clase",
      409
    );
  }

  const [existing] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.classTemplateId, input.classTemplateId),
        eq(enrollments.athleteId, input.athleteId),
        inArray(enrollments.status, openEnrollmentStatuses)
      )
    )
    .limit(1);

  if (existing) {
    throw new OperationalError(
      "DUPLICATE_OPEN_ENROLLMENT",
      "El atleta ya tiene una inscripción abierta en esta clase",
      409
    );
  }

  const [occupancy] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.classTemplateId, input.classTemplateId),
        inArray(enrollments.status, openEnrollmentStatuses)
      )
    );

  const effectiveCapacity = calculateEffectiveCapacity({
    templateCapacity: template.templateCapacity,
    spaceCapacity: template.spaceCapacity,
  });

  if (Number(occupancy?.count ?? 0) >= effectiveCapacity) {
    throw new OperationalError(
      "CAPACITY_FULL",
      "La clase no tiene plazas disponibles",
      409
    );
  }
}

export async function createEnrollmentInTransaction(
  tx: TransactionClient,
  command: CreateEnrollmentCommand
): Promise<Enrollment> {
  const input = createEnrollmentSchema.parse(command);
  const eventName = creationEventName(input.status);

  await lockCommand(tx, input.organizationId, input.idempotencyKey);

  const idempotent = await loadIdempotentEnrollment(tx, {
    organizationId: input.organizationId,
    eventName,
    idempotencyKey: input.idempotencyKey,
    expectedPayload: {
      athleteId: input.athleteId,
      classTemplateId: input.classTemplateId,
      status: input.status,
      startsOn: input.startsOn,
      source: input.source,
    },
  });
  if (idempotent) {
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: idempotent.locationId,
      actor: input.actor,
      allowedRoles: privilegedRoles,
    });
    return idempotent;
  }

  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: privilegedRoles,
  });

  const [athlete] = await tx
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(
        eq(athletes.organizationId, input.organizationId),
        eq(athletes.id, input.athleteId),
        eq(athletes.isActive, true)
      )
    )
    .limit(1);
  if (!athlete) {
    throw new OperationalError("NOT_FOUND", "Atleta activo no encontrado", 404);
  }

  await assertTemplateCapacity(tx, input);

  const [enrollment] = await tx
    .insert(enrollments)
    .values({
      organizationId: input.organizationId,
      locationId: input.locationId,
      athleteId: input.athleteId,
      classTemplateId: input.classTemplateId,
      pricePlanId: input.pricePlanId ?? null,
      status: input.status,
      startsOn: input.startsOn,
      source: input.source,
      sourceEntityId: input.sourceEntityId ?? null,
    })
    .returning();

  await tx.insert(enrollmentStatusHistory).values({
    organizationId: input.organizationId,
    enrollmentId: enrollment.id,
    fromStatus: null,
    toStatus: input.status,
    changedByMemberId: input.actor.memberId,
    idempotencyKey: input.idempotencyKey,
    effectiveOn: input.startsOn,
  });

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    eventName,
    aggregateType: "enrollment",
    aggregateId: enrollment.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      enrollmentId: enrollment.id,
      athleteId: enrollment.athleteId,
      classTemplateId: enrollment.classTemplateId,
      status: enrollment.status,
      startsOn: enrollment.startsOn,
      source: enrollment.source,
    },
  });

  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.actor.userId,
    action: eventName,
    targetType: "enrollment",
    targetId: enrollment.id,
    idempotencyKey: input.idempotencyKey,
    after: {
      status: enrollment.status,
      classTemplateId: enrollment.classTemplateId,
      startsOn: enrollment.startsOn,
      version: enrollment.version,
    },
  });

  return enrollment;
}

export async function createEnrollment(
  command: CreateEnrollmentCommand
): Promise<Enrollment> {
  return db.transaction((tx) => createEnrollmentInTransaction(tx, command));
}

export async function transitionEnrollmentInTransaction(
  tx: TransactionClient,
  command: TransitionEnrollmentCommand
): Promise<Enrollment> {
  const input = transitionEnrollmentSchema.parse(command);
  const eventName = transitionEventName(input.toStatus);

  await lockCommand(tx, input.organizationId, input.idempotencyKey);
  await tx.execute(
    sql`select id from zaltyko.enrollments where organization_id = ${input.organizationId}::uuid and id = ${input.enrollmentId}::uuid for update`
  );

  const current = await loadEnrollment(
    tx,
    input.organizationId,
    input.enrollmentId
  );
  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: current.locationId,
    actor: input.actor,
    allowedRoles: privilegedRoles,
  });

  const idempotent = await loadIdempotentEnrollment(tx, {
    organizationId: input.organizationId,
    eventName,
    idempotencyKey: input.idempotencyKey,
    expectedPayload: {
      enrollmentId: input.enrollmentId,
      toStatus: input.toStatus,
      effectiveOn: input.effectiveOn,
    },
  });
  if (idempotent) return idempotent;

  const changesReservedEnrollmentAtStart =
    current.status === "pending" &&
    (input.toStatus === "active" ||
      input.toStatus === "trial" ||
      input.toStatus === "cancelled") &&
    input.effectiveOn === current.startsOn;
  if (!changesReservedEnrollmentAtStart) {
    await assertEffectiveDateNotFuture(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      effectiveOn: input.effectiveOn,
    });
  }

  if (current.version !== input.expectedVersion) {
    throw new OperationalError(
      "VERSION_CONFLICT",
      "La inscripción cambió desde la última lectura",
      409
    );
  }
  if (!canTransitionEnrollment(current.status, input.toStatus)) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      `No se puede pasar de ${current.status} a ${input.toStatus}`,
      409
    );
  }
  if (input.effectiveOn < current.startsOn) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha efectiva no puede ser anterior al inicio de la inscripción",
      409
    );
  }

  const closesEnrollment =
    input.toStatus === "cancelled" || input.toStatus === "completed";
  const [updated] = await tx
    .update(enrollments)
    .set({
      status: input.toStatus,
      endsOn: closesEnrollment ? input.effectiveOn : current.endsOn,
      version: sql`${enrollments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.id, input.enrollmentId),
        eq(enrollments.version, input.expectedVersion)
      )
    )
    .returning();

  if (!updated) {
    throw new OperationalError(
      "VERSION_CONFLICT",
      "La inscripción cambió durante la operación",
      409
    );
  }

  if (input.toStatus === "paused") {
    await tx.insert(enrollmentPauses).values({
      organizationId: input.organizationId,
      enrollmentId: updated.id,
      startsOn: input.effectiveOn,
      reasonCode: input.reasonCode ?? null,
    });
  } else if (current.status === "paused") {
    const [openPause] = await tx
      .select()
      .from(enrollmentPauses)
      .where(
        and(
          eq(enrollmentPauses.organizationId, input.organizationId),
          eq(enrollmentPauses.enrollmentId, updated.id),
          isNull(enrollmentPauses.endsOn)
        )
      )
      .orderBy(desc(enrollmentPauses.startsOn))
      .limit(1);
    if (openPause) {
      await tx
        .update(enrollmentPauses)
        .set({ endsOn: input.effectiveOn })
        .where(eq(enrollmentPauses.id, openPause.id));
    }
  }

  await tx.insert(enrollmentStatusHistory).values({
    organizationId: input.organizationId,
    enrollmentId: updated.id,
    fromStatus: current.status,
    toStatus: updated.status,
    reasonCode: input.reasonCode ?? null,
    changedByMemberId: input.actor.memberId,
    idempotencyKey: input.idempotencyKey,
    effectiveOn: input.effectiveOn,
  });

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: updated.locationId,
    eventName,
    aggregateType: "enrollment",
    aggregateId: updated.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      enrollmentId: updated.id,
      fromStatus: current.status,
      toStatus: updated.status,
      effectiveOn: input.effectiveOn,
      reasonCode: input.reasonCode ?? null,
      version: updated.version,
    },
  });

  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: updated.locationId,
    actorUserId: input.actor.userId,
    action: eventName,
    targetType: "enrollment",
    targetId: updated.id,
    idempotencyKey: input.idempotencyKey,
    before: { status: current.status, version: current.version },
    after: { status: updated.status, version: updated.version },
    metadata: { reasonCode: input.reasonCode ?? null },
  });

  return updated;
}

export async function transitionEnrollment(
  command: TransitionEnrollmentCommand
): Promise<Enrollment> {
  return db.transaction((tx) => transitionEnrollmentInTransaction(tx, command));
}

export async function transferEnrollment(
  command: TransferEnrollmentCommand
): Promise<{ source: Enrollment; target: Enrollment }> {
  const input = transferEnrollmentCommandSchema.parse(command);
  const eventName = "enrollment.transferred";

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);

    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName,
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, {
        sourceEnrollmentId: input.enrollmentId,
        targetLocationId: input.targetLocationId,
        targetClassTemplateId: input.targetClassTemplateId,
        startsOn: input.startsOn,
      });
      const sourceId = priorEvent.payload.sourceEnrollmentId;
      const targetId = priorEvent.payload.targetEnrollmentId;
      if (typeof sourceId === "string" && typeof targetId === "string") {
        const source = await loadEnrollment(tx, input.organizationId, sourceId);
        const target = await loadEnrollment(tx, input.organizationId, targetId);
        await assertOperationalAccess(tx, {
          organizationId: input.organizationId,
          locationId: source.locationId,
          actor: input.actor,
          allowedRoles: privilegedRoles,
        });
        await assertOperationalAccess(tx, {
          organizationId: input.organizationId,
          locationId: target.locationId,
          actor: input.actor,
          allowedRoles: privilegedRoles,
        });
        return { source, target };
      }
    }

    await tx.execute(
      sql`select id from zaltyko.enrollments where organization_id = ${input.organizationId}::uuid and id = ${input.enrollmentId}::uuid for update`
    );
    const current = await loadEnrollment(
      tx,
      input.organizationId,
      input.enrollmentId
    );

    if (
      !openEnrollmentStatuses.includes(
        current.status as (typeof openEnrollmentStatuses)[number]
      )
    ) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "Solo una inscripción abierta puede transferirse",
        409
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La inscripción cambió desde la última lectura",
        409
      );
    }
    if (current.classTemplateId === input.targetClassTemplateId) {
      throw new OperationalError(
        "INVALID_RELATION",
        "La clase destino debe ser diferente",
        409
      );
    }
    if (input.startsOn < current.startsOn) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "La transferencia no puede comenzar antes que la inscripción origen",
        409
      );
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      actor: input.actor,
      allowedRoles: privilegedRoles,
    });
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      actor: input.actor,
      allowedRoles: privilegedRoles,
    });
    await assertEffectiveDateNotFuture(tx, {
      organizationId: input.organizationId,
      locationId: current.locationId,
      effectiveOn: input.startsOn,
    });
    await assertEffectiveDateNotFuture(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      effectiveOn: input.startsOn,
    });
    await assertTemplateCapacity(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      classTemplateId: input.targetClassTemplateId,
      athleteId: current.athleteId,
      startsOn: input.startsOn,
    });

    const [source] = await tx
      .update(enrollments)
      .set({
        status: "completed",
        endsOn: input.startsOn,
        version: sql`${enrollments.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(enrollments.organizationId, input.organizationId),
          eq(enrollments.id, current.id),
          eq(enrollments.version, input.expectedVersion)
        )
      )
      .returning();

    if (!source) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "La inscripción cambió durante la transferencia",
        409
      );
    }

    if (current.status === "paused") {
      const [openPause] = await tx
        .select()
        .from(enrollmentPauses)
        .where(
          and(
            eq(enrollmentPauses.organizationId, input.organizationId),
            eq(enrollmentPauses.enrollmentId, source.id),
            isNull(enrollmentPauses.endsOn)
          )
        )
        .orderBy(desc(enrollmentPauses.startsOn))
        .limit(1);
      if (openPause) {
        await tx
          .update(enrollmentPauses)
          .set({ endsOn: input.startsOn })
          .where(eq(enrollmentPauses.id, openPause.id));
      }
    }

    const targetStatus =
      current.status === "pending" ? "pending" : current.status;
    const [target] = await tx
      .insert(enrollments)
      .values({
        organizationId: input.organizationId,
        locationId: input.targetLocationId,
        athleteId: current.athleteId,
        classTemplateId: input.targetClassTemplateId,
        pricePlanId: current.pricePlanId,
        status: targetStatus,
        startsOn: input.startsOn,
        source: "transfer",
        sourceEntityId: source.id,
      })
      .returning();

    if (target.status === "paused") {
      await tx.insert(enrollmentPauses).values({
        organizationId: input.organizationId,
        enrollmentId: target.id,
        startsOn: input.startsOn,
        reasonCode: "transfer",
      });
    }

    await tx.insert(enrollmentStatusHistory).values([
      {
        organizationId: input.organizationId,
        enrollmentId: source.id,
        fromStatus: current.status,
        toStatus: "completed",
        reasonCode: "transfer",
        changedByMemberId: input.actor.memberId,
        idempotencyKey: `${input.idempotencyKey}:source`,
        effectiveOn: input.startsOn,
      },
      {
        organizationId: input.organizationId,
        enrollmentId: target.id,
        fromStatus: null,
        toStatus: target.status,
        reasonCode: "transfer",
        changedByMemberId: input.actor.memberId,
        idempotencyKey: `${input.idempotencyKey}:target`,
        effectiveOn: input.startsOn,
      },
    ]);

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      eventName,
      aggregateType: "enrollment",
      aggregateId: target.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        sourceEnrollmentId: source.id,
        targetEnrollmentId: target.id,
        athleteId: target.athleteId,
        sourceClassTemplateId: source.classTemplateId,
        targetClassTemplateId: target.classTemplateId,
        targetLocationId: target.locationId,
        targetStatus: target.status,
        startsOn: target.startsOn,
      },
    });

    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.targetLocationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "enrollment",
      targetId: target.id,
      idempotencyKey: input.idempotencyKey,
      before: {
        sourceEnrollmentId: current.id,
        sourceStatus: current.status,
        sourceVersion: current.version,
      },
      after: {
        sourceStatus: source.status,
        sourceVersion: source.version,
        targetEnrollmentId: target.id,
        targetStatus: target.status,
      },
    });

    return { source, target };
  });
}
