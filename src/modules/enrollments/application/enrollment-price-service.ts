import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  enrollmentPriceAssignments,
  enrollments,
  locations,
  pricePlans,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const priceAssignmentRoles = ["owner", "admin", "manager"] as const;

export type EnrollmentPriceAssignment = typeof enrollmentPriceAssignments.$inferSelect;

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

async function syncCurrentPricePointer(
  tx: TransactionClient,
  input: { organizationId: string; locationId: string; enrollmentId: string }
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

  const [currentAssignment] = await tx
    .select({ pricePlanId: enrollmentPriceAssignments.pricePlanId })
    .from(enrollmentPriceAssignments)
    .where(
      and(
        eq(enrollmentPriceAssignments.organizationId, input.organizationId),
        eq(enrollmentPriceAssignments.enrollmentId, input.enrollmentId),
        sql`${enrollmentPriceAssignments.startsOn} <= ${location.localDate}::date`,
        sql`(${enrollmentPriceAssignments.endsOn} is null or ${enrollmentPriceAssignments.endsOn} >= ${location.localDate}::date)`
      )
    )
    .limit(1);

  await tx
    .update(enrollments)
    .set({ pricePlanId: currentAssignment?.pricePlanId ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.id, input.enrollmentId)
      )
    );
}

export async function assignEnrollmentPriceInTransaction(
  tx: TransactionClient,
  input: {
    organizationId: string;
    locationId: string;
    enrollmentId: string;
    pricePlanId: string;
    startsOn: string;
    actor: OperationalActor;
    idempotencyKey: string;
  }
): Promise<EnrollmentPriceAssignment> {
  await lockCommand(
    tx,
    input.organizationId,
    `enrollment-price:${input.idempotencyKey}`
  );

  const priorEvent = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName: "enrollment.price_assigned",
    idempotencyKey: input.idempotencyKey,
  });
  if (priorEvent) {
    assertIdempotencyPayload(priorEvent.payload, {
      enrollmentId: input.enrollmentId,
      pricePlanId: input.pricePlanId,
      startsOn: input.startsOn,
    });
    const assignmentId = priorEvent.payload.assignmentId;
    if (typeof assignmentId !== "string") {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "Asignación de tarifa previa inválida",
        409
      );
    }
    const [prior] = await tx
      .select()
      .from(enrollmentPriceAssignments)
      .where(
        and(
          eq(enrollmentPriceAssignments.organizationId, input.organizationId),
          eq(enrollmentPriceAssignments.id, assignmentId)
        )
      )
      .limit(1);
    if (!prior) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "Asignación de tarifa previa no encontrada",
        409
      );
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: prior.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: priceAssignmentRoles,
    });
    return prior;
  }

  await tx.execute(sql`
    select id from zaltyko.enrollments
    where organization_id = ${input.organizationId}::uuid
      and location_id = ${input.locationId}::uuid
      and id = ${input.enrollmentId}::uuid
    for update
  `);

  const [enrollment] = await tx
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.locationId, input.locationId),
        eq(enrollments.id, input.enrollmentId)
      )
    )
    .limit(1);
  if (!enrollment) {
    throw new OperationalError("NOT_FOUND", "Inscripción no encontrada", 404);
  }
  if (input.startsOn < enrollment.startsOn) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La tarifa no puede empezar antes de la inscripción.",
      422
    );
  }

  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: enrollment.locationId,
    actor: input.actor,
    intent: "write",
    allowedRoles: priceAssignmentRoles,
  });

  const [plan] = await tx
    .select()
    .from(pricePlans)
    .where(
      and(
        eq(pricePlans.organizationId, input.organizationId),
        eq(pricePlans.id, input.pricePlanId),
        eq(pricePlans.isActive, true),
        eq(pricePlans.cadence, "monthly")
      )
    )
    .limit(1);
  if (!plan) {
    throw new OperationalError(
      "PRICE_PLAN_NOT_AVAILABLE",
      "Elige una tarifa mensual activa de esta academia.",
      422
    );
  }

  const [openAssignment] = await tx
    .select()
    .from(enrollmentPriceAssignments)
    .where(
      and(
        eq(enrollmentPriceAssignments.organizationId, input.organizationId),
        eq(enrollmentPriceAssignments.enrollmentId, input.enrollmentId),
        isNull(enrollmentPriceAssignments.endsOn)
      )
    )
    .limit(1);

  if (openAssignment?.startsOn === input.startsOn) {
    if (
      openAssignment.pricePlanId === plan.id &&
      openAssignment.unitAmountCents === plan.amountCents &&
      openAssignment.currency === plan.currency
    ) {
      throw new OperationalError(
        "PRICE_ASSIGNMENT_EXISTS",
        "Esta tarifa ya está asignada desde esa fecha.",
        409
      );
    }
    throw new OperationalError(
      "PRICE_ASSIGNMENT_DATE_CONFLICT",
      "La fecha coincide con otra asignación. Elige una fecha posterior.",
      409
    );
  }

  if (openAssignment && input.startsOn <= openAssignment.startsOn) {
    throw new OperationalError(
      "PRICE_ASSIGNMENT_DATE_CONFLICT",
      "La nueva tarifa debe empezar después de la asignación vigente.",
      409
    );
  }

  const [futureAssignment] = await tx
    .select({ id: enrollmentPriceAssignments.id })
    .from(enrollmentPriceAssignments)
    .where(
      and(
        eq(enrollmentPriceAssignments.organizationId, input.organizationId),
        eq(enrollmentPriceAssignments.enrollmentId, input.enrollmentId),
        sql`${enrollmentPriceAssignments.startsOn} >= ${input.startsOn}`
      )
    )
    .limit(1);
  if (futureAssignment) {
    throw new OperationalError(
      "PRICE_ASSIGNMENT_DATE_CONFLICT",
      "Ya existe una tarifa efectiva en esa fecha o después.",
      409
    );
  }

  if (openAssignment) {
    await tx
      .update(enrollmentPriceAssignments)
      .set({ endsOn: previousDate(input.startsOn), updatedAt: new Date() })
      .where(
        and(
          eq(enrollmentPriceAssignments.organizationId, input.organizationId),
          eq(enrollmentPriceAssignments.id, openAssignment.id)
        )
      );
  }

  const [assignment] = await tx
    .insert(enrollmentPriceAssignments)
    .values({
      organizationId: input.organizationId,
      locationId: input.locationId,
      enrollmentId: input.enrollmentId,
      pricePlanId: plan.id,
      unitAmountCents: plan.amountCents,
      currency: plan.currency,
      startsOn: input.startsOn,
    })
    .returning();

  await syncCurrentPricePointer(tx, input);

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    eventName: "enrollment.price_assigned",
    aggregateType: "enrollment",
    aggregateId: input.enrollmentId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      enrollmentId: input.enrollmentId,
      assignmentId: assignment.id,
      pricePlanId: plan.id,
      startsOn: input.startsOn,
      unitAmountCents: plan.amountCents,
      currency: plan.currency,
    },
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.actor.userId,
    action: "enrollment.price_assigned",
    targetType: "enrollment",
    targetId: input.enrollmentId,
    idempotencyKey: input.idempotencyKey,
    after: {
      assignmentId: assignment.id,
      pricePlanId: plan.id,
      startsOn: input.startsOn,
      unitAmountCents: plan.amountCents,
      currency: plan.currency,
    },
  });
  return assignment;
}

export async function assignEnrollmentPrice(input: {
  organizationId: string;
  locationId: string;
  enrollmentId: string;
  pricePlanId: string;
  startsOn: string;
  actor: OperationalActor;
  idempotencyKey: string;
}): Promise<EnrollmentPriceAssignment> {
  return db.transaction((tx) => assignEnrollmentPriceInTransaction(tx, input));
}
