/**
 * Groups the quoted enrollments by family and resolves one monthly line per
 * athlete (or a tariff conflict). Pure functions over the rows read by
 * quote-reads.ts; family order is the order of first appearance in the sorted
 * enrollments.
 */
import type { PeriodBounds } from "./inputs";
import { evaluateEnrollment } from "./blocking-reasons";
import type { QuoteFamily, QuoteLine } from "./quote-model";
import type {
  FamilyMemberRow,
  FamilyPayerRow,
  MonthlyPricePlanRow,
  PriceAssignmentRow,
  QuoteEnrollmentRow,
  TariffCoverageRow,
} from "./quote-reads";

/**
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export type UnassignedEnrollment = {
  enrollmentId: string;
  athleteId: string;
  athleteName: string | null;
  status: string;
  blockingReasons: string[];
};

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

/**
 * One QuoteFamily per family with an enrollment in the period, plus the
 * enrollments of athletes without a family. Lines and conflicts are resolved
 * per athlete; totals, reasons and hashes are left to finalizeFamilyQuotes.
 *
 * @internal Uso exclusivo de monthly-invoice/*; la API pública está en
 * monthly-invoice-service.ts.
 */
export function assembleQuoteFamilies(args: {
  bounds: PeriodBounds;
  plans: readonly MonthlyPricePlanRow[];
  enrollmentRows: readonly QuoteEnrollmentRow[];
  memberRows: readonly FamilyMemberRow[];
  assignmentRows: readonly PriceAssignmentRow[];
  coverageRows: readonly TariffCoverageRow[];
  payerRows: readonly FamilyPayerRow[];
}): {
  familyResults: QuoteFamily[];
  unassignedEnrollments: UnassignedEnrollment[];
} {
  const planById = new Map(args.plans.map((plan) => [plan.id, plan]));
  const memberByAthlete = groupBy(args.memberRows, (row) => row.athleteId);
  const assignmentsByEnrollment = groupBy(
    args.assignmentRows,
    (row) => row.enrollmentId
  );
  const coverageByPlanTemplate = groupBy(
    args.coverageRows,
    (row) => `${row.pricePlanId}:${row.classTemplateId}`
  );
  const payersByFamily = groupBy(args.payerRows, (row) => row.familyId);

  const familyMap = new Map<string, QuoteFamily>();
  const candidatesByFamily = new Map<string, QuoteLine[]>();
  const unassignedEnrollments: UnassignedEnrollment[] = [];

  for (const enrollment of args.enrollmentRows) {
    const memberships = memberByAthlete.get(enrollment.athleteId) ?? [];
    const { enrollmentReasons, assignedPrice, quoteLine } = evaluateEnrollment(
      enrollment,
      {
        bounds: args.bounds,
        memberships,
        overlapAssignments:
          assignmentsByEnrollment.get(enrollment.enrollmentId) ?? [],
        planById,
        coverageByPlanTemplate,
      }
    );

    if (memberships.length === 0) {
      unassignedEnrollments.push({
        enrollmentId: enrollment.enrollmentId,
        athleteId: enrollment.athleteId,
        athleteName: enrollment.athleteName,
        status: enrollment.status,
        blockingReasons: enrollmentReasons,
      });
      continue;
    }

    for (const membership of memberships) {
      let family = familyMap.get(membership.familyId);
      if (!family) {
        family = {
          familyId: membership.familyId,
          athleteNames: [],
          payers: (payersByFamily.get(membership.familyId) ?? []).map(
            (payer) => ({
              familyPayerId: payer.familyPayerId,
              displayName: payer.displayName,
              isPrimary: payer.isPrimary,
            })
          ),
          enrollments: [],
          lines: [],
          conflicts: [],
          totalAmountCents: 0,
          currency: null,
          blockingReasons: [],
          canIssue: false,
          quoteHash: null,
          existingInvoiceId: null,
          existingInvoiceVoided: false,
        };
        familyMap.set(membership.familyId, family);
      }
      if (
        enrollment.athleteName &&
        !family.athleteNames.includes(enrollment.athleteName)
      ) {
        family.athleteNames.push(enrollment.athleteName);
      }
      family.enrollments.push({
        enrollmentId: enrollment.enrollmentId,
        athleteId: enrollment.athleteId,
        athleteName: enrollment.athleteName,
        status: enrollment.status,
        billable:
          enrollment.status === "active" && enrollmentReasons.length === 0,
        blockingReasons: enrollmentReasons,
        assignedPrice,
      });
      if (
        enrollment.status === "active" &&
        quoteLine &&
        enrollmentReasons.length === 0
      ) {
        const candidates = candidatesByFamily.get(family.familyId) ?? [];
        candidates.push(quoteLine);
        candidatesByFamily.set(family.familyId, candidates);
      }
    }
  }

  const familyResults = [...familyMap.values()];
  for (const family of familyResults) {
    resolveAthleteLines(family, candidatesByFamily.get(family.familyId) ?? []);
  }
  return { familyResults, unassignedEnrollments };
}

/**
 * One line per athlete when every active enrollment of the athlete is billable
 * with the same plan, amount and currency; otherwise a conflict (incomplete
 * coverage or different tariffs) and no line.
 */
function resolveAthleteLines(family: QuoteFamily, candidates: QuoteLine[]) {
  const activeEnrollmentsByAthlete = new Map<
    string,
    QuoteFamily["enrollments"]
  >();
  for (const enrollment of family.enrollments) {
    if (enrollment.status !== "active") continue;
    const current = activeEnrollmentsByAthlete.get(enrollment.athleteId) ?? [];
    current.push(enrollment);
    activeEnrollmentsByAthlete.set(enrollment.athleteId, current);
  }

  for (const [athleteId, activeEnrollments] of activeEnrollmentsByAthlete) {
    const enrollmentIds = activeEnrollments
      .map((enrollment) => enrollment.enrollmentId)
      .sort();
    const athleteCandidates = candidates
      .filter((line) => line.athleteId === athleteId)
      .sort((left, right) =>
        left.coveredEnrollments[0].enrollmentId.localeCompare(
          right.coveredEnrollments[0].enrollmentId
        )
      );
    const incompleteCoverage = activeEnrollments.some((enrollment) =>
      enrollment.blockingReasons.includes("TARIFF_COVERAGE_INCOMPLETE")
    );
    if (incompleteCoverage) {
      family.conflicts.push({
        athleteId,
        code: "TARIFF_COVERAGE_INCOMPLETE",
        enrollmentIds,
      });
    }
    if (
      athleteCandidates.length !== enrollmentIds.length ||
      incompleteCoverage
    ) {
      continue;
    }

    const signatures = new Set(
      athleteCandidates.map((line) =>
        JSON.stringify({
          pricePlanId: line.pricePlanId,
          amountCents: line.unitAmountCents,
          currency: line.currency,
        })
      )
    );
    if (signatures.size > 1) {
      family.conflicts.push({
        athleteId,
        code: "ATHLETE_TARIFF_CONFLICT",
        enrollmentIds,
      });
      continue;
    }

    const [snapshot] = athleteCandidates;
    family.lines.push({
      ...snapshot,
      coveredEnrollments: athleteCandidates
        .flatMap((line) => line.coveredEnrollments)
        .sort((left, right) =>
          left.enrollmentId.localeCompare(right.enrollmentId)
        ),
    });
  }
  family.lines.sort((left, right) =>
    left.athleteId.localeCompare(right.athleteId)
  );
  family.conflicts.sort((left, right) =>
    left.athleteId.localeCompare(right.athleteId)
  );
}
