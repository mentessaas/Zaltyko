import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  charges,
  financialReconciliationRuns,
  invoiceLines,
  invoiceLineEnrollments,
  invoices,
  paymentAllocations,
  paymentAttempts,
  paymentProviderEvents,
  payments,
  refunds,
  type Charge,
  type FinancialReconciliationRun,
  type Invoice,
  type Payment,
  type PaymentAllocation,
  type PaymentProviderEvent,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  FAMILY_COLLECTION_JOB_KEY,
  operationalActorSchema,
} from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { FAMILY_AUTOMATIC_COLLECTION_DISABLED } from "@/lib/stripe/family-automatic-collection-disabled";
import {
  getChargeCollectionModeSnapshot,
  isFamilyAutomaticCollectionOpen,
} from "@/modules/billing/application/charge-collection-mode";
import { lockOrganizationForSaasMutation } from "@/modules/saas-billing/application/entitlement-service";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  findOutboxEvent,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const commandKeySchema = z.string().trim().min(8).max(150);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const financialRoles = ["owner", "admin"] as const;

const invoiceLineCoverageSchema = z
  .object({
    enrollmentId: z.guid(),
    classTemplateId: z.guid(),
    className: z.string().trim().min(2).max(120),
    assignmentId: z.guid(),
  })
  .strict();

const invoiceLineSchema = z
  .object({
    athleteId: z.guid().optional(),
    coveredEnrollments: z.array(invoiceLineCoverageSchema).min(1).optional(),
    enrollmentId: z.guid().optional(),
    pricePlanId: z.guid().optional(),
    lineType: z.string().trim().min(1).max(80),
    quantity: z.number().int().positive().safe(),
    unitAmountCents: z.number().int().nonnegative().safe(),
    servicePeriodStart: z.string().date(),
    servicePeriodEnd: z.string().date(),
  })
  .superRefine((line, context) => {
    if (line.athleteId) {
      if (
        line.lineType !== "monthly_fee" ||
        line.enrollmentId !== undefined ||
        line.pricePlanId === undefined ||
        line.quantity !== 1 ||
        line.coveredEnrollments === undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["athleteId"],
          message:
            "La línea mensual por gimnasta requiere plan y cobertura explícita.",
        });
      }
      const start = new Date(`${line.servicePeriodStart}T00:00:00.000Z`);
      const expectedEnd = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
      )
        .toISOString()
        .slice(0, 10);
      if (line.servicePeriodEnd !== expectedEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["servicePeriodEnd"],
          message: "La línea mensual por gimnasta debe cubrir el mes completo.",
        });
      }
      const enrollmentIds = line.coveredEnrollments?.map(
        (enrollment) => enrollment.enrollmentId
      );
      if (
        enrollmentIds &&
        new Set(enrollmentIds).size !== enrollmentIds.length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["coveredEnrollments"],
          message: "La cobertura repite una inscripción.",
        });
      }
      for (const field of ["classTemplateId", "assignmentId"] as const) {
        const values = line.coveredEnrollments?.map(
          (enrollment) => enrollment[field]
        );
        if (values && new Set(values).size !== values.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["coveredEnrollments"],
            message: `La cobertura repite ${field}.`,
          });
        }
      }
    } else if (line.coveredEnrollments !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coveredEnrollments"],
        message:
          "La cobertura solo se admite en una línea mensual por gimnasta.",
      });
    }
  });

const issueInvoiceSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    familyId: z.guid(),
    familyPayerId: z.guid().optional(),
    reference: z.string().trim().min(1).max(80),
    currency: currencySchema,
    dueAt: z.string().datetime({ offset: true }),
    lines: z.array(invoiceLineSchema).min(1).max(100),
    idempotencyKey: commandKeySchema,
    actor: operationalActorSchema,
  })
  .superRefine((command, context) => {
    const athleteLines = command.lines.filter((line) => line.athleteId);
    const athleteIds = athleteLines.map((line) => line.athleteId!);
    if (new Set(athleteIds).size !== athleteIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "La factura repite una línea mensual para la misma gimnasta.",
      });
    }
    const coveredEnrollmentIds = athleteLines.flatMap(
      (line) =>
        line.coveredEnrollments?.map((covered) => covered.enrollmentId) ?? []
    );
    if (new Set(coveredEnrollmentIds).size !== coveredEnrollmentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "Una inscripción no puede quedar cubierta por dos líneas.",
      });
    }
  });

const allocatePaymentSchema = z.object({
  organizationId: z.guid(),
  paymentId: z.guid(),
  chargeId: z.guid(),
  amountCents: z.number().int().positive(),
  allocatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const recordManualPaymentSchema = z.object({
  organizationId: z.guid(),
  locationId: z.guid(),
  familyId: z.guid(),
  familyPayerId: z.guid().optional(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  method: z.enum(["cash", "bank_transfer", "card_terminal", "other"]),
  reference: z.string().trim().min(1).max(200).optional(),
  receivedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const recordManualPaymentForChargeSchema = z.object({
  organizationId: z.guid(),
  chargeId: z.guid(),
  amountCents: z.number().int().positive().safe(),
  method: z.enum(["cash", "bank_transfer", "card_terminal", "other"]),
  reference: z.string().trim().min(1).max(200).optional(),
  receivedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const reconcileFinancialPeriodSchema = z.object({
  organizationId: z.guid(),
  authorizationLocationId: z.guid(),
  currency: currencySchema,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  sourceWatermark: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const providerBasePayload = z.object({
  organizationId: z.guid(),
  locationId: z.guid(),
  familyId: z.guid(),
  familyPayerId: z.guid().optional(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
});

const providerPayloadSchema = z.discriminatedUnion("type", [
  providerBasePayload
    .extend({
      type: z.literal("payment.failed"),
      invoiceId: z.guid(),
      providerAttemptId: z.string().trim().min(1).max(200),
      failureCode: z.string().trim().min(1).max(80),
      attemptedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  providerBasePayload
    .extend({
      type: z.literal("payment.succeeded"),
      invoiceId: z.guid(),
      providerAttemptId: z.string().trim().min(1).max(200),
      providerPaymentId: z.string().trim().min(1).max(200),
      attemptedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal("refund.succeeded"),
      organizationId: z.guid(),
      paymentId: z.guid(),
      paymentAllocationId: z.guid(),
      amountCents: z.number().int().positive(),
      currency: currencySchema,
      providerRefundId: z.string().trim().min(1).max(200),
      reasonCode: z.string().trim().min(1).max(80),
      refundedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
]);

const processProviderEventSchema = z.object({
  processor: z.literal("local"),
  environment: z.literal("sandbox"),
  providerEventId: z.string().trim().min(1).max(200),
  signatureVerified: z.literal(true),
  payload: providerPayloadSchema,
});

export type IssueInvoiceCommand = z.infer<typeof issueInvoiceSchema>;
export type RecordManualPaymentCommand = z.infer<
  typeof recordManualPaymentSchema
>;
export type RecordManualPaymentForChargeCommand = z.infer<
  typeof recordManualPaymentForChargeSchema
>;
export type RecordedManualPayment = {
  payment: Payment;
  allocation: PaymentAllocation;
};
export type AllocatePaymentCommand = z.infer<typeof allocatePaymentSchema>;
export type ReconcileFinancialPeriodCommand = z.infer<
  typeof reconcileFinancialPeriodSchema
>;
export type ProcessProviderEventCommand = z.infer<
  typeof processProviderEventSchema
>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function numberFrom(value: unknown): number {
  return Number(value ?? 0);
}

async function loadInvoice(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<Invoice> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.id, invoiceId)
      )
    )
    .limit(1);
  if (!invoice)
    throw new OperationalError("NOT_FOUND", "Factura no encontrada", 404);
  return invoice;
}

async function loadCharge(
  tx: TransactionClient,
  organizationId: string,
  chargeId: string
): Promise<Charge> {
  const [charge] = await tx
    .select()
    .from(charges)
    .where(
      and(eq(charges.organizationId, organizationId), eq(charges.id, chargeId))
    )
    .limit(1);
  if (!charge)
    throw new OperationalError("NOT_FOUND", "Cargo no encontrado", 404);
  return charge;
}

async function loadPayment(
  tx: TransactionClient,
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.id, paymentId)
      )
    )
    .limit(1);
  if (!payment)
    throw new OperationalError("NOT_FOUND", "Pago no encontrado", 404);
  return payment;
}

async function applyPaymentAllocation(
  tx: TransactionClient,
  input: {
    organizationId: string;
    payment: Payment;
    charge: Charge;
    amountCents: number;
    allocatedAt: Date;
    idempotencyKey: string;
    /** Persona que registra; null para el proceso de cobro automático. */
    actorUserId: string | null;
    /**
     * `manual`: pago o reparto hecho por una persona; pasa por la comprobación
     * del cobro automático (guardManualAllocation). `automatic_collection`:
     * reparto del propio cobro automático, que hace su comprobación aparte.
     */
    origin: "manual" | "automatic_collection";
  }
): Promise<PaymentAllocation> {
  if (input.origin === "manual") {
    await guardManualAllocation(tx, {
      organizationId: input.organizationId,
      charge: input.charge,
      actorUserId: input.actorUserId,
    });
  }
  if (input.payment.currency !== input.charge.currency) {
    throw new OperationalError(
      "INVALID_RELATION",
      "Pago y cargo usan monedas distintas",
      422
    );
  }
  if (
    !(["succeeded", "partially_refunded"] as const).includes(
      input.payment.status as "succeeded"
    )
  ) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "El pago no está disponible",
      409
    );
  }

  const allocated = await tx.execute(sql`
    select
      coalesce((select sum(amount_cents) from zaltyko.payment_allocations
        where organization_id = ${input.organizationId}::uuid
          and payment_id = ${input.payment.id}::uuid), 0)::bigint as payment_allocated,
      coalesce((select sum(amount_cents) from zaltyko.payment_allocations
        where organization_id = ${input.organizationId}::uuid
          and charge_id = ${input.charge.id}::uuid), 0)::bigint as charge_allocated
  `);
  const paymentAllocated = numberFrom(allocated.rows[0]?.payment_allocated);
  const chargeAllocated = numberFrom(allocated.rows[0]?.charge_allocated);
  if (
    !Number.isSafeInteger(paymentAllocated) ||
    !Number.isSafeInteger(chargeAllocated)
  ) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "El saldo del cargo necesita revisión antes de asignar el pago",
      409
    );
  }
  if (paymentAllocated + input.amountCents > input.payment.amountCents) {
    throw new OperationalError(
      "INSUFFICIENT_UNALLOCATED_PAYMENT",
      "El pago no tiene saldo suficiente sin asignar",
      409
    );
  }
  if (chargeAllocated + input.amountCents > input.charge.amountCents) {
    throw new OperationalError(
      "CHARGE_ALREADY_SETTLED",
      "El importe supera el saldo pendiente del cargo",
      409
    );
  }

  const [allocation] = await tx
    .insert(paymentAllocations)
    .values({
      organizationId: input.organizationId,
      paymentId: input.payment.id,
      chargeId: input.charge.id,
      amountCents: input.amountCents,
      currency: input.payment.currency,
      allocatedAt: input.allocatedAt,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  const chargeTotal = chargeAllocated + input.amountCents;
  await tx
    .update(charges)
    .set({
      status:
        chargeTotal === input.charge.amountCents ? "paid" : "partially_paid",
      version: sql`${charges.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(charges.organizationId, input.organizationId),
        eq(charges.id, input.charge.id)
      )
    );

  const invoiceState = await tx.execute(sql`
    select
      bool_and(status = 'paid') as all_paid,
      bool_or(status in ('paid', 'partially_paid')) as any_paid
    from zaltyko.charges
    where organization_id = ${input.organizationId}::uuid
      and invoice_id = ${input.charge.invoiceId}::uuid
      and status <> 'void'
  `);
  const invoiceStatus = invoiceState.rows[0]?.all_paid
    ? "paid"
    : invoiceState.rows[0]?.any_paid
      ? "partially_paid"
      : "issued";
  await tx
    .update(invoices)
    .set({
      status: invoiceStatus,
      version: sql`${invoices.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invoices.organizationId, input.organizationId),
        eq(invoices.id, input.charge.invoiceId)
      )
    );

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: input.charge.locationId,
    eventName: "payment.allocated",
    aggregateType: "payment_allocation",
    aggregateId: allocation.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      allocationId: allocation.id,
      paymentId: input.payment.id,
      chargeId: input.charge.id,
      amountCents: allocation.amountCents,
      currency: allocation.currency,
    },
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.charge.locationId,
    actorUserId: input.actorUserId,
    action: "payment.allocated",
    targetType: "payment_allocation",
    targetId: allocation.id,
    idempotencyKey: input.idempotencyKey,
    after: {
      paymentId: input.payment.id,
      chargeId: input.charge.id,
      amountCents: allocation.amountCents,
    },
  });
  return allocation;
}

function manualAllocationIdempotencyKey(
  organizationId: string,
  idempotencyKey: string
): string {
  return `manual-allocation:${fingerprint({ organizationId, idempotencyKey }).slice(0, 48)}`;
}

/**
 * Modo de cobro de las cuotas de la factura. Solo la emisión mensual
 * (monthly-invoice/issue.ts) puede pedir `automatic`, y tiene que decir que la
 * factura es mensual; cualquier otra factura nace en manual.
 */
export type IssueInvoiceCollectionOptions =
  | { collectionMode?: "manual" }
  | { collectionMode: "automatic"; monthlyInvoice: true };

export async function issueInvoiceInTransaction(
  tx: TransactionClient,
  command: IssueInvoiceCommand,
  options: IssueInvoiceCollectionOptions = {}
): Promise<Invoice> {
  const input = issueInvoiceSchema.parse(command);
  const totalAmountCents = input.lines.reduce(
    (total, line) => total + line.quantity * line.unitAmountCents,
    0
  );
  if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents <= 0) {
    throw new OperationalError(
      "INVALID_RELATION",
      "La factura debe contener al menos un importe positivo",
      422
    );
  }
  if (
    input.lines.some((line) => line.servicePeriodEnd < line.servicePeriodStart)
  ) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "Periodo de servicio inválido",
      422
    );
  }
  const commandFingerprint = fingerprint({
    familyId: input.familyId,
    familyPayerId: input.familyPayerId ?? null,
    locationId: input.locationId,
    reference: input.reference,
    currency: input.currency,
    dueAt: input.dueAt,
    lines: input.lines,
  });

  await lockCommand(tx, input.organizationId, input.idempotencyKey);
  const priorEvent = await findOutboxEvent(tx, {
    organizationId: input.organizationId,
    eventName: "invoice.issued",
    idempotencyKey: input.idempotencyKey,
  });
  if (priorEvent) {
    assertIdempotencyPayload(priorEvent.payload, { commandFingerprint });
    const priorInvoiceId = priorEvent.payload.invoiceId;
    if (typeof priorInvoiceId !== "string") {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "Evento de factura inválido",
        409
      );
    }
    const prior = await loadInvoice(tx, input.organizationId, priorInvoiceId);
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: prior.locationId ?? input.locationId,
      actor: input.actor,
      allowedRoles: financialRoles,
    });
    return prior;
  }

  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    intent: "write",
    allowedRoles: financialRoles,
  });

  const collectionMode =
    options.collectionMode ??
    (await getChargeCollectionModeSnapshot({
      executor: tx,
      organizationId: input.organizationId,
      familyId: input.familyId,
    }));
  // El cobro automático solo existe para facturas mensuales (Fase 3) y solo
  // con la bandera y los cerrojos abiertos: se vuelve a mirar aquí, en el
  // borde del libro, aunque quien llama ya lo haya decidido.
  if (
    collectionMode === "automatic" &&
    (!("monthlyInvoice" in options && options.monthlyInvoice === true) ||
      !isFamilyAutomaticCollectionOpen())
  ) {
    throw new OperationalError(
      FAMILY_AUTOMATIC_COLLECTION_DISABLED,
      "No se pueden emitir cargos con cobro automático familiar; usa el registro manual.",
      409,
      { code: FAMILY_AUTOMATIC_COLLECTION_DISABLED }
    );
  }

  const now = new Date();
  const [invoice] = await tx
    .insert(invoices)
    .values({
      organizationId: input.organizationId,
      locationId: input.locationId,
      familyId: input.familyId,
      familyPayerId: input.familyPayerId,
      reference: input.reference,
      status: "issued",
      currency: input.currency,
      totalAmountCents,
      issuedAt: now,
      dueAt: new Date(input.dueAt),
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  for (const [index, line] of input.lines.entries()) {
    const lineId = crypto.randomUUID();
    const amountCents = line.quantity * line.unitAmountCents;
    await tx.insert(invoiceLines).values({
      id: lineId,
      organizationId: input.organizationId,
      invoiceId: invoice.id,
      locationId: line.athleteId ? input.locationId : null,
      athleteId: line.athleteId ?? null,
      enrollmentId: line.enrollmentId,
      pricePlanId: line.pricePlanId,
      lineType: line.lineType,
      quantity: line.quantity,
      unitAmountCents: line.unitAmountCents,
      amountCents,
      currency: input.currency,
      servicePeriodStart: line.servicePeriodStart,
      servicePeriodEnd: line.servicePeriodEnd,
    });
    if (line.athleteId && line.coveredEnrollments) {
      await tx.insert(invoiceLineEnrollments).values(
        line.coveredEnrollments.map((covered) => ({
          organizationId: input.organizationId,
          locationId: input.locationId,
          athleteId: line.athleteId!,
          invoiceLineId: lineId,
          pricePlanId: line.pricePlanId!,
          enrollmentId: covered.enrollmentId,
          classTemplateId: covered.classTemplateId,
          priceAssignmentId: covered.assignmentId,
          classNameSnapshot: covered.className,
        }))
      );
    }
    const [charge] = await tx
      .insert(charges)
      .values({
        organizationId: input.organizationId,
        locationId: input.locationId,
        invoiceId: invoice.id,
        invoiceLineId: lineId,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        enrollmentId: line.enrollmentId ?? null,
        collectionMode,
        status: "due",
        amountCents,
        currency: input.currency,
        dueAt: new Date(input.dueAt),
        servicePeriodStart: line.servicePeriodStart,
        servicePeriodEnd: line.servicePeriodEnd,
        idempotencyKey: `${input.idempotencyKey}:charge:${index}`,
      })
      .returning();
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: "charge.due",
      aggregateType: "charge",
      aggregateId: charge.id,
      idempotencyKey: `${input.idempotencyKey}:charge:${index}`,
      payload: {
        chargeId: charge.id,
        invoiceId: invoice.id,
        amountCents,
        currency: input.currency,
        dueAt: input.dueAt,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: "charge.due",
      targetType: "charge",
      targetId: charge.id,
      idempotencyKey: `${input.idempotencyKey}:charge:${index}`,
      after: {
        invoiceId: invoice.id,
        amountCents,
        currency: input.currency,
        dueAt: input.dueAt,
      },
    });
  }

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    eventName: "invoice.issued",
    aggregateType: "invoice",
    aggregateId: invoice.id,
    idempotencyKey: input.idempotencyKey,
    payload: {
      invoiceId: invoice.id,
      familyId: invoice.familyId,
      totalAmountCents,
      currency: invoice.currency,
      dueAt: input.dueAt,
      commandFingerprint,
    },
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actorUserId: input.actor.userId,
    action: "invoice.issued",
    targetType: "invoice",
    targetId: invoice.id,
    idempotencyKey: input.idempotencyKey,
    after: {
      status: invoice.status,
      totalAmountCents,
      currency: invoice.currency,
    },
  });
  return invoice;
}

export async function issueInvoice(
  command: IssueInvoiceCommand
): Promise<Invoice> {
  return db.transaction((tx) => issueInvoiceInTransaction(tx, command));
}

/** Records money already received outside the processor; it never initiates a charge. */
export async function recordManualPayment(
  command: RecordManualPaymentCommand
): Promise<Payment> {
  const input = recordManualPaymentSchema.parse(command);
  const receivedAt = new Date(input.receivedAt);
  if (receivedAt.getTime() > Date.now() + 60_000) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha del pago no puede estar en el futuro",
      422
    );
  }
  const commandFingerprint = fingerprint({
    locationId: input.locationId,
    familyId: input.familyId,
    familyPayerId: input.familyPayerId ?? null,
    amountCents: input.amountCents,
    currency: input.currency,
    method: input.method,
    reference: input.reference ?? null,
    receivedAt: input.receivedAt,
  });

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: "payment.manual_recorded",
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, { commandFingerprint });
      const paymentId = priorEvent.payload.paymentId;
      if (typeof paymentId !== "string") {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "Evento de pago manual inválido",
          409
        );
      }
      const prior = await loadPayment(tx, input.organizationId, paymentId);
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: prior.locationId ?? input.locationId,
        actor: input.actor,
        allowedRoles: financialRoles,
      });
      return prior;
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: financialRoles,
    });

    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: input.organizationId,
        locationId: input.locationId,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        source: "manual",
        status: "succeeded",
        amountCents: input.amountCents,
        currency: input.currency,
        processor: null,
        environment: null,
        providerPaymentId: null,
        manualMethod: input.method,
        manualReference: input.reference,
        recordedByUserId: input.actor.userId,
        receivedAt,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: "payment.manual_recorded",
      aggregateType: "payment",
      aggregateId: payment.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        paymentId: payment.id,
        source: "manual",
        method: input.method,
        amountCents: input.amountCents,
        currency: input.currency,
        receivedAt: input.receivedAt,
        commandFingerprint,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: "payment.manual_recorded",
      targetType: "payment",
      targetId: payment.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        source: "manual",
        method: input.method,
        amountCents: input.amountCents,
        currency: input.currency,
        receivedAt: input.receivedAt,
        referenceDigest: input.reference ? fingerprint(input.reference) : null,
      },
    });
    return payment;
  });
}

/**
 * Records money already received and allocates it to one open charge atomically.
 * This is the owner-facing v1 path; it never creates a processor charge.
 */
export async function recordManualPaymentForCharge(
  command: RecordManualPaymentForChargeCommand
): Promise<RecordedManualPayment> {
  const input = recordManualPaymentForChargeSchema.parse(command);
  const receivedAt = new Date(input.receivedAt);
  if (receivedAt.getTime() > Date.now() + 60_000) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "La fecha del pago no puede estar en el futuro",
      422
    );
  }
  const commandFingerprint = fingerprint({
    chargeId: input.chargeId,
    amountCents: input.amountCents,
    method: input.method,
    reference: input.reference ?? null,
    receivedAt: input.receivedAt,
  });
  const allocationKey = manualAllocationIdempotencyKey(
    input.organizationId,
    input.idempotencyKey
  );

  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const priorEvent = await findOutboxEvent(tx, {
      organizationId: input.organizationId,
      eventName: "payment.manual_recorded",
      idempotencyKey: input.idempotencyKey,
    });
    if (priorEvent) {
      assertIdempotencyPayload(priorEvent.payload, { commandFingerprint });
      const paymentId = priorEvent.payload.paymentId;
      const allocationId = priorEvent.payload.allocationId;
      if (typeof paymentId !== "string" || typeof allocationId !== "string") {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "Evento de pago manual inválido",
          409
        );
      }
      const payment = await loadPayment(tx, input.organizationId, paymentId);
      const [allocation] = await tx
        .select()
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.organizationId, input.organizationId),
            eq(paymentAllocations.id, allocationId)
          )
        )
        .limit(1);
      if (!allocation) {
        throw new OperationalError(
          "IDEMPOTENCY_CONFLICT",
          "La asignación del pago no está disponible",
          409
        );
      }
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: payment.locationId ?? "",
        actor: input.actor,
        allowedRoles: financialRoles,
      });
      return { payment, allocation };
    }

    await tx.execute(sql`
      select id from zaltyko.charges
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.chargeId}::uuid
      for update
    `);
    const charge = await loadCharge(tx, input.organizationId, input.chargeId);
    if (!charge.locationId) {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "El cargo no tiene una sede asignada para autorizar el registro",
        403
      );
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: charge.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: financialRoles,
    });
    if (charge.status === "void") {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "No se puede registrar un pago en un cargo anulado",
        409
      );
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: input.organizationId,
        locationId: charge.locationId,
        familyId: charge.familyId,
        familyPayerId: charge.familyPayerId,
        source: "manual",
        status: "succeeded",
        amountCents: input.amountCents,
        currency: charge.currency,
        processor: null,
        environment: null,
        providerPaymentId: null,
        manualMethod: input.method,
        manualReference: input.reference,
        recordedByUserId: input.actor.userId,
        receivedAt,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    const allocation = await applyPaymentAllocation(tx, {
      organizationId: input.organizationId,
      payment,
      charge,
      amountCents: input.amountCents,
      allocatedAt: receivedAt,
      idempotencyKey: allocationKey,
      actorUserId: input.actor.userId,
      origin: "manual",
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: charge.locationId,
      eventName: "payment.manual_recorded",
      aggregateType: "payment",
      aggregateId: payment.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        paymentId: payment.id,
        allocationId: allocation.id,
        chargeId: charge.id,
        source: "manual",
        method: input.method,
        amountCents: input.amountCents,
        currency: charge.currency,
        receivedAt: input.receivedAt,
        commandFingerprint,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: charge.locationId,
      actorUserId: input.actor.userId,
      action: "payment.manual_recorded",
      targetType: "payment",
      targetId: payment.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        source: "manual",
        method: input.method,
        amountCents: input.amountCents,
        currency: charge.currency,
        receivedAt: input.receivedAt,
        chargeId: charge.id,
        allocationId: allocation.id,
        referenceDigest: input.reference ? fingerprint(input.reference) : null,
      },
    });
    return { payment, allocation };
  });
}

export async function allocatePayment(
  command: AllocatePaymentCommand
): Promise<PaymentAllocation> {
  const input = allocatePaymentSchema.parse(command);
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    await tx.execute(sql`
      select id from zaltyko.payments
      where organization_id = ${input.organizationId}::uuid and id = ${input.paymentId}::uuid
      for update
    `);
    await tx.execute(sql`
      select id from zaltyko.charges
      where organization_id = ${input.organizationId}::uuid and id = ${input.chargeId}::uuid
      for update
    `);
    const payment = await loadPayment(
      tx,
      input.organizationId,
      input.paymentId
    );
    const charge = await loadCharge(tx, input.organizationId, input.chargeId);
    const [prior] = await tx
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organizationId, input.organizationId),
          eq(paymentAllocations.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      assertIdempotencyPayload(prior, {
        paymentId: input.paymentId,
        chargeId: input.chargeId,
        amountCents: input.amountCents,
      });
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: charge.locationId ?? payment.locationId ?? "",
        actor: input.actor,
        allowedRoles: financialRoles,
      });
      return prior;
    }
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: charge.locationId ?? payment.locationId ?? "",
      actor: input.actor,
      intent: "write",
      allowedRoles: financialRoles,
    });
    if (payment.currency !== charge.currency) {
      throw new OperationalError(
        "INVALID_RELATION",
        "Pago y cargo usan monedas distintas",
        422
      );
    }
    if (
      !(["succeeded", "partially_refunded"] as const).includes(
        payment.status as "succeeded"
      )
    ) {
      throw new OperationalError(
        "INVALID_STATE_TRANSITION",
        "El pago no está disponible",
        409
      );
    }

    return applyPaymentAllocation(tx, {
      organizationId: input.organizationId,
      payment,
      charge,
      amountCents: input.amountCents,
      allocatedAt: new Date(input.allocatedAt),
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actor.userId,
      origin: "manual",
    });
  });
}

async function markProviderEventProcessed(
  tx: TransactionClient,
  event: PaymentProviderEvent,
  effectType: string,
  effectId: string,
  locationId: string | null,
  outboxPayload: Record<string, unknown>
): Promise<void> {
  const domainEventName =
    event.eventType === "payment.failed"
      ? "payment.attempt_failed"
      : event.eventType === "refund.succeeded"
        ? "payment.refunded"
        : event.eventType;
  await tx
    .update(paymentProviderEvents)
    .set({
      status: "processed",
      effectType,
      effectId,
      processedAt: new Date(),
      attempts: sql`${paymentProviderEvents.attempts} + 1`,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(paymentProviderEvents.id, event.id));
  await appendOutboxEvent(tx, {
    organizationId: event.organizationId,
    locationId,
    eventName: domainEventName,
    aggregateType: effectType,
    aggregateId: effectId,
    idempotencyKey: `provider:${event.processor}:${event.environment}:${event.providerEventId}`,
    payload: outboxPayload,
  });
  await appendAuditEntry(tx, {
    organizationId: event.organizationId,
    locationId,
    actorUserId: null,
    action: domainEventName,
    targetType: effectType,
    targetId: effectId,
    idempotencyKey: `provider:${event.processor}:${event.environment}:${event.providerEventId}`,
    metadata: {
      providerEventId: event.providerEventId,
      processor: event.processor,
    },
  });
}

export async function processLocalSandboxProviderEvent(
  command: ProcessProviderEventCommand
): Promise<PaymentProviderEvent> {
  const input = processProviderEventSchema.parse(command);
  if (!input.signatureVerified) {
    throw new OperationalError(
      "UNVERIFIED_PROVIDER_EVENT",
      "Firma no verificada",
      401
    );
  }
  const payloadSha256 = fingerprint(input.payload);
  const organizationId = input.payload.organizationId;
  const commandKey = `provider:${input.processor}:${input.environment}:${input.providerEventId}`;

  return db.transaction(async (tx) => {
    await lockCommand(tx, organizationId, commandKey);
    await tx
      .insert(paymentProviderEvents)
      .values({
        organizationId,
        processor: input.processor,
        environment: input.environment,
        providerEventId: input.providerEventId,
        eventType: input.payload.type,
        payloadSha256,
        payload: input.payload,
        signatureVerified: true,
      })
      .onConflictDoNothing();
    const [event] = await tx
      .select()
      .from(paymentProviderEvents)
      .where(
        and(
          eq(paymentProviderEvents.processor, input.processor),
          eq(paymentProviderEvents.environment, input.environment),
          eq(paymentProviderEvents.providerEventId, input.providerEventId)
        )
      )
      .limit(1);
    if (!event) throw new Error("No se pudo registrar el evento del proveedor");
    if (
      event.organizationId !== organizationId ||
      event.eventType !== input.payload.type ||
      event.payloadSha256 !== payloadSha256
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El identificador del evento ya existe con otro contenido",
        409
      );
    }
    if (event.status === "processed") return event;

    await tx
      .update(paymentProviderEvents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(paymentProviderEvents.id, event.id));

    if (input.payload.type === "payment.failed") {
      await loadInvoice(tx, organizationId, input.payload.invoiceId);
      const [attempt] = await tx
        .insert(paymentAttempts)
        .values({
          organizationId,
          locationId: input.payload.locationId,
          familyId: input.payload.familyId,
          familyPayerId: input.payload.familyPayerId,
          invoiceId: input.payload.invoiceId,
          status: "failed",
          amountCents: input.payload.amountCents,
          currency: input.payload.currency,
          processor: input.processor,
          environment: input.environment,
          providerAttemptId: input.payload.providerAttemptId,
          failureCode: input.payload.failureCode,
          attemptedAt: new Date(input.payload.attemptedAt),
          providerEventId: event.id,
          idempotencyKey: commandKey,
        })
        .returning();
      await markProviderEventProcessed(
        tx,
        event,
        "payment_attempt",
        attempt.id,
        attempt.locationId,
        {
          paymentAttemptId: attempt.id,
          invoiceId: attempt.invoiceId,
          status: attempt.status,
          failureCode: attempt.failureCode,
          amountCents: attempt.amountCents,
          currency: attempt.currency,
        }
      );
    } else if (input.payload.type === "payment.succeeded") {
      await loadInvoice(tx, organizationId, input.payload.invoiceId);
      const [payment] = await tx
        .insert(payments)
        .values({
          organizationId,
          locationId: input.payload.locationId,
          familyId: input.payload.familyId,
          familyPayerId: input.payload.familyPayerId,
          source: "provider",
          status: "succeeded",
          amountCents: input.payload.amountCents,
          currency: input.payload.currency,
          processor: input.processor,
          environment: input.environment,
          providerPaymentId: input.payload.providerPaymentId,
          receivedAt: new Date(input.payload.attemptedAt),
          idempotencyKey: commandKey,
        })
        .returning();
      await tx.insert(paymentAttempts).values({
        organizationId,
        locationId: input.payload.locationId,
        familyId: input.payload.familyId,
        familyPayerId: input.payload.familyPayerId,
        invoiceId: input.payload.invoiceId,
        paymentId: payment.id,
        status: "succeeded",
        amountCents: input.payload.amountCents,
        currency: input.payload.currency,
        processor: input.processor,
        environment: input.environment,
        providerAttemptId: input.payload.providerAttemptId,
        attemptedAt: new Date(input.payload.attemptedAt),
        providerEventId: event.id,
        idempotencyKey: `${commandKey}:attempt`,
      });
      await markProviderEventProcessed(
        tx,
        event,
        "payment",
        payment.id,
        payment.locationId,
        {
          paymentId: payment.id,
          invoiceId: input.payload.invoiceId,
          status: payment.status,
          amountCents: payment.amountCents,
          currency: payment.currency,
        }
      );
    } else {
      await tx.execute(sql`
        select id from zaltyko.payments
        where organization_id = ${organizationId}::uuid and id = ${input.payload.paymentId}::uuid
        for update
      `);
      const payment = await loadPayment(
        tx,
        organizationId,
        input.payload.paymentId
      );
      const [allocation] = await tx
        .select()
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.organizationId, organizationId),
            eq(paymentAllocations.id, input.payload.paymentAllocationId)
          )
        )
        .limit(1);
      if (
        !allocation ||
        allocation.paymentId !== payment.id ||
        allocation.currency !== input.payload.currency
      ) {
        throw new OperationalError(
          "INVALID_RELATION",
          "Asignación del reembolso inválida",
          422
        );
      }
      const refunded = await tx.execute(sql`
        select coalesce(sum(amount_cents), 0)::bigint as amount
        from zaltyko.refunds
        where organization_id = ${organizationId}::uuid
          and payment_allocation_id = ${allocation.id}::uuid
          and status = 'succeeded'
      `);
      if (
        numberFrom(refunded.rows[0]?.amount) + input.payload.amountCents >
        allocation.amountCents
      ) {
        throw new OperationalError(
          "REFUND_EXCEEDS_ALLOCATION",
          "El reembolso supera lo asignado al cargo",
          409
        );
      }
      const [refund] = await tx
        .insert(refunds)
        .values({
          organizationId,
          paymentId: payment.id,
          paymentAllocationId: allocation.id,
          status: "succeeded",
          amountCents: input.payload.amountCents,
          currency: input.payload.currency,
          processor: input.processor,
          environment: input.environment,
          providerRefundId: input.payload.providerRefundId,
          reasonCode: input.payload.reasonCode,
          refundedAt: new Date(input.payload.refundedAt),
          providerEventId: event.id,
          idempotencyKey: commandKey,
        })
        .returning();
      const totalRefunded = await tx.execute(sql`
        select coalesce(sum(amount_cents), 0)::bigint as amount
        from zaltyko.refunds
        where organization_id = ${organizationId}::uuid
          and payment_id = ${payment.id}::uuid
          and status = 'succeeded'
      `);
      const paymentStatus =
        numberFrom(totalRefunded.rows[0]?.amount) === payment.amountCents
          ? "refunded"
          : "partially_refunded";
      await tx
        .update(payments)
        .set({
          status: paymentStatus,
          version: sql`${payments.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.organizationId, organizationId),
            eq(payments.id, payment.id)
          )
        );
      await markProviderEventProcessed(
        tx,
        event,
        "refund",
        refund.id,
        payment.locationId,
        {
          refundId: refund.id,
          paymentId: payment.id,
          paymentAllocationId: allocation.id,
          amountCents: refund.amountCents,
          currency: refund.currency,
        }
      );
    }

    const [processed] = await tx
      .select()
      .from(paymentProviderEvents)
      .where(eq(paymentProviderEvents.id, event.id))
      .limit(1);
    return processed;
  });
}

export async function reconcileFinancialPeriod(
  command: ReconcileFinancialPeriodCommand
): Promise<FinancialReconciliationRun> {
  const input = reconcileFinancialPeriodSchema.parse(command);
  if (input.periodEnd < input.periodStart) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "Periodo de conciliación inválido",
      422
    );
  }
  return db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    const [prior] = await tx
      .select()
      .from(financialReconciliationRuns)
      .where(
        and(
          eq(financialReconciliationRuns.organizationId, input.organizationId),
          eq(financialReconciliationRuns.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      assertIdempotencyPayload(prior, {
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: input.authorizationLocationId,
        actor: input.actor,
        allowedRoles: financialRoles,
      });
      return prior;
    }

    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.authorizationLocationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: financialRoles,
    });

    const totals = await tx.execute(sql`
      with period_charges as (
        select id, amount_cents
        from zaltyko.charges
        where organization_id = ${input.organizationId}::uuid
          and currency = ${input.currency}
          and service_period_start >= ${input.periodStart}::date
          and service_period_start <= ${input.periodEnd}::date
          and status <> 'void'
      ), period_allocations as (
        select allocation.id, allocation.amount_cents
        from zaltyko.payment_allocations allocation
        join period_charges charge on charge.id = allocation.charge_id
        where allocation.organization_id = ${input.organizationId}::uuid
          and allocation.allocated_at <= ${input.sourceWatermark}::timestamptz
      ), period_refunds as (
        select refund.amount_cents
        from zaltyko.refunds refund
        join period_allocations allocation on allocation.id = refund.payment_allocation_id
        where refund.organization_id = ${input.organizationId}::uuid
          and refund.status = 'succeeded'
          and refund.refunded_at <= ${input.sourceWatermark}::timestamptz
      )
      select
        coalesce((select sum(amount_cents) from period_charges), 0)::bigint as expected,
        coalesce((select sum(amount_cents) from period_allocations), 0)::bigint as allocated,
        coalesce((select sum(amount_cents) from period_refunds), 0)::bigint as refunded
    `);
    const expectedCents = numberFrom(totals.rows[0]?.expected);
    const allocatedCents = numberFrom(totals.rows[0]?.allocated);
    const refundedCents = numberFrom(totals.rows[0]?.refunded);
    const netCollectedCents = allocatedCents - refundedCents;
    const outstandingCents = expectedCents - allocatedCents;
    const status =
      allocatedCents <= expectedCents && refundedCents <= allocatedCents
        ? "balanced"
        : "unbalanced";

    const [run] = await tx
      .insert(financialReconciliationRuns)
      .values({
        organizationId: input.organizationId,
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        expectedCents,
        allocatedCents,
        refundedCents,
        netCollectedCents,
        outstandingCents,
        status,
        formulaVersion: 1,
        sourceWatermark: new Date(input.sourceWatermark),
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: null,
      eventName: "financial.period_reconciled",
      aggregateType: "financial_reconciliation",
      aggregateId: run.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        reconciliationId: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        currency: run.currency,
        expectedCents,
        allocatedCents,
        refundedCents,
        netCollectedCents,
        outstandingCents,
        formulaVersion: run.formulaVersion,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: null,
      actorUserId: input.actor.userId,
      action: "financial.period_reconciled",
      targetType: "financial_reconciliation",
      targetId: run.id,
      idempotencyKey: input.idempotencyKey,
      after: {
        expectedCents,
        allocatedCents,
        refundedCents,
        netCollectedCents,
        outstandingCents,
      },
    });
    return run;
  });
}

// ---------------------------------------------------------------------------
// Cobro automático de cuotas (Fase 3): registro y reparto de lo cobrado.
//
// Lo usa el proceso diario de cobro (family-collection-service) dentro de su
// transacción «aplicar», que ya tomó el orden de bloqueo único: organización →
// cargos por id → factura → intento. Ninguna de estas funciones llama a Stripe.
// ---------------------------------------------------------------------------

/** Procesador de los cobros automáticos (cargo directo en la cuenta de la academia). */
export const FAMILY_COLLECTION_PROCESSOR = "stripe";

/**
 * Estados del intento en los que la cuota se está cobrando automáticamente:
 * los de FAMILY_COLLECTION_OPEN_STATUSES (family-collection-schema.ts; Fase 4:
 * también `requires_action`, la familia tiene que confirmar el pago con su
 * banco). Copiados aquí para no cargar el espejo Drizzle del cobro desde el
 * libro; tests/family-collection-open-statuses-contract.test.ts comprueba que
 * coinciden.
 */
export const AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES = ["claimed", "created", "processing", "requires_action"] as const;

const providerCollectionPaymentSchema = z.object({
  organizationId: z.guid(),
  attemptId: z.guid(),
  invoiceId: z.guid(),
  paymentIntentId: z
    .string()
    .max(255)
    .regex(/^pi_[A-Za-z0-9_]+$/),
  amountCents: z.number().int().positive().safe(),
  environment: z.enum(["test", "live"]),
  receivedAt: z.date().optional(),
});

export type RecordProviderCollectionPaymentInput = z.input<
  typeof providerCollectionPaymentSchema
>;

const providerCollectionAllocationSchema = z.object({
  organizationId: z.guid(),
  attemptId: z.guid(),
  invoiceId: z.guid(),
  paymentId: z.guid(),
  allocations: z
    .array(
      z.object({
        chargeId: z.guid(),
        amountCents: z.number().int().positive().safe(),
      })
    )
    .min(1),
  allocatedAt: z.date().optional(),
});

export type AllocateProviderCollectionPaymentInput = z.input<
  typeof providerCollectionAllocationSchema
>;

/** Por qué un cobro automático necesita que la academia lo revise. */
export type ProviderCollectionReviewReason =
  | "allocation_conflict"
  | "amount_mismatch"
  | "charge_mismatch"
  | "charge_void"
  | "charge_settled"
  | "collection_in_progress"
  | "payment_not_available"
  | "unallocated_remainder";

export interface ProviderCollectionAllocationResult {
  status: "allocated" | "needs_review";
  allocatedCents: number;
  unallocatedCents: number;
  reviewReasons: ProviderCollectionReviewReason[];
}

const SYSTEM_AUDIT_METADATA = {
  actor_type: "system",
  job_key: FAMILY_COLLECTION_JOB_KEY,
} as const;

/** Entorno de la cuenta conectada (`test`/`live`) → entorno del libro (`sandbox`/`live`). */
function ledgerEnvironment(environment: "test" | "live"): "sandbox" | "live" {
  return environment === "test" ? "sandbox" : "live";
}

async function findProviderPayment(
  tx: TransactionClient,
  environment: "sandbox" | "live",
  paymentIntentId: string
): Promise<Payment | null> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.source, "provider"),
        eq(payments.processor, FAMILY_COLLECTION_PROCESSOR),
        eq(payments.environment, environment),
        eq(payments.providerPaymentId, paymentIntentId)
      )
    )
    .limit(1);
  return payment ?? null;
}

/**
 * Registra en el libro un cobro automático que Stripe ya confirmó: un pago
 * `provider` de la familia y el pagador de la factura.
 *
 * Nunca falla por saldos (no mira ni toca cuotas: eso es
 * allocateProviderCollectionPayment), así que el dinero cobrado siempre queda
 * registrado. Es idempotente por el cobro de Stripe (`payments_provider_uq`
 * y la clave `family-collection:{intento}:{pi_…}`): repetirlo devuelve el
 * mismo pago con `created: false`, y un segundo cobro del mismo intento se
 * registra como otro pago.
 *
 * Bloquea primero la fila de la organización (lockOrganizationForSaasMutation,
 * idempotente dentro de la transacción), así quien llama no puede romper el
 * orden de bloqueo único: organización → cargos → factura → intento.
 */
export async function recordProviderCollectionPayment(
  tx: TransactionClient,
  command: RecordProviderCollectionPaymentInput
): Promise<{ payment: Payment; created: boolean }> {
  const input = providerCollectionPaymentSchema.parse(command);
  const environment = ledgerEnvironment(input.environment);
  // Primer eslabón del orden de bloqueo único (idempotente en la transacción).
  await lockOrganizationForSaasMutation(tx, input.organizationId);

  const prior = await findProviderPayment(tx, environment, input.paymentIntentId);
  if (prior) {
    if (
      prior.organizationId !== input.organizationId ||
      prior.amountCents !== input.amountCents
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El cobro ya está registrado con otros datos",
        409
      );
    }
    return { payment: prior, created: false };
  }

  const invoice = await loadInvoice(tx, input.organizationId, input.invoiceId);
  const receivedAt = input.receivedAt ?? new Date();
  // Por cobro de Stripe, no por intento: si un intento acabara con dos cobros
  // (p. ej. uno encontrado al reanudar), los dos quedan registrados.
  const idempotencyKey = `family-collection:${input.attemptId}:${input.paymentIntentId}`;
  const [inserted] = await tx
    .insert(payments)
    .values({
      organizationId: input.organizationId,
      locationId: invoice.locationId,
      familyId: invoice.familyId,
      familyPayerId: invoice.familyPayerId,
      source: "provider",
      status: "succeeded",
      amountCents: input.amountCents,
      currency: invoice.currency,
      processor: FAMILY_COLLECTION_PROCESSOR,
      environment,
      providerPaymentId: input.paymentIntentId,
      manualMethod: null,
      manualReference: null,
      recordedByUserId: null,
      receivedAt,
      idempotencyKey,
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    // Otro registro ganó la carrera con el mismo cobro: se devuelve ese.
    const concurrent = await findProviderPayment(tx, environment, input.paymentIntentId);
    if (
      !concurrent ||
      concurrent.organizationId !== input.organizationId ||
      concurrent.amountCents !== input.amountCents
    ) {
      throw new OperationalError(
        "IDEMPOTENCY_CONFLICT",
        "El intento de cobro ya tiene otro pago registrado",
        409
      );
    }
    return { payment: concurrent, created: false };
  }

  await appendOutboxEvent(tx, {
    organizationId: input.organizationId,
    locationId: inserted.locationId,
    eventName: "payment.provider_recorded",
    aggregateType: "payment",
    aggregateId: inserted.id,
    idempotencyKey,
    payload: {
      paymentId: inserted.id,
      invoiceId: invoice.id,
      attemptId: input.attemptId,
      source: "provider",
      amountCents: inserted.amountCents,
      currency: inserted.currency,
    },
    occurredAt: receivedAt,
  });
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId: inserted.locationId,
    actorUserId: null,
    action: "payment.provider_recorded",
    targetType: "payment",
    targetId: inserted.id,
    idempotencyKey,
    after: {
      source: "provider",
      invoiceId: invoice.id,
      attemptId: input.attemptId,
      amountCents: inserted.amountCents,
      currency: inserted.currency,
      environment,
    },
    metadata: { ...SYSTEM_AUDIT_METADATA, providerPaymentId: input.paymentIntentId },
  });
  return { payment: inserted, created: true };
}

/**
 * Comprobación compartida «cuota con cobro automático en curso»: el intento
 * no terminal (`claimed`, `created` o `processing`) de la factura de alguna
 * de esas cuotas, o `null`. El pago manual (Tarea 7) responde 409 si existe;
 * el reparto de un cobro automático la usa excluyendo su propio intento.
 *
 * Sin las tablas de la Fase 3 no hay cobros automáticos: responde `null` sin
 * consultarlas.
 */
export async function findAutomaticCollectionInProgress(
  tx: Pick<TransactionClient, "execute">,
  input: { organizationId: string; chargeIds: readonly string[]; excludeAttemptId?: string | null }
): Promise<{ attemptId: string; invoiceId: string; status: string } | null> {
  if (input.chargeIds.length === 0) return null;
  if (!(await isFamilyCollectionStorageAvailable(tx))) return null;
  return queryAutomaticCollectionInProgress(tx, input);
}

/** La consulta de findAutomaticCollectionInProgress, con las tablas ya comprobadas. */
async function queryAutomaticCollectionInProgress(
  tx: Pick<TransactionClient, "execute">,
  input: { organizationId: string; chargeIds: readonly string[]; excludeAttemptId?: string | null }
): Promise<{ attemptId: string; invoiceId: string; status: string } | null> {
  const chargeList = sql.join(
    [...input.chargeIds].map((chargeId) => sql`${chargeId}::uuid`),
    sql`, `
  );
  const statusList = sql.join(
    AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES.map((status) => sql`${status}`),
    sql`, `
  );
  const result = await tx.execute(sql`
    select a.id::text as "attemptId",
           a.invoice_id::text as "invoiceId",
           a.status as "status"
      from zaltyko.family_collection_attempts a
      join zaltyko.charges c
        on c.organization_id = a.organization_id
       and c.invoice_id = a.invoice_id
     where a.organization_id = ${input.organizationId}::uuid
       and c.id in (${chargeList})
       and a.status in (${statusList})
       ${input.excludeAttemptId ? sql`and a.id <> ${input.excludeAttemptId}::uuid` : sql``}
     order by a.id
     limit 1
  `);
  const row = result.rows[0] as
    | { attemptId?: unknown; invoiceId?: unknown; status?: unknown }
    | undefined;
  if (!row || typeof row.attemptId !== "string") return null;
  return {
    attemptId: row.attemptId,
    invoiceId: String(row.invoiceId),
    status: String(row.status),
  };
}

/** Texto del 409 de un pago o reparto manual sobre una cuota que se está cobrando sola. */
export const AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE =
  "Esta cuota se está cobrando automáticamente. Espera al resultado.";

/** Motivo (`failure_code`) con el que un pago manual cierra un reintento automático pendiente. */
export const MANUAL_PAYMENT_CANCEL_CODE = "manual_payment";

/**
 * Comprobación común del pago manual y del reparto manual (la llama
 * applyPaymentAllocation con `origin: "manual"`, así cubre
 * recordManualPaymentForCharge y allocatePayment):
 *
 * - si la factura de la cuota tiene un intento `claimed`, `created`,
 *   `processing` o `requires_action`, 409 AUTOMATIC_COLLECTION_IN_PROGRESS:
 *   el dinero puede estar moviéndose en Stripe (o la familia puede confirmar
 *   el pago con su banco hasta su plazo). Vale también con la bandera apagada (lo ya enviado
 *   se registra igual);
 * - si el último intento de la factura es `failed` con reintento pendiente,
 *   lo cierra como `canceled` (`manual_payment`) en la misma transacción: la
 *   cuota se cobra a mano y no se vuelve a intentar sola. Nada más bloquea.
 *
 * Quien llama ya tiene la organización (lockCommand) y la cuota bloqueadas;
 * aquí se bloquean la factura y el intento, en el orden de bloqueo único
 * (organización → cuotas por id → factura → intento). Sin las tablas de la
 * Fase 3 no hay cobros automáticos y no hace nada más.
 */
async function guardManualAllocation(
  tx: TransactionClient,
  input: { organizationId: string; charge: Charge; actorUserId: string | null }
): Promise<void> {
  if (!(await isFamilyCollectionStorageAvailable(tx))) return;
  const inProgress = await queryAutomaticCollectionInProgress(tx, {
    organizationId: input.organizationId,
    chargeIds: [input.charge.id],
  });
  if (inProgress) {
    throw new OperationalError("AUTOMATIC_COLLECTION_IN_PROGRESS", AUTOMATIC_COLLECTION_IN_PROGRESS_MESSAGE, 409);
  }

  await tx.execute(sql`
    select id from zaltyko.invoices
     where organization_id = ${input.organizationId}::uuid and id = ${input.charge.invoiceId}::uuid
     for update
  `);
  const last = await tx.execute(sql`
    select id::text as "attemptId",
           location_id::text as "locationId",
           attempt_number as "attemptNumber",
           status as "status",
           failure_code as "failureCode",
           decline_code as "declineCode",
           next_retry_at is not null as "retryPending"
      from zaltyko.family_collection_attempts
     where organization_id = ${input.organizationId}::uuid
       and invoice_id = ${input.charge.invoiceId}::uuid
     order by attempt_number desc
     limit 1
     for update
  `);
  const attempt = last.rows[0] as
    | {
        attemptId?: unknown;
        locationId?: unknown;
        attemptNumber?: unknown;
        status?: unknown;
        failureCode?: unknown;
        declineCode?: unknown;
        retryPending?: unknown;
      }
    | undefined;
  if (!attempt || typeof attempt.attemptId !== "string") return;
  if (attempt.status !== "failed" || attempt.retryPending !== true) return;

  const now = new Date();
  await tx.execute(sql`
    update zaltyko.family_collection_attempts
       set status = 'canceled',
           failure_code = ${MANUAL_PAYMENT_CANCEL_CODE},
           next_retry_at = null,
           updated_at = ${now.toISOString()}::timestamptz
     where organization_id = ${input.organizationId}::uuid
       and id = ${attempt.attemptId}::uuid
       and status = 'failed'
  `);
  // Misma clave que el resto de cierres del intento: un intento se cancela una sola vez.
  const idempotencyKey = `family-collection:${attempt.attemptId}:attempt_canceled`;
  const payload = {
    attemptId: attempt.attemptId,
    invoiceId: input.charge.invoiceId,
    attemptNumber: Number(attempt.attemptNumber),
    reason: MANUAL_PAYMENT_CANCEL_CODE,
    chargeId: input.charge.id,
  };
  const locationId = typeof attempt.locationId === "string" ? attempt.locationId : input.charge.locationId;
  const eventName = "family_collection.attempt_canceled";
  if (!(await findOutboxEvent(tx, { organizationId: input.organizationId, eventName, idempotencyKey }))) {
    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId,
      eventName,
      aggregateType: "family_collection_attempt",
      aggregateId: attempt.attemptId,
      idempotencyKey,
      payload,
      occurredAt: now,
    });
  }
  await appendAuditEntry(tx, {
    organizationId: input.organizationId,
    locationId,
    actorUserId: input.actorUserId,
    action: "family_collection.attempt_canceled",
    targetType: "family_collection_attempt",
    targetId: attempt.attemptId,
    idempotencyKey,
    before: {
      status: "failed",
      failureCode: typeof attempt.failureCode === "string" ? attempt.failureCode : null,
      declineCode: typeof attempt.declineCode === "string" ? attempt.declineCode : null,
      retryPending: true,
    },
    after: { status: "canceled", ...payload },
  });
}

/**
 * Reparte un pago de cobro automático ya registrado entre las cuotas del
 * intento. Reparte lo que quepa y nunca lanza por saldos:
 * - `allocated`: cada cuota recibió su importe y el pago quedó repartido entero;
 * - `needs_review`: alguna cuota ya estaba saldada o anulada, no es de la
 *   factura, otro cobro automático la tiene en curso, o el importe no cuadra.
 *   Lo que no cabe queda sin repartir y la academia debe revisarlo.
 *
 * - el pago ya no está `succeeded` (devuelto o fallido): `needs_review` sin
 *   repartir nada (`payment_not_available`).
 *
 * Idempotente: cada reparto lleva la clave `family-collection:{pago}:{cuota}`
 * y un reparto ya hecho cuenta como hecho; uno que no coincide es
 * `allocation_conflict` (revisión), nunca una excepción.
 *
 * Bloquea primero la organización (lockOrganizationForSaasMutation,
 * idempotente en la transacción) y después los cargos por id: sigue el orden
 * de bloqueo único aunque quien llama no lo haya tomado.
 */
export async function allocateProviderCollectionPayment(
  tx: TransactionClient,
  command: AllocateProviderCollectionPaymentInput
): Promise<ProviderCollectionAllocationResult> {
  const input = providerCollectionAllocationSchema.parse(command);
  const allocatedAt = input.allocatedAt ?? new Date();
  const reviewReasons = new Set<ProviderCollectionReviewReason>();
  const planned = [...input.allocations].sort((left, right) =>
    left.chargeId.localeCompare(right.chargeId)
  );

  // Orden de bloqueo único: organización y después cargos por id.
  await lockOrganizationForSaasMutation(tx, input.organizationId);
  const chargeIds = planned.map((allocation) => allocation.chargeId);
  await tx.execute(sql`
    select id from zaltyko.charges
    where organization_id = ${input.organizationId}::uuid
      and id in (${sql.join(
        chargeIds.map((chargeId) => sql`${chargeId}::uuid`),
        sql`, `
      )})
    order by id
    for update
  `);
  await tx.execute(sql`
    select id from zaltyko.payments
    where organization_id = ${input.organizationId}::uuid and id = ${input.paymentId}::uuid
    for update
  `);
  const payment = await loadPayment(tx, input.organizationId, input.paymentId);
  if (payment.source !== "provider") {
    throw new OperationalError(
      "INVALID_RELATION",
      "Solo se reparten aquí los cobros automáticos",
      422
    );
  }

  const allocatedTotal = async () => {
    const totals = await tx.execute(sql`
      select coalesce(sum(amount_cents), 0)::bigint as allocated
        from zaltyko.payment_allocations
       where organization_id = ${input.organizationId}::uuid
         and payment_id = ${payment.id}::uuid
    `);
    return numberFrom(totals.rows[0]?.allocated);
  };

  if (payment.status !== "succeeded") {
    // Devuelto o fallido: no se reparte nada y la academia lo revisa.
    const allocatedCents = await allocatedTotal();
    return {
      status: "needs_review",
      allocatedCents,
      unallocatedCents: Math.max(0, payment.amountCents - allocatedCents),
      reviewReasons: ["payment_not_available"],
    };
  }

  const plannedTotal = planned.reduce((total, item) => total + item.amountCents, 0);
  if (plannedTotal !== payment.amountCents) reviewReasons.add("amount_mismatch");

  if (
    await findAutomaticCollectionInProgress(tx, {
      organizationId: input.organizationId,
      chargeIds,
      excludeAttemptId: input.attemptId,
    })
  ) {
    reviewReasons.add("collection_in_progress");
  }

  let available = payment.amountCents - (await allocatedTotal());

  for (const item of planned) {
    const idempotencyKey = `family-collection:${payment.id}:${item.chargeId}`;
    const [prior] = await tx
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organizationId, input.organizationId),
          eq(paymentAllocations.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    if (prior) {
      // Ya repartido antes: cuenta como hecho. Si no coincide con lo que se
      // pide ahora, se revisa (nunca se lanza).
      if (
        prior.paymentId !== payment.id ||
        prior.chargeId !== item.chargeId ||
        prior.amountCents !== item.amountCents
      ) {
        reviewReasons.add(
          prior.paymentId === payment.id &&
            prior.chargeId === item.chargeId &&
            prior.amountCents < item.amountCents
            ? "charge_settled"
            : "allocation_conflict"
        );
      }
      continue;
    }
    if (reviewReasons.has("collection_in_progress")) continue;

    const [charge] = await tx
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.organizationId, input.organizationId),
          eq(charges.id, item.chargeId)
        )
      )
      .limit(1);
    if (
      !charge ||
      charge.invoiceId !== input.invoiceId ||
      charge.currency !== payment.currency ||
      charge.familyId !== payment.familyId
    ) {
      reviewReasons.add("charge_mismatch");
      continue;
    }
    if (charge.status === "void") {
      reviewReasons.add("charge_void");
      continue;
    }
    if (charge.status === "paid") {
      reviewReasons.add("charge_settled");
      continue;
    }

    const chargeAllocatedRows = await tx.execute(sql`
      select coalesce(sum(amount_cents), 0)::bigint as allocated
        from zaltyko.payment_allocations
       where organization_id = ${input.organizationId}::uuid
         and charge_id = ${charge.id}::uuid
    `);
    const remaining = charge.amountCents - numberFrom(chargeAllocatedRows.rows[0]?.allocated);
    const amountCents = Math.min(item.amountCents, remaining, available);
    if (amountCents < item.amountCents) {
      reviewReasons.add(remaining < item.amountCents ? "charge_settled" : "amount_mismatch");
    }
    if (amountCents <= 0) continue;

    await applyPaymentAllocation(tx, {
      organizationId: input.organizationId,
      payment,
      charge,
      amountCents,
      allocatedAt,
      idempotencyKey,
      actorUserId: null,
      origin: "automatic_collection",
    });
    available -= amountCents;
  }

  const allocatedCents = await allocatedTotal();
  const unallocatedCents = Math.max(0, payment.amountCents - allocatedCents);
  if (unallocatedCents > 0) reviewReasons.add("unallocated_remainder");

  return {
    status: reviewReasons.size === 0 ? "allocated" : "needs_review",
    allocatedCents,
    unallocatedCents,
    reviewReasons: [...reviewReasons].sort(),
  };
}
