/**
 * Monthly issuance: validates the command, takes the issuance locks, resolves
 * replays and, for a new issuance, re-quotes under locks and writes the
 * invoice through the ledger plus its replay marker and audit entry, all in one
 * transaction.
 */
import { z } from "zod";

import { db } from "@/db";
import { issueInvoiceInTransaction } from "@/modules/billing/application/ledger-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
} from "@/modules/shared/infrastructure/transactional-records";

import { conflict } from "./errors";
import {
  financialRoles,
  keySchema,
  periodBounds,
  periodSchema,
  type IssueMonthlyInvoiceInput,
} from "./inputs";
import { lockIssuanceScope, lockQuotedRows } from "./issue-locks";
import {
  assertAthletesNotBilled,
  loadIssuedLines,
  loadMonthlyChargeState,
} from "./issued-reads";
import { buildMonthlyInvoiceOptions } from "./quote";
import {
  isInvoiceReferenceViolation,
  monthlyInvoiceReference,
} from "./reference";
import {
  replayByIdempotencyKey,
  replayByPeriod,
  type MonthlyIssueResult,
} from "./replay";

export async function issueMonthlyInvoice(
  command: IssueMonthlyInvoiceInput
): Promise<MonthlyIssueResult> {
  const input = {
    ...command,
    servicePeriod: periodSchema.parse(command.servicePeriod),
    dueDate: z.string().date().parse(command.dueDate),
    quoteHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(command.quoteHash),
    idempotencyKey: keySchema.parse(command.idempotencyKey),
  };
  const bounds = periodBounds(input.servicePeriod);

  return db.transaction(async (tx) => {
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      allowedRoles: financialRoles,
    });
    const { dueAt } = await lockIssuanceScope(tx, input, bounds);

    const keyReplay = await replayByIdempotencyKey(tx, input, dueAt);
    if (keyReplay) return keyReplay;

    const beforeLockOptions = await buildMonthlyInvoiceOptions(tx, input);
    const candidate = beforeLockOptions.families.find(
      (family) => family.familyId === input.familyId
    );
    if (!candidate) {
      throw new OperationalError(
        "NOT_FOUND",
        "No hay inscripciones de esta familia en la sede y periodo elegidos.",
        404
      );
    }
    await lockQuotedRows(
      tx,
      input,
      bounds,
      candidate.enrollments.map((item) => item.enrollmentId).sort()
    );

    const options = await buildMonthlyInvoiceOptions(tx, input);
    const family = options.families.find(
      (item) => item.familyId === input.familyId
    );
    if (!family) {
      throw conflict(
        "QUOTE_STALE",
        "La cotización cambió. Actualiza la vista previa."
      );
    }

    const periodReplay = await replayByPeriod(tx, input, bounds, dueAt, family);
    if (periodReplay) return periodReplay;

    if (family.quoteHash !== input.quoteHash) {
      throw conflict(
        "QUOTE_STALE",
        "La cotización cambió. Actualiza la vista previa."
      );
    }
    if (
      !family.canIssue ||
      !family.currency ||
      family.totalAmountCents === null
    ) {
      throw new OperationalError(
        "MONTHLY_INVOICE_BLOCKED",
        "Completa la familia, el responsable y la cobertura tarifaria de todas las gimnastas antes de emitir.",
        422,
        { blockingReasons: family.blockingReasons }
      );
    }
    if (
      !family.payers.some(
        (payer) => payer.familyPayerId === input.familyPayerId
      )
    ) {
      throw new OperationalError(
        "FAMILY_PAYER_INVALID",
        "El responsable elegido no está activo y vigente para este mes.",
        422
      );
    }
    const quotedEnrollmentIds = family.lines
      .flatMap((line) =>
        line.coveredEnrollments.map((covered) => covered.enrollmentId)
      )
      .sort();
    await assertAthletesNotBilled(
      tx,
      input,
      bounds,
      family.lines.map((line) => line.athleteId).sort()
    );

    // A new monthly issuance writes both invoice and monthly replay markers.
    // Replays return above and remain readable after the academy becomes read-only.
    await assertOperationalAccess(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actor: input.actor,
      intent: "write",
      allowedRoles: financialRoles,
    });

    const reference = monthlyInvoiceReference({
      servicePeriod: input.servicePeriod,
      familyId: input.familyId,
      locationId: input.locationId,
    });
    const invoice = await issueInvoiceInTransaction(
      tx,
      {
        organizationId: input.organizationId,
        locationId: input.locationId,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        reference,
        currency: family.currency,
        dueAt,
        idempotencyKey: input.idempotencyKey,
        actor: input.actor,
        lines: family.lines.map((line) => ({
          athleteId: line.athleteId,
          coveredEnrollments: line.coveredEnrollments,
          pricePlanId: line.pricePlanId,
          lineType: "monthly_fee",
          quantity: 1,
          unitAmountCents: line.amountCents,
          servicePeriodStart: bounds.start,
          servicePeriodEnd: bounds.end,
        })),
      },
      { collectionMode: "manual" }
    ).catch((error: unknown) => {
      // A concurrent invoice outside these locks (for example a manual one) can
      // still take the reference after the quote. The transaction is already
      // aborted and rolls back; report a domain conflict instead of a raw 23505.
      if (isInvoiceReferenceViolation(error)) {
        throw conflict(
          "INVOICE_REFERENCE_TAKEN",
          "Ya existe otra factura con la referencia de esta cuota mensual. Revisa las facturas de la familia antes de emitir.",
          { reference }
        );
      }
      throw error;
    });

    await appendOutboxEvent(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      eventName: "invoice.monthly_issued",
      aggregateType: "invoice",
      aggregateId: invoice.id,
      idempotencyKey: input.idempotencyKey,
      payload: {
        invoiceId: invoice.id,
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        locationId: input.locationId,
        servicePeriod: input.servicePeriod,
        dueAt,
        quoteHash: input.quoteHash,
        totalAmountCents: family.totalAmountCents,
        currency: family.currency,
        pricingModel: "athlete_monthly_v1",
        athleteIds: family.lines.map((line) => line.athleteId).sort(),
        enrollmentIds: quotedEnrollmentIds,
      },
    });
    await appendAuditEntry(tx, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      actorUserId: input.actor.userId,
      action: "invoice.monthly_issued",
      targetType: "invoice",
      targetId: invoice.id,
      idempotencyKey: `${input.idempotencyKey}:monthly`,
      after: {
        familyId: input.familyId,
        familyPayerId: input.familyPayerId,
        servicePeriod: input.servicePeriod,
        totalAmountCents: family.totalAmountCents,
        currency: family.currency,
        collectionMode: "manual",
      },
    });
    return {
      invoice,
      replayed: false,
      lines: await loadIssuedLines(tx, input.organizationId, invoice.id),
      ...(await loadMonthlyChargeState(tx, input.organizationId, invoice.id)),
    };
  });
}
