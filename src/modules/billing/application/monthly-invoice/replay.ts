/**
 * Replay and idempotency of a monthly issuance. Two paths, neither reads the
 * invoice reference:
 *
 * - By key: the `invoice.monthly_issued` outbox marker with the same
 *   idempotency key. The payload must match the command; for
 *   athlete_monthly_v1 the quote hash is recomputed from the stored lines and
 *   total.
 * - By period: the family's monthly invoice of the site and period (lines
 *   `monthly_fee`), returned only when its marker matches payer, site, due date,
 *   quote hash and the quoted enrollment selection.
 */
import { and, asc, eq } from "drizzle-orm";

import {
  invoiceLines,
  invoices,
  outboxEvents,
  type Invoice,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import { assertIdempotencyPayload } from "@/modules/shared/infrastructure/transactional-records";

import {
  conflict,
  financialRoles,
  type IssueMonthlyInvoiceInput,
  type PeriodBounds,
} from "./inputs";
import {
  loadInvoice,
  loadIssuedLines,
  loadMonthlyReplayState,
  type IssuedMonthlyLines,
  type MonthlyChargeState,
} from "./issued-reads";
import { monthlyQuoteHash } from "./quote-model";

export type MonthlyIssueResult = {
  invoice: Invoice;
  replayed: boolean;
  lines: IssuedMonthlyLines;
} & MonthlyChargeState;

/** Quoted family as returned by buildMonthlyInvoiceOptions. */
type QuotedFamily = {
  lines: Array<{
    coveredEnrollments: Array<{ enrollmentId: string }>;
  }>;
};

/**
 * Replay by idempotency key. Returns null when there is no marker for the key;
 * throws when the marker belongs to a different command or the stored invoice
 * no longer matches its quote.
 */
export async function replayByIdempotencyKey(
  tx: TransactionClient,
  input: IssueMonthlyInvoiceInput,
  dueAt: string
): Promise<MonthlyIssueResult | null> {
  const [priorMarker] = await tx
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.eventName, "invoice.monthly_issued"),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  if (!priorMarker) return null;

  assertIdempotencyPayload(priorMarker.payload, {
    familyId: input.familyId,
    familyPayerId: input.familyPayerId,
    locationId: input.locationId,
    servicePeriod: input.servicePeriod,
    dueAt,
    quoteHash: input.quoteHash,
  });
  const invoiceId = priorMarker.payload.invoiceId;
  if (typeof invoiceId !== "string") {
    throw conflict(
      "IDEMPOTENCY_CONFLICT",
      "La factura previa no está disponible."
    );
  }
  const invoice = await loadInvoice(tx, input.organizationId, invoiceId);
  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: invoice.locationId ?? input.locationId,
    actor: input.actor,
    allowedRoles: financialRoles,
  });
  const lines = await loadIssuedLines(tx, input.organizationId, invoice.id);
  if (priorMarker.payload.pricingModel === "athlete_monthly_v1") {
    const persistedHash = monthlyQuoteHash({
      organizationId: input.organizationId,
      locationId: invoice.locationId ?? input.locationId,
      familyId: invoice.familyId,
      servicePeriod: input.servicePeriod,
      lines: lines.map((line) => ({
        athleteId: line.athleteId ?? "",
        pricePlanId: line.pricePlanId,
        amountCents: line.amountCents,
        currency: line.currency,
        coveredEnrollments: line.coveredEnrollments,
      })),
      conflicts: [],
      blockingReasons: [],
      totalAmountCents: invoice.totalAmountCents,
      currency: invoice.currency,
    });
    if (
      lines.some(
        (line) =>
          !line.athleteId ||
          !line.pricePlanId ||
          line.coveredEnrollments.length === 0
      ) ||
      persistedHash !== input.quoteHash
    ) {
      throw new OperationalError(
        "MONTHLY_INVOICE_BLOCKED",
        "La factura emitida no conserva la cobertura tarifaria esperada.",
        500
      );
    }
  }
  return {
    ...(await loadMonthlyReplayState(tx, input.organizationId, invoice.id)),
    replayed: true,
    lines,
  };
}

/**
 * Replay by period, under the issuance locks and after the second quote.
 * Returns null when the family has no monthly invoice for the site and period;
 * returns the replay when it is the same command; throws
 * PERIOD_ALREADY_INVOICED otherwise.
 */
export async function replayByPeriod(
  tx: TransactionClient,
  input: IssueMonthlyInvoiceInput,
  bounds: PeriodBounds,
  dueAt: string,
  family: QuotedFamily
): Promise<MonthlyIssueResult | null> {
  const existingInvoices = await tx
    .selectDistinct({ invoiceId: invoices.id })
    .from(invoices)
    .innerJoin(
      invoiceLines,
      and(
        eq(invoiceLines.organizationId, invoices.organizationId),
        eq(invoiceLines.invoiceId, invoices.id),
        eq(invoiceLines.lineType, "monthly_fee"),
        eq(invoiceLines.servicePeriodStart, bounds.start),
        eq(invoiceLines.servicePeriodEnd, bounds.end)
      )
    )
    .where(
      and(
        eq(invoices.organizationId, input.organizationId),
        eq(invoices.familyId, input.familyId),
        eq(invoices.locationId, input.locationId)
      )
    )
    .orderBy(asc(invoices.id))
    .limit(2);
  if (existingInvoices.length > 1) {
    throw conflict(
      "PERIOD_ALREADY_INVOICED",
      "Hay varias facturas mensuales para esta familia y periodo; la repetición no es segura.",
      { reason: "DUPLICATE_MONTHLY_INVOICES" }
    );
  }
  if (existingInvoices.length === 0) return null;

  const invoice = await loadInvoice(
    tx,
    input.organizationId,
    existingInvoices[0].invoiceId
  );
  const existingLines = await loadIssuedLines(
    tx,
    input.organizationId,
    invoice.id
  );
  const replayState = await loadMonthlyReplayState(
    tx,
    input.organizationId,
    invoice.id
  );
  const marker = await tx
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.eventName, "invoice.monthly_issued"),
        eq(outboxEvents.aggregateId, invoice.id)
      )
    )
    .limit(1);
  const currentCoverage = existingLines.flatMap((line) =>
    line.coveredEnrollments.map((covered) => covered.enrollmentId)
  );
  const currentEnrollmentIds = (
    currentCoverage.length
      ? currentCoverage
      : existingLines
          .map((line) => line.enrollmentId)
          .filter((id): id is string => id !== null)
  ).sort();
  const quotedEnrollmentIds = family.lines
    .flatMap((line) =>
      line.coveredEnrollments.map((covered) => covered.enrollmentId)
    )
    .sort();
  const sameSelection =
    JSON.stringify(currentEnrollmentIds) ===
    JSON.stringify(quotedEnrollmentIds);
  if (
    marker[0] &&
    sameSelection &&
    marker[0].payload.familyPayerId === input.familyPayerId &&
    marker[0].payload.locationId === input.locationId &&
    marker[0].payload.dueAt === dueAt &&
    marker[0].payload.quoteHash === input.quoteHash
  ) {
    return {
      ...replayState,
      replayed: true,
      lines: existingLines,
    };
  }
  throw conflict(
    "PERIOD_ALREADY_INVOICED",
    "Ya existe una factura para esta familia y periodo con otra selección o cotización.",
    { invoiceId: invoice.id }
  );
}
