/**
 * Reads behind a monthly quote. Each function issues exactly the statements the
 * quote used to issue inline, in the same order when called in sequence by
 * quote.ts; the SQL snapshot in tests/__snapshots__ pins their text.
 */
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  athletes,
  classTemplates,
  enrollmentPriceAssignments,
  enrollments,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  guardians,
  invoiceLines,
  invoices,
  locations,
  people,
  pricePlans,
  pricePlanClassTemplateCoverage,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { readAllKeysetPages } from "@/modules/billing/application/keyset-pagination";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import type { MonthlyInvoiceOptionsInput, PeriodBounds } from "./inputs";
import {
  COVERAGE_PAIR_BATCH_SIZE,
  READ_FILTER_BATCH_SIZE,
  READ_PAGE_SIZE,
  readKeysetPagesByBatches,
} from "./paging";

type QuoteScope = Pick<
  MonthlyInvoiceOptionsInput,
  "organizationId" | "locationId"
>;

export type MonthlyPricePlanRow = {
  id: string;
  name: string;
  amountCents: number;
  currency: string | null;
  cadence: string;
};

export type QuoteEnrollmentRow = {
  enrollmentId: string;
  athleteId: string;
  classTemplateId: string;
  className: string;
  classEffectiveFrom: string;
  classEffectiveTo: string | null;
  athleteName: string | null;
  familySortName: string;
  givenSortName: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
};

export type FamilyMemberRow = {
  memberId: string;
  familyId: string;
  athleteId: string;
  startsOn: string;
  endsOn: string | null;
  familyIsActive: boolean;
};

export type PriceAssignmentRow = typeof enrollmentPriceAssignments.$inferSelect;

export type TariffCoverageRow = {
  id: string;
  pricePlanId: string;
  classTemplateId: string;
  startsOn: string;
  endsOn: string | null;
};

export type FamilyPayerRow = {
  familyId: string;
  familyPayerId: string;
  isPrimary: boolean;
  displayName: string | null;
  startsOn: string;
  endsOn: string | null;
};

export type ExistingMonthlyInvoiceRow = {
  familyId: string;
  invoiceId: string;
  locationId: string | null;
  status: string;
  voidedAt: Date | null;
};

export type ReferenceOwnerRow = { invoiceId: string; reference: string };

/** Active site of the quote; 404 when it does not belong to the organization. */
export async function readActiveLocation(
  tx: TransactionClient,
  input: QuoteScope
) {
  const [location] = await tx
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, input.organizationId),
        eq(locations.id, input.locationId),
        eq(locations.isActive, true)
      )
    )
    .limit(1);
  if (!location) {
    throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
  }
  return location;
}

/** Active monthly price plans, sorted by name (es) then id. */
export async function readMonthlyPricePlans(
  tx: TransactionClient,
  input: QuoteScope
): Promise<MonthlyPricePlanRow[]> {
  const plans = await readAllKeysetPages<MonthlyPricePlanRow>({
    pageSize: READ_PAGE_SIZE,
    cursorOf: (plan) => plan.id,
    fetchPage: (cursor, limit) => {
      const conditions = [
        eq(pricePlans.organizationId, input.organizationId),
        eq(pricePlans.isActive, true),
        eq(pricePlans.cadence, "monthly"),
      ];
      if (cursor) conditions.push(gt(pricePlans.id, cursor));
      return tx
        .select({
          id: pricePlans.id,
          name: pricePlans.name,
          amountCents: pricePlans.amountCents,
          currency: pricePlans.currency,
          cadence: pricePlans.cadence,
        })
        .from(pricePlans)
        .where(and(...conditions))
        .orderBy(asc(pricePlans.id))
        .limit(limit);
    },
  });
  plans.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "es") ||
      left.id.localeCompare(right.id)
  );
  return plans;
}

/**
 * Active or pending enrollments of the site that overlap the period, with an
 * active athlete; sorted by family name, given name (es) and enrollment id.
 */
export async function readPeriodEnrollments(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds
): Promise<QuoteEnrollmentRow[]> {
  const enrollmentRows = await readAllKeysetPages<QuoteEnrollmentRow>({
    pageSize: READ_PAGE_SIZE,
    cursorOf: (row) => row.enrollmentId,
    fetchPage: (cursor, limit) => {
      const conditions = [
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.locationId, input.locationId),
        inArray(enrollments.status, ["active", "pending"]),
        lte(enrollments.startsOn, bounds.end),
        or(isNull(enrollments.endsOn), gte(enrollments.endsOn, bounds.start)),
      ];
      if (cursor) conditions.push(gt(enrollments.id, cursor));
      return tx
        .select({
          enrollmentId: enrollments.id,
          athleteId: enrollments.athleteId,
          classTemplateId: enrollments.classTemplateId,
          className: classTemplates.name,
          classEffectiveFrom: classTemplates.effectiveFrom,
          classEffectiveTo: classTemplates.effectiveTo,
          athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
          familySortName: people.familyName,
          givenSortName: people.givenName,
          status: enrollments.status,
          startsOn: enrollments.startsOn,
          endsOn: enrollments.endsOn,
        })
        .from(enrollments)
        .innerJoin(
          athletes,
          and(
            eq(athletes.organizationId, enrollments.organizationId),
            eq(athletes.id, enrollments.athleteId),
            eq(athletes.isActive, true)
          )
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, athletes.organizationId),
            eq(people.id, athletes.personId)
          )
        )
        .innerJoin(
          classTemplates,
          and(
            eq(classTemplates.organizationId, enrollments.organizationId),
            eq(classTemplates.locationId, enrollments.locationId),
            eq(classTemplates.id, enrollments.classTemplateId)
          )
        )
        .where(and(...conditions))
        .orderBy(asc(enrollments.id))
        .limit(limit);
    },
  });
  enrollmentRows.sort(
    (left, right) =>
      left.familySortName.localeCompare(right.familySortName, "es") ||
      left.givenSortName.localeCompare(right.givenSortName, "es") ||
      left.enrollmentId.localeCompare(right.enrollmentId)
  );
  return enrollmentRows;
}

/** Family memberships of the athletes that overlap the period. */
export async function readAthleteFamilyMemberships(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds,
  athleteIds: readonly string[]
): Promise<FamilyMemberRow[]> {
  return readKeysetPagesByBatches<FamilyMemberRow, string>({
    values: athleteIds,
    batchSize: READ_FILTER_BATCH_SIZE,
    cursorOf: (row) => row.memberId,
    fetchPage: (ids, cursor, limit) => {
      const conditions = [
        eq(familyMembers.organizationId, input.organizationId),
        inArray(familyMembers.athleteId, ids),
        lte(familyMembers.startsOn, bounds.end),
        or(
          isNull(familyMembers.endsOn),
          gte(familyMembers.endsOn, bounds.start)
        ),
      ];
      if (cursor) conditions.push(gt(familyMembers.id, cursor));
      return tx
        .select({
          memberId: familyMembers.id,
          familyId: familyMembers.familyId,
          athleteId: familyMembers.athleteId,
          startsOn: familyMembers.startsOn,
          endsOn: familyMembers.endsOn,
          familyIsActive: families.isActive,
        })
        .from(familyMembers)
        .innerJoin(
          families,
          and(
            eq(families.organizationId, familyMembers.organizationId),
            eq(families.id, familyMembers.familyId)
          )
        )
        .where(and(...conditions))
        .orderBy(asc(familyMembers.id))
        .limit(limit);
    },
  });
}

/** Price assignments of the enrollments that overlap the period. */
export async function readEnrollmentPriceAssignments(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds,
  enrollmentIds: readonly string[]
): Promise<PriceAssignmentRow[]> {
  return readKeysetPagesByBatches<PriceAssignmentRow, string>({
    values: enrollmentIds,
    batchSize: READ_FILTER_BATCH_SIZE,
    cursorOf: (row) => row.id,
    fetchPage: (ids, cursor, limit) => {
      const conditions = [
        eq(enrollmentPriceAssignments.organizationId, input.organizationId),
        inArray(enrollmentPriceAssignments.enrollmentId, ids),
        lte(enrollmentPriceAssignments.startsOn, bounds.end),
        or(
          isNull(enrollmentPriceAssignments.endsOn),
          gte(enrollmentPriceAssignments.endsOn, bounds.start)
        ),
      ];
      if (cursor) conditions.push(gt(enrollmentPriceAssignments.id, cursor));
      return tx
        .select()
        .from(enrollmentPriceAssignments)
        .where(and(...conditions))
        .orderBy(asc(enrollmentPriceAssignments.id))
        .limit(limit);
    },
  });
}

/**
 * Tariff coverage of the distinct (price plan, class template) pairs that the
 * assigned enrollments use, for the site and period. When an enrollment has
 * several assignments the last one read decides its pair, as before.
 */
export async function readTariffCoverage(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds,
  enrollmentRows: readonly QuoteEnrollmentRow[],
  assignmentRows: readonly PriceAssignmentRow[]
): Promise<TariffCoverageRow[]> {
  const assignmentEnrollmentById = new Map(
    assignmentRows.map((row) => [row.enrollmentId, row])
  );
  const coveragePairs = [
    ...new Map(
      enrollmentRows.flatMap((enrollment) => {
        const assignment = assignmentEnrollmentById.get(
          enrollment.enrollmentId
        );
        if (!assignment) return [];
        const key = `${assignment.pricePlanId}:${enrollment.classTemplateId}`;
        return [
          [
            key,
            {
              pricePlanId: assignment.pricePlanId,
              classTemplateId: enrollment.classTemplateId,
            },
          ] as const,
        ];
      })
    ).values(),
  ];
  return readKeysetPagesByBatches<
    TariffCoverageRow,
    (typeof coveragePairs)[number]
  >({
    values: coveragePairs,
    batchSize: COVERAGE_PAIR_BATCH_SIZE,
    cursorOf: (row) => row.id,
    fetchPage: (pairs, cursor, limit) => {
      const conditions = [
        eq(pricePlanClassTemplateCoverage.organizationId, input.organizationId),
        eq(pricePlanClassTemplateCoverage.locationId, input.locationId),
        lte(pricePlanClassTemplateCoverage.startsOn, bounds.end),
        or(
          isNull(pricePlanClassTemplateCoverage.endsOn),
          gte(pricePlanClassTemplateCoverage.endsOn, bounds.start)
        ),
        or(
          ...pairs.map((pair) =>
            and(
              eq(pricePlanClassTemplateCoverage.pricePlanId, pair.pricePlanId),
              eq(
                pricePlanClassTemplateCoverage.classTemplateId,
                pair.classTemplateId
              )
            )
          )
        ),
      ];
      if (cursor)
        conditions.push(gt(pricePlanClassTemplateCoverage.id, cursor));
      return tx
        .select({
          id: pricePlanClassTemplateCoverage.id,
          pricePlanId: pricePlanClassTemplateCoverage.pricePlanId,
          classTemplateId: pricePlanClassTemplateCoverage.classTemplateId,
          startsOn: pricePlanClassTemplateCoverage.startsOn,
          endsOn: pricePlanClassTemplateCoverage.endsOn,
        })
        .from(pricePlanClassTemplateCoverage)
        .where(and(...conditions))
        .orderBy(asc(pricePlanClassTemplateCoverage.id))
        .limit(limit);
    },
  });
}

/**
 * Payers valid for the whole period whose guardian is active and linked to
 * the family; sorted by family, non-primary first, then payer id.
 */
export async function readFamilyPayers(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds,
  familyIds: readonly string[]
): Promise<FamilyPayerRow[]> {
  const payerRows = await readKeysetPagesByBatches<FamilyPayerRow, string>({
    values: familyIds,
    batchSize: READ_FILTER_BATCH_SIZE,
    cursorOf: (row) => row.familyPayerId,
    fetchPage: (ids, cursor, limit) => {
      const conditions = [
        eq(familyPayers.organizationId, input.organizationId),
        inArray(familyPayers.familyId, ids),
        lte(familyPayers.startsOn, bounds.start),
        or(isNull(familyPayers.endsOn), gte(familyPayers.endsOn, bounds.end)),
      ];
      if (cursor) conditions.push(gt(familyPayers.id, cursor));
      return tx
        .select({
          familyId: familyPayers.familyId,
          familyPayerId: familyPayers.id,
          isPrimary: familyPayers.isPrimary,
          displayName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
          startsOn: familyPayers.startsOn,
          endsOn: familyPayers.endsOn,
        })
        .from(familyPayers)
        .innerJoin(
          familyGuardians,
          and(
            eq(familyGuardians.organizationId, familyPayers.organizationId),
            eq(familyGuardians.familyId, familyPayers.familyId),
            eq(familyGuardians.guardianId, familyPayers.guardianId),
            eq(familyGuardians.isActive, true)
          )
        )
        .innerJoin(
          guardians,
          and(
            eq(guardians.organizationId, familyPayers.organizationId),
            eq(guardians.id, familyPayers.guardianId),
            eq(guardians.isActive, true)
          )
        )
        .innerJoin(
          people,
          and(
            eq(people.organizationId, guardians.organizationId),
            eq(people.id, guardians.personId)
          )
        )
        .where(and(...conditions))
        .orderBy(asc(familyPayers.id))
        .limit(limit);
    },
  });
  payerRows.sort(
    (left, right) =>
      left.familyId.localeCompare(right.familyId) ||
      Number(left.isPrimary) - Number(right.isPrimary) ||
      left.familyPayerId.localeCompare(right.familyPayerId)
  );
  return payerRows;
}

/**
 * Monthly invoices of this site, plus any monthly invoice of the family for
 * the month without a site (location_id is nullable in the ledger). Those
 * site-less invoices are not matched by the per-site replay, so they block the
 * quote instead: a false block is safer than a second invoice.
 */
export async function readExistingMonthlyInvoices(
  tx: TransactionClient,
  input: QuoteScope,
  bounds: PeriodBounds,
  familyIds: readonly string[]
): Promise<ExistingMonthlyInvoiceRow[]> {
  return readKeysetPagesByBatches<ExistingMonthlyInvoiceRow, string>({
    values: familyIds,
    batchSize: READ_FILTER_BATCH_SIZE,
    cursorOf: (row) => row.invoiceId,
    fetchPage: (ids, cursor, limit) => {
      const conditions = [
        eq(invoices.organizationId, input.organizationId),
        or(
          eq(invoices.locationId, input.locationId),
          isNull(invoices.locationId)
        ),
        inArray(invoices.familyId, ids),
        eq(invoiceLines.lineType, "monthly_fee"),
        eq(invoiceLines.servicePeriodStart, bounds.start),
        eq(invoiceLines.servicePeriodEnd, bounds.end),
      ];
      if (cursor) conditions.push(gt(invoices.id, cursor));
      return tx
        .select({
          familyId: invoices.familyId,
          invoiceId: invoices.id,
          locationId: invoices.locationId,
          status: invoices.status,
          voidedAt: invoices.voidedAt,
        })
        .from(invoices)
        .innerJoin(
          invoiceLines,
          and(
            eq(invoiceLines.organizationId, invoices.organizationId),
            eq(invoiceLines.invoiceId, invoices.id)
          )
        )
        .where(and(...conditions))
        .groupBy(
          invoices.id,
          invoices.familyId,
          invoices.locationId,
          invoices.status,
          invoices.voidedAt
        )
        .orderBy(asc(invoices.id))
        .limit(limit);
    },
  });
}

/**
 * Invoices of the organization that already hold one of the references.
 * invoices_reference_uq is UNIQUE (organization_id, reference), so this read
 * is not filtered by site.
 */
export async function readReferenceOwners(
  tx: TransactionClient,
  input: QuoteScope,
  references: readonly string[]
): Promise<ReferenceOwnerRow[]> {
  return readKeysetPagesByBatches<ReferenceOwnerRow, string>({
    values: references,
    batchSize: READ_FILTER_BATCH_SIZE,
    cursorOf: (row) => row.invoiceId,
    fetchPage: (refs, cursor, limit) => {
      const conditions = [
        eq(invoices.organizationId, input.organizationId),
        inArray(invoices.reference, refs),
      ];
      if (cursor) conditions.push(gt(invoices.id, cursor));
      return tx
        .select({ invoiceId: invoices.id, reference: invoices.reference })
        .from(invoices)
        .where(and(...conditions))
        .orderBy(asc(invoices.id))
        .limit(limit);
    },
  });
}
