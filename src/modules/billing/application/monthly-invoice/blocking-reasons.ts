/**
 * Blocking reasons of a monthly quote: per enrollment (family, price
 * assignment, tariff coverage, class snapshot) and per family (payer, lines,
 * currency, invoices already issued, reference collisions). Pure functions; the
 * reasons and their push order feed the quote hash.
 */
import type { PeriodBounds } from "./inputs";
import {
  monthlyQuoteHash,
  type QuoteFamily,
  type QuoteLine,
} from "./quote-model";
import type {
  ExistingMonthlyInvoiceRow,
  FamilyMemberRow,
  MonthlyPricePlanRow,
  PriceAssignmentRow,
  QuoteEnrollmentRow,
  TariffCoverageRow,
} from "./quote-reads";

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type EnrollmentEvaluation = {
  enrollmentReasons: string[];
  assignedPrice: QuoteFamily["enrollments"][number]["assignedPrice"];
  quoteLine: QuoteLine | null;
};

/**
 * Reasons that keep one enrollment out of the invoice, and its quote line when
 * billable.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function evaluateEnrollment(
  enrollment: QuoteEnrollmentRow,
  context: {
    bounds: PeriodBounds;
    memberships: readonly FamilyMemberRow[];
    overlapAssignments: readonly PriceAssignmentRow[];
    planById: ReadonlyMap<string, MonthlyPricePlanRow>;
    coverageByPlanTemplate: ReadonlyMap<string, readonly TariffCoverageRow[]>;
  }
): EnrollmentEvaluation {
  const { bounds, memberships, overlapAssignments, planById } = context;
  const coversEnrollmentMonth =
    enrollment.startsOn <= bounds.start &&
    (enrollment.endsOn === null || enrollment.endsOn >= bounds.end);
  const coversClassMonth =
    enrollment.classEffectiveFrom <= bounds.start &&
    (enrollment.classEffectiveTo === null ||
      enrollment.classEffectiveTo >= bounds.end);
  const enrollmentReasons: string[] = [];
  if (enrollment.status === "pending") {
    enrollmentReasons.push("ENROLLMENT_PENDING");
  } else if (!coversEnrollmentMonth) {
    enrollmentReasons.push("ENROLLMENT_PERIOD_INCOMPLETE");
  }
  if (!coversClassMonth) {
    enrollmentReasons.push("CLASS_PERIOD_INCOMPLETE");
  }
  if (memberships.length === 0) {
    enrollmentReasons.push("FAMILY_REQUIRED");
  } else if (memberships.length > 1) {
    enrollmentReasons.push("FAMILY_MEMBERSHIP_AMBIGUOUS");
  } else {
    const member = memberships[0];
    if (
      member.startsOn > bounds.start ||
      (member.endsOn !== null && member.endsOn < bounds.end)
    ) {
      enrollmentReasons.push("FAMILY_MEMBERSHIP_PERIOD_INCOMPLETE");
    }
    if (!member.familyIsActive) enrollmentReasons.push("FAMILY_INACTIVE");
  }

  let assignment =
    overlapAssignments.length === 1 ? overlapAssignments[0] : null;
  if (overlapAssignments.length === 0) {
    enrollmentReasons.push("PRICE_ASSIGNMENT_REQUIRED");
  } else if (overlapAssignments.length > 1) {
    enrollmentReasons.push("PRICE_ASSIGNMENT_AMBIGUOUS");
    assignment = null;
  } else if (
    overlapAssignments[0].startsOn > bounds.start ||
    (overlapAssignments[0].endsOn !== null &&
      overlapAssignments[0].endsOn < bounds.end)
  ) {
    enrollmentReasons.push("PRICE_ASSIGNMENT_PERIOD_INCOMPLETE");
  }

  if (
    enrollment.className.trim().length < 2 ||
    enrollment.className.trim().length > 120
  ) {
    enrollmentReasons.push("CLASS_NAME_SNAPSHOT_INVALID");
  }

  let assignedPrice: EnrollmentEvaluation["assignedPrice"] = null;
  let quoteLine: QuoteLine | null = null;
  if (assignment) {
    const plan = planById.get(assignment.pricePlanId);
    if (!plan) {
      enrollmentReasons.push("PRICE_PLAN_NOT_AVAILABLE");
    } else if (assignment.currency !== plan.currency) {
      enrollmentReasons.push("PRICE_ASSIGNMENT_CURRENCY_MISMATCH");
    } else if (!Number.isSafeInteger(assignment.unitAmountCents)) {
      enrollmentReasons.push("PRICE_AMOUNT_UNSAFE");
    } else if (assignment.unitAmountCents <= 0) {
      enrollmentReasons.push("PRICE_PLAN_ZERO_AMOUNT");
    } else {
      const coverage = context.coverageByPlanTemplate.get(
        `${plan.id}:${enrollment.classTemplateId}`
      );
      if (
        !coverage?.some(
          (row) =>
            row.startsOn <= bounds.start &&
            (row.endsOn === null || row.endsOn >= bounds.end)
        )
      ) {
        enrollmentReasons.push("TARIFF_COVERAGE_INCOMPLETE");
      }
      assignedPrice = {
        assignmentId: assignment.id,
        pricePlanId: plan.id,
        name: plan.name,
        amountCents: assignment.unitAmountCents,
        currency: assignment.currency,
        startsOn: assignment.startsOn,
        endsOn: assignment.endsOn,
      };
      if (!enrollmentReasons.includes("TARIFF_COVERAGE_INCOMPLETE")) {
        quoteLine = {
          athleteId: enrollment.athleteId,
          athleteName: enrollment.athleteName,
          pricePlanId: plan.id,
          pricePlanName: plan.name,
          unitAmountCents: assignment.unitAmountCents,
          currency: assignment.currency,
          coveredEnrollments: [
            {
              enrollmentId: enrollment.enrollmentId,
              classTemplateId: enrollment.classTemplateId,
              className: enrollment.className.trim(),
              assignmentId: assignment.id,
            },
          ],
        };
      }
    }
  }

  return { enrollmentReasons, assignedPrice, quoteLine };
}

/**
 * Invoices already issued for the period at the site, by family. Rows without
 * a site are left to indexInvoiceStatesByFamily.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function indexExistingInvoices(
  existingRows: readonly ExistingMonthlyInvoiceRow[]
) {
  const existingByFamily = new Map<string, ExistingMonthlyInvoiceRow>();
  for (const row of existingRows) {
    if (row.locationId !== null) existingByFamily.set(row.familyId, row);
  }
  const existingInvoiceIds = new Set(existingRows.map((row) => row.invoiceId));
  return { existingByFamily, existingInvoiceIds };
}

/**
 * Adds to `existingByFamily` the pre-site invoices of this site that the lines
 * read did not return: they have no monthly_fee lines for the month, so neither
 * the replay nor PERIOD_ALREADY_INVOICED would see them, yet their reference
 * names the family and the month. They then block as PERIOD_ALREADY_INVOICED or
 * INVOICE_VOIDED and report their id. An invoice found by its lines keeps its
 * place; between two without lines, one that is not voided wins.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function addLineLessSiteInvoices(
  existingByFamily: Map<string, ExistingMonthlyInvoiceRow>,
  lineInvoiceIds: ReadonlySet<string>,
  rows: readonly ExistingMonthlyInvoiceRow[]
): void {
  const isVoided = (row: ExistingMonthlyInvoiceRow) =>
    row.voidedAt !== null || row.status === "void";
  for (const row of rows) {
    const current = existingByFamily.get(row.familyId);
    if (
      !current ||
      (!lineInvoiceIds.has(current.invoiceId) &&
        isVoided(current) &&
        !isVoided(row))
    ) {
      existingByFamily.set(row.familyId, row);
    }
  }
}

/**
 * State of a family's monthly invoices for the period in one group (for
 * example, those without a site): `issued` while any of them is not voided,
 * `voided` when all of them are.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type MonthlyInvoiceState = "issued" | "voided";

/**
 * Indexes a group of monthly invoices by family, for example those without a
 * site, found by their monthly_fee lines or by their pre-site reference. An
 * invoice counts as voided with the same rule as INVOICE_VOIDED: a void status
 * or a voided timestamp.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function indexInvoiceStatesByFamily(
  rows: readonly Pick<
    ExistingMonthlyInvoiceRow,
    "familyId" | "status" | "voidedAt"
  >[]
): Map<string, MonthlyInvoiceState> {
  const stateByFamily = new Map<string, MonthlyInvoiceState>();
  for (const row of rows) {
    const voided = row.voidedAt !== null || row.status === "void";
    if (!voided) stateByFamily.set(row.familyId, "issued");
    else if (!stateByFamily.has(row.familyId)) {
      stateByFamily.set(row.familyId, "voided");
    }
  }
  return stateByFamily;
}

/**
 * Completes each family: blocking reasons, currency, total, existing invoice,
 * reference collision, `canIssue` and the quote hash. Mutates the families in
 * place, in order.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function finalizeFamilyQuotes(
  familyResults: QuoteFamily[],
  context: {
    organizationId: string;
    locationId: string;
    servicePeriod: string;
    existingByFamily: ReadonlyMap<string, ExistingMonthlyInvoiceRow>;
    siteLessByFamily: ReadonlyMap<string, MonthlyInvoiceState>;
    referenceByFamily: ReadonlyMap<string, string>;
    takenReferences: ReadonlySet<string>;
  }
): void {
  for (const family of familyResults) {
    family.blockingReasons = [
      ...new Set(
        family.enrollments
          .flatMap((item) =>
            item.status === "active" ? item.blockingReasons : []
          )
          .concat(family.conflicts.map((item) => item.code))
      ),
    ];
    if (!family.payers.length)
      family.blockingReasons.push("FAMILY_PAYER_REQUIRED");
    if (!family.lines.length)
      family.blockingReasons.push("NO_ACTIVE_ENROLLMENTS");
    const currencies = new Set(family.lines.map((line) => line.currency));
    if (currencies.size > 1) family.blockingReasons.push("CURRENCY_MISMATCH");
    family.currency = currencies.size === 1 ? [...currencies][0] : null;
    family.totalAmountCents = family.lines.reduce(
      (total, line) => total + line.unitAmountCents,
      0
    );
    const existing = context.existingByFamily.get(family.familyId);
    if (existing) {
      family.existingInvoiceId = existing.invoiceId;
      family.existingInvoiceVoided =
        existing.voidedAt !== null || existing.status === "void";
      family.blockingReasons.push(
        family.existingInvoiceVoided
          ? "INVOICE_VOIDED"
          : "PERIOD_ALREADY_INVOICED"
      );
    }
    const siteLess = context.siteLessByFamily.get(family.familyId);
    if (siteLess) {
      // A voided invoice without a site still blocks, as INVOICE_VOIDED does
      // at the site: the owner reviews it before another one is issued.
      family.blockingReasons.push(
        siteLess === "voided"
          ? "PERIOD_INVOICED_WITHOUT_SITE_VOIDED"
          : "PERIOD_INVOICED_WITHOUT_SITE"
      );
    }
    const reference = context.referenceByFamily.get(family.familyId);
    if (reference && context.takenReferences.has(reference)) {
      family.blockingReasons.push("INVOICE_REFERENCE_TAKEN");
    }
    family.blockingReasons = [...new Set(family.blockingReasons)];
    family.canIssue = family.blockingReasons.length === 0;
    family.quoteHash = monthlyQuoteHash({
      organizationId: context.organizationId,
      locationId: context.locationId,
      familyId: family.familyId,
      servicePeriod: context.servicePeriod,
      lines: family.lines.map((line) => ({
        athleteId: line.athleteId,
        pricePlanId: line.pricePlanId,
        amountCents: line.unitAmountCents,
        currency: line.currency,
        coveredEnrollments: line.coveredEnrollments,
      })),
      conflicts: family.conflicts,
      blockingReasons: family.blockingReasons,
      totalAmountCents: family.totalAmountCents,
      currency: family.currency,
    });
  }
}
