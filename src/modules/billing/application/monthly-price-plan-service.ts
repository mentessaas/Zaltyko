import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  classTemplates,
  locations,
  organizations,
  outboxEvents,
  pricePlans,
  pricePlanClassTemplateCoverage,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const coverageInputSchema = z
  .object({
    classTemplateIds: z.array(z.string().uuid()).min(1).max(100),
    startsOn: z.string().date(),
    endsOn: z.string().date().nullable(),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (
      new Set(coverage.classTemplateIds).size !==
      coverage.classTemplateIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classTemplateIds"],
        message: "No repitas una plantilla en la cobertura.",
      });
    }
    if (coverage.endsOn && coverage.endsOn < coverage.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "La fecha final no puede ser anterior a la inicial.",
      });
    }
  });

const inputSchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    amountCents: z.number().int().safe().positive().max(2_147_483_647),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    coverage: coverageInputSchema,
    idempotencyKey: z.string().trim().min(8).max(180),
    actor: z.object({ userId: z.string().uuid(), memberId: z.string().uuid() }),
  })
  .strict();

export type CreateMonthlyPricePlanInput = z.infer<typeof inputSchema>;

type CanonicalCoverage = {
  classTemplateId: string;
  startsOn: string;
  endsOn: string | null;
};

async function loadPricePlanCoverage(
  tx: TransactionClient,
  organizationId: string,
  locationId: string,
  pricePlanId: string
): Promise<CanonicalCoverage[]> {
  const rows = await tx
    .select({
      classTemplateId: pricePlanClassTemplateCoverage.classTemplateId,
      startsOn: pricePlanClassTemplateCoverage.startsOn,
      endsOn: pricePlanClassTemplateCoverage.endsOn,
    })
    .from(pricePlanClassTemplateCoverage)
    .where(
      and(
        eq(pricePlanClassTemplateCoverage.organizationId, organizationId),
        eq(pricePlanClassTemplateCoverage.locationId, locationId),
        eq(pricePlanClassTemplateCoverage.pricePlanId, pricePlanId)
      )
    )
    .orderBy(asc(pricePlanClassTemplateCoverage.classTemplateId));
  return rows;
}

function canonicalCoverage(
  input: CreateMonthlyPricePlanInput["coverage"]
): CanonicalCoverage[] {
  return [...input.classTemplateIds].sort().map((classTemplateId) => ({
    classTemplateId,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
  }));
}

function assertCoverageMatches(
  actual: CanonicalCoverage[],
  expected: CanonicalCoverage[]
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new OperationalError(
      "IDEMPOTENCY_CONFLICT",
      "La cobertura de la tarifa mensual anterior ya no coincide.",
      409
    );
  }
}

export async function createMonthlyPricePlan(
  command: CreateMonthlyPricePlanInput
) {
  const input = inputSchema.parse(command);
  const coverage = canonicalCoverage(input.coverage);

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
    const coverageFingerprint = JSON.stringify(coverage);
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
      coverageFingerprint,
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
      const storedCoverage = await loadPricePlanCoverage(
        tx,
        input.organizationId,
        input.locationId,
        pricePlan.id
      );
      assertCoverageMatches(storedCoverage, coverage);
      return { pricePlan, coverage: storedCoverage, replayed: true };
    }

    const lockedLocation = await tx.execute(sql`
      select id from zaltyko.locations
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.locationId}::uuid
        and is_active = true
      for update
    `);
    if (lockedLocation.rows.length === 0) {
      throw new OperationalError(
        "NOT_FOUND",
        "Academia o sede no encontrada",
        404
      );
    }

    const templateRows = await tx
      .select({
        id: classTemplates.id,
        status: classTemplates.status,
        effectiveFrom: classTemplates.effectiveFrom,
        effectiveTo: classTemplates.effectiveTo,
      })
      .from(classTemplates)
      .where(
        and(
          eq(classTemplates.organizationId, input.organizationId),
          eq(classTemplates.locationId, input.locationId),
          inArray(
            classTemplates.id,
            coverage.map((item) => item.classTemplateId)
          )
        )
      )
      .orderBy(asc(classTemplates.id))
      .for("update");
    if (
      templateRows.length !== coverage.length ||
      templateRows.some((template) => template.status !== "active")
    ) {
      throw new OperationalError(
        "NOT_FOUND",
        "Una o más plantillas activas no pertenecen a esta sede.",
        404
      );
    }
    if (
      templateRows.some(
        (template) =>
          (template.effectiveTo !== null &&
            input.coverage.startsOn > template.effectiveTo) ||
          (input.coverage.endsOn !== null &&
            input.coverage.endsOn < template.effectiveFrom)
      )
    ) {
      throw new OperationalError(
        "INVALID_DATE_RANGE",
        "El periodo de cobertura no coincide con la vigencia de las plantillas.",
        422
      );
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

    const insertedCoverage = await tx
      .insert(pricePlanClassTemplateCoverage)
      .values(
        coverage.map((item) => ({
          organizationId: input.organizationId,
          locationId: input.locationId,
          pricePlanId: pricePlan.id,
          classTemplateId: item.classTemplateId,
          startsOn: item.startsOn,
          endsOn: item.endsOn,
        }))
      )
      .returning({
        classTemplateId: pricePlanClassTemplateCoverage.classTemplateId,
        startsOn: pricePlanClassTemplateCoverage.startsOn,
        endsOn: pricePlanClassTemplateCoverage.endsOn,
      });
    const canonicalInsertedCoverage = [...insertedCoverage].sort(
      (left, right) => left.classTemplateId.localeCompare(right.classTemplateId)
    );
    assertCoverageMatches(canonicalInsertedCoverage, coverage);

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName,
      aggregateType: "price_plan",
      aggregateId: pricePlan.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        ...expected,
        coverage,
        pricePlanId: pricePlan.id,
      },
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
        coverage: canonicalInsertedCoverage,
      },
    });

    return { pricePlan, coverage: canonicalInsertedCoverage, replayed: false };
  });
}
