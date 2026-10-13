import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  locations,
  organizations,
  outboxEvents,
  pricePlans,
} from "@/db/zaltyko-schema";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  amountCents: z.number().int().safe().positive(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  idempotencyKey: z.string().trim().min(8).max(180),
  actor: z.object({ userId: z.string().uuid(), memberId: z.string().uuid() }),
});

export type CreateMonthlyPricePlanInput = z.infer<typeof inputSchema>;

export async function createMonthlyPricePlan(
  command: CreateMonthlyPricePlanInput
) {
  const input = inputSchema.parse(command);

  return db.transaction(async (tx) => {
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      allowedRoles: ["owner", "admin"],
    });

    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, input.organizationId),
          eq(locations.id, input.locationId),
          eq(locations.isActive, true)
        )
      )
      .limit(1);
    const [organization] = await tx
      .select({
        id: organizations.id,
        defaultCurrency: organizations.defaultCurrency,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (!location || !organization) {
      throw new OperationalError(
        "NOT_FOUND",
        "Academia o sede no encontrada",
        404
      );
    }

    const currency = input.currency ?? organization.defaultCurrency;
    const eventName = "billing.monthly_price_plan_created";
    await lockCommand(
      tx,
      input.organizationId,
      `${eventName}:${input.idempotencyKey}`
    );
    const [prior] = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, input.organizationId),
          eq(outboxEvents.eventName, eventName),
          eq(outboxEvents.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);

    const expected = {
      locationId: input.locationId,
      planLabel: input.name,
      amountCents: input.amountCents,
      currency,
      cadence: "monthly",
      isActive: true,
    };
    if (prior) {
      assertIdempotencyPayload(prior.payload, expected);
      const pricePlanId = prior.payload.pricePlanId;
      if (typeof pricePlanId !== "string") {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La tarifa mensual anterior no está disponible",
          409
        );
      }
      const [pricePlan] = await tx
        .select()
        .from(pricePlans)
        .where(
          and(
            eq(pricePlans.organizationId, input.organizationId),
            eq(pricePlans.id, pricePlanId)
          )
        )
        .limit(1);
      if (!pricePlan) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La tarifa mensual anterior no está disponible",
          409
        );
      }
      return { pricePlan, replayed: true };
    }

    const [pricePlan] = await tx
      .insert(pricePlans)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        cadence: "monthly",
        amountCents: input.amountCents,
        currency,
        isActive: true,
      })
      .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName,
      aggregateType: "price_plan",
      aggregateId: pricePlan.id,
      idempotencyKey: input.idempotencyKey,
      payload: { ...expected, pricePlanId: pricePlan.id },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: eventName,
      targetType: "price_plan",
      targetId: pricePlan.id,
      idempotencyKey: `${input.idempotencyKey}:audit`,
      after: {
        planLabel: pricePlan.name,
        amountCents: pricePlan.amountCents,
        currency: pricePlan.currency,
        cadence: pricePlan.cadence,
        isActive: pricePlan.isActive,
      },
    });

    return { pricePlan, replayed: false };
  });
}
