import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  charges,
  financialReconciliationRuns,
  invoiceLines,
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
import { operationalActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getChargeCollectionModeSnapshot } from "@/modules/billing/application/family-collection-preferences";
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

const invoiceLineSchema = z.object({
  enrollmentId: z.string().uuid().optional(),
  pricePlanId: z.string().uuid().optional(),
  lineType: z.string().trim().min(1).max(80),
  quantity: z.number().int().positive(),
  unitAmountCents: z.number().int().nonnegative(),
  servicePeriodStart: z.string().date(),
  servicePeriodEnd: z.string().date(),
});

const issueInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  familyId: z.string().uuid(),
  familyPayerId: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(80),
  currency: currencySchema,
  dueAt: z.string().datetime({ offset: true }),
  lines: z.array(invoiceLineSchema).min(1).max(100),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const allocatePaymentSchema = z.object({
  organizationId: z.string().uuid(),
  paymentId: z.string().uuid(),
  chargeId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  allocatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const recordManualPaymentSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  familyId: z.string().uuid(),
  familyPayerId: z.string().uuid().optional(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  method: z.enum(["cash", "bank_transfer", "card_terminal", "other"]),
  reference: z.string().trim().min(1).max(200).optional(),
  receivedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const recordManualPaymentForChargeSchema = z.object({
  organizationId: z.string().uuid(),
  chargeId: z.string().uuid(),
  amountCents: z.number().int().positive().safe(),
  method: z.enum(["cash", "bank_transfer", "card_terminal", "other"]),
  reference: z.string().trim().min(1).max(200).optional(),
  receivedAt: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const reconcileFinancialPeriodSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  currency: currencySchema,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  sourceWatermark: z.string().datetime({ offset: true }),
  idempotencyKey: commandKeySchema,
  actor: operationalActorSchema,
});

const providerBasePayload = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  familyId: z.string().uuid(),
  familyPayerId: z.string().uuid().optional(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
});

const providerPayloadSchema = z.discriminatedUnion("type", [
  providerBasePayload
    .extend({
      type: z.literal("payment.failed"),
      invoiceId: z.string().uuid(),
      providerAttemptId: z.string().trim().min(1).max(200),
      failureCode: z.string().trim().min(1).max(80),
      attemptedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  providerBasePayload
    .extend({
      type: z.literal("payment.succeeded"),
      invoiceId: z.string().uuid(),
      providerAttemptId: z.string().trim().min(1).max(200),
      providerPaymentId: z.string().trim().min(1).max(200),
      attemptedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal("refund.succeeded"),
      organizationId: z.string().uuid(),
      paymentId: z.string().uuid(),
      paymentAllocationId: z.string().uuid(),
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
    actor: z.infer<typeof operationalActorSchema>;
  }
): Promise<PaymentAllocation> {
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
    actorUserId: input.actor.userId,
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

export async function issueInvoice(
  command: IssueInvoiceCommand
): Promise<Invoice> {
  const input = issueInvoiceSchema.parse(command);
  const totalAmountCents = input.lines.reduce(
    (total, line) => total + line.quantity * line.unitAmountCents,
    0
  );
  if (totalAmountCents <= 0) {
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

  return db.transaction(async (tx) => {
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
      allowedRoles: financialRoles,
    });

    const collectionMode = await getChargeCollectionModeSnapshot({
      executor: tx,
      organizationId: input.organizationId,
      familyId: input.familyId,
    });

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
      const [charge] = await tx
        .insert(charges)
        .values({
          organizationId: input.organizationId,
          locationId: input.locationId,
          invoiceId: invoice.id,
          invoiceLineId: lineId,
          familyId: input.familyId,
          familyPayerId: input.familyPayerId,
          enrollmentId: line.enrollmentId,
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
  });
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
      actor: input.actor,
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
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: charge.locationId ?? payment.locationId ?? "",
      actor: input.actor,
      allowedRoles: financialRoles,
    });

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
      return prior;
    }
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
      actor: input.actor,
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
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.authorizationLocationId,
      actor: input.actor,
      allowedRoles: financialRoles,
    });
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
      return prior;
    }

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
