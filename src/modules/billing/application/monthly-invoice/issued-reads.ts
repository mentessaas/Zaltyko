/**
 * Reads of an issued monthly invoice: header, lines with their covered
 * enrollments, and charge state (locked), plus the family cohort used by the
 * issuance. Shared by the new issuance and both replay paths.
 */
import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  athletes,
  charges,
  enrollments,
  familyMembers,
  invoiceLineEnrollments,
  invoiceLines,
  invoices,
  people,
  type Invoice,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { readAllKeysetPages } from "@/modules/billing/application/keyset-pagination";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { conflict, type PeriodBounds } from "./inputs";
import { compareNullableStrings, READ_PAGE_SIZE } from "./paging";

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type MonthlyChargeStatus = "due" | "partially_paid" | "paid" | "void";

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type MonthlyChargeState = {
  chargeStatus: MonthlyChargeStatus | "mixed";
  collectionMode: "manual";
  charges: Array<{
    id: string;
    status: MonthlyChargeStatus;
  }>;
};

/**
 * @internal Lee la cabecera sin bloquear sus cargos. Los replays la combinan
 * con loadMonthlyReplayState, que bloquea los cargos antes de leer el estado;
 * el orden de bloqueos exige pasar por issueMonthlyInvoice. Importa desde
 * monthly-invoice-service.
 */
export async function loadInvoice(
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

export async function loadIssuedLines(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
) {
  const lineRows = await readAllKeysetPages<{
    id: string;
    athleteId: string | null;
    sortAthleteId: string | null;
    enrollmentId: string | null;
    pricePlanId: string | null;
    athleteName: string;
    amountCents: number;
    currency: string;
  }>({
    pageSize: READ_PAGE_SIZE,
    cursorOf: (row) => row.id,
    fetchPage: (cursor, limit) => {
      const conditions = [
        eq(invoiceLines.organizationId, organizationId),
        eq(invoiceLines.invoiceId, invoiceId),
      ];
      if (cursor) conditions.push(gt(invoiceLines.id, cursor));
      return tx
        .select({
          id: invoiceLines.id,
          athleteId: sql<
            string | null
          >`coalesce(${invoiceLines.athleteId}, ${enrollments.athleteId})`,
          sortAthleteId: invoiceLines.athleteId,
          enrollmentId: invoiceLines.enrollmentId,
          pricePlanId: invoiceLines.pricePlanId,
          athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
          amountCents: invoiceLines.amountCents,
          currency: invoiceLines.currency,
        })
        .from(invoiceLines)
        .leftJoin(
          enrollments,
          and(
            eq(enrollments.organizationId, invoiceLines.organizationId),
            eq(enrollments.id, invoiceLines.enrollmentId)
          )
        )
        .leftJoin(
          athletes,
          and(
            eq(athletes.organizationId, invoiceLines.organizationId),
            eq(
              athletes.id,
              sql`coalesce(${invoiceLines.athleteId}, ${enrollments.athleteId})`
            )
          )
        )
        .leftJoin(
          people,
          and(
            eq(people.organizationId, athletes.organizationId),
            eq(people.id, athletes.personId)
          )
        )
        .where(and(...conditions))
        .orderBy(asc(invoiceLines.id))
        .limit(limit);
    },
  });
  const coveredRows: Array<{
    invoiceLineId: string;
    enrollmentId: string;
    classTemplateId: string;
    className: string;
    assignmentId: string;
  }> = [];
  for (let start = 0; start < lineRows.length; start += READ_PAGE_SIZE) {
    const lineIds = lineRows
      .slice(start, start + READ_PAGE_SIZE)
      .map((line) => line.id);
    const coveredPageRows = await readAllKeysetPages<{
      invoiceLineId: string;
      enrollmentId: string;
      classTemplateId: string;
      className: string;
      assignmentId: string;
    }>({
      pageSize: READ_PAGE_SIZE,
      cursorOf: (row) => `${row.invoiceLineId}:${row.enrollmentId}`,
      fetchPage: (cursor, limit) => {
        const base = and(
          eq(invoiceLineEnrollments.organizationId, organizationId),
          inArray(invoiceLineEnrollments.invoiceLineId, lineIds)
        );
        const [cursorInvoiceLineId, cursorEnrollmentId] =
          cursor?.split(":") ?? [];
        const afterCursor =
          cursorInvoiceLineId && cursorEnrollmentId
            ? or(
                gt(invoiceLineEnrollments.invoiceLineId, cursorInvoiceLineId),
                and(
                  eq(invoiceLineEnrollments.invoiceLineId, cursorInvoiceLineId),
                  gt(invoiceLineEnrollments.enrollmentId, cursorEnrollmentId)
                )
              )
            : undefined;
        return tx
          .select({
            invoiceLineId: invoiceLineEnrollments.invoiceLineId,
            enrollmentId: invoiceLineEnrollments.enrollmentId,
            classTemplateId: invoiceLineEnrollments.classTemplateId,
            className: invoiceLineEnrollments.classNameSnapshot,
            assignmentId: invoiceLineEnrollments.priceAssignmentId,
          })
          .from(invoiceLineEnrollments)
          .where(afterCursor ? and(base, afterCursor) : base)
          .orderBy(
            asc(invoiceLineEnrollments.invoiceLineId),
            asc(invoiceLineEnrollments.enrollmentId)
          )
          .limit(limit);
      },
    });
    coveredRows.push(...coveredPageRows);
  }
  const coveredByLine = new Map<string, typeof coveredRows>();
  for (const covered of coveredRows) {
    const current = coveredByLine.get(covered.invoiceLineId) ?? [];
    current.push(covered);
    coveredByLine.set(covered.invoiceLineId, current);
  }
  const orderedLineRows = [...lineRows].sort(
    (left, right) =>
      compareNullableStrings(left.sortAthleteId, right.sortAthleteId) ||
      compareNullableStrings(left.enrollmentId, right.enrollmentId) ||
      left.id.localeCompare(right.id)
  );
  return orderedLineRows.map(
    ({ id, sortAthleteId: _sortAthleteId, ...line }) => ({
      ...line,
      coveredEnrollments: (coveredByLine.get(id) ?? []).map(
        ({ invoiceLineId: _invoiceLineId, ...covered }) => covered
      ),
    })
  );
}

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type IssuedMonthlyLines = Awaited<ReturnType<typeof loadIssuedLines>>;

export async function loadMonthlyChargeState(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<MonthlyChargeState> {
  // Payment commands lock one charge. Lock each ordered page so a charge
  // cannot change after it has been included in the aggregate response.
  const rows = await readAllKeysetPages<{
    id: string;
    status: MonthlyChargeStatus;
    collectionMode: "manual" | "automatic";
  }>({
    pageSize: READ_PAGE_SIZE,
    cursorOf: (row) => row.id,
    fetchPage: (cursor, limit) => {
      const base = and(
        eq(charges.organizationId, organizationId),
        eq(charges.invoiceId, invoiceId)
      );
      return tx
        .select({
          id: charges.id,
          status: charges.status,
          collectionMode: charges.collectionMode,
        })
        .from(charges)
        .where(cursor ? and(base, gt(charges.id, cursor)) : base)
        .orderBy(asc(charges.id))
        .limit(limit)
        .for("update");
    },
  });
  if (
    rows.length === 0 ||
    rows.some((row) => row.collectionMode !== "manual")
  ) {
    throw new OperationalError(
      "MONTHLY_INVOICE_BLOCKED",
      "El estado del cargo mensual no coincide con la emisión manual esperada.",
      500
    );
  }
  const statuses = [...new Set(rows.map((row) => row.status))];
  return {
    chargeStatus: statuses.length === 1 ? statuses[0] : "mixed",
    collectionMode: "manual",
    charges: rows.map(({ id, status }) => ({ id, status })),
  };
}

export async function loadMonthlyReplayState(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<{ invoice: Invoice } & MonthlyChargeState> {
  // Payment commands lock charge rows before updating invoice status. Preserve
  // that order and read invoice status only after the charge locks have settled.
  const chargeState = await loadMonthlyChargeState(
    tx,
    organizationId,
    invoiceId
  );
  const invoice = await loadInvoice(tx, organizationId, invoiceId);
  if (invoice.voidedAt || invoice.status === "void") {
    throw conflict(
      "INVOICE_VOIDED",
      "La factura del periodo está anulada. La reemisión requiere una decisión específica.",
      { invoiceId: invoice.id }
    );
  }
  return { invoice, ...chargeState };
}

export async function loadMonthlyFamilyMemberships(
  tx: TransactionClient,
  organizationId: string,
  familyId: string,
  bounds: PeriodBounds
): Promise<Array<{ cursorId: string; athleteId: string }>> {
  return readAllKeysetPages<{ cursorId: string; athleteId: string }>({
    pageSize: READ_PAGE_SIZE,
    cursorOf: (row) => row.cursorId,
    fetchPage: (cursor, limit) => {
      const conditions = [
        eq(familyMembers.organizationId, organizationId),
        eq(familyMembers.familyId, familyId),
        lte(familyMembers.startsOn, bounds.end),
        or(
          isNull(familyMembers.endsOn),
          gte(familyMembers.endsOn, bounds.start)
        ),
      ];
      if (cursor) conditions.push(gt(familyMembers.id, cursor));
      return tx
        .select({
          cursorId: familyMembers.id,
          athleteId: familyMembers.athleteId,
        })
        .from(familyMembers)
        .where(and(...conditions))
        .orderBy(asc(familyMembers.id))
        .limit(limit);
    },
  });
}
