import { createHash } from "node:crypto";

export type CoveredEnrollment = {
  enrollmentId: string;
  classTemplateId: string;
  className: string;
  assignmentId: string;
};

export type QuoteLine = {
  athleteId: string;
  athleteName: string | null;
  pricePlanId: string;
  pricePlanName: string;
  unitAmountCents: number;
  currency: string;
  coveredEnrollments: CoveredEnrollment[];
};

export type QuoteFamily = {
  familyId: string;
  athleteNames: string[];
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
  enrollments: Array<{
    enrollmentId: string;
    athleteId: string;
    athleteName: string | null;
    status: string;
    billable: boolean;
    blockingReasons: string[];
    assignedPrice: {
      assignmentId: string;
      pricePlanId: string;
      name: string;
      amountCents: number;
      currency: string;
      startsOn: string;
      endsOn: string | null;
    } | null;
  }>;
  lines: QuoteLine[];
  conflicts: Array<{
    athleteId: string;
    code: "ATHLETE_TARIFF_CONFLICT" | "TARIFF_COVERAGE_INCOMPLETE";
    enrollmentIds: string[];
  }>;
  totalAmountCents: number;
  currency: string | null;
  blockingReasons: string[];
  canIssue: boolean;
  quoteHash: string | null;
  existingInvoiceId: string | null;
  existingInvoiceVoided: boolean;
};

/** A line as it enters the quote hash (quoted or recovered from a stored invoice). */
export type HashedMonthlyLine = {
  athleteId: string;
  pricePlanId: string | null;
  amountCents: number;
  currency: string;
  coveredEnrollments: CoveredEnrollment[];
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalMonthlyLines(lines: HashedMonthlyLine[]) {
  return [...lines]
    .sort((left, right) => left.athleteId.localeCompare(right.athleteId))
    .map((line) => ({
      athleteId: line.athleteId,
      pricePlanId: line.pricePlanId,
      amountCents: line.amountCents,
      currency: line.currency,
      coveredEnrollments: [...line.coveredEnrollments]
        .sort((left, right) =>
          left.enrollmentId.localeCompare(right.enrollmentId)
        )
        .map((covered) => ({
          enrollmentId: covered.enrollmentId,
          classTemplateId: covered.classTemplateId,
          className: covered.className,
          assignmentId: covered.assignmentId,
        })),
    }));
}

/**
 * Hash that binds an issuance to the exact quote shown to the owner. The key
 * order and the sorts are part of the contract: replays recompute it from the
 * stored invoice, so any change here breaks idempotent replays of old invoices.
 */
export function monthlyQuoteHash(input: {
  organizationId: string;
  locationId: string;
  familyId: string;
  servicePeriod: string;
  lines: HashedMonthlyLine[];
  conflicts: QuoteFamily["conflicts"];
  blockingReasons: string[];
  totalAmountCents: number;
  currency: string | null;
}): string {
  return fingerprint({
    organizationId: input.organizationId,
    locationId: input.locationId,
    familyId: input.familyId,
    servicePeriod: input.servicePeriod,
    lines: canonicalMonthlyLines(input.lines),
    conflicts: [...input.conflicts]
      .sort((left, right) => left.athleteId.localeCompare(right.athleteId))
      .map((conflict) => ({
        athleteId: conflict.athleteId,
        code: conflict.code,
        enrollmentIds: [...conflict.enrollmentIds].sort(),
      })),
    blockingReasons: [...input.blockingReasons].sort(),
    totalAmountCents: input.totalAmountCents,
    currency: input.currency,
  });
}
