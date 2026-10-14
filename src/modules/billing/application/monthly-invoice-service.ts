import { createHash } from "node:crypto";

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
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  charges,
  classTemplates,
  enrollmentPriceAssignments,
  enrollments,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  guardians,
  invoiceLines,
  invoiceLineEnrollments,
  invoices,
  locations,
  outboxEvents,
  people,
  pricePlans,
  pricePlanClassTemplateCoverage,
  type Invoice,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import { issueInvoiceInTransaction } from "@/modules/billing/application/ledger-service";
import { readAllKeysetPages } from "@/modules/billing/application/keyset-pagination";
import { calendarDueDateToUtc } from "@/modules/billing/domain/calendar-due-date";
import { operationalActorSchema } from "@/modules/shared/application/actor";
import {
  OperationalError,
  type OperationalErrorCode,
} from "@/modules/shared/domain/operational-error";
import { assertOperationalAccess } from "@/modules/shared/infrastructure/operational-authorization";
import {
  appendAuditEntry,
  appendOutboxEvent,
  assertIdempotencyPayload,
  lockCommand,
} from "@/modules/shared/infrastructure/transactional-records";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const keySchema = z.string().trim().min(8).max(180);
const financialRoles = ["owner", "admin"] as const;
const READ_PAGE_SIZE = 200;

function compareNullableStrings(
  left: string | null,
  right: string | null
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export type MonthlyInvoiceOptionsInput = {
  organizationId: string;
  locationId: string;
  servicePeriod: string;
  actor: z.infer<typeof operationalActorSchema>;
};

export type IssueMonthlyInvoiceInput = MonthlyInvoiceOptionsInput & {
  familyId: string;
  familyPayerId: string;
  dueDate: string;
  quoteHash: string;
  idempotencyKey: string;
};

function periodBounds(servicePeriod: string): { start: string; end: string } {
  const parsed = periodSchema.safeParse(servicePeriod);
  if (!parsed.success) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "El periodo debe tener formato YYYY-MM.",
      422
    );
  }
  const [year, month] = servicePeriod.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${servicePeriod}-01`, end };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalMonthlyLines(
  lines: Array<{
    athleteId: string;
    pricePlanId: string | null;
    amountCents: number;
    currency: string;
    coveredEnrollments: Array<{
      enrollmentId: string;
      classTemplateId: string;
      className: string;
      assignmentId: string;
    }>;
  }>
) {
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

function monthlyQuoteHash(input: {
  organizationId: string;
  locationId: string;
  familyId: string;
  servicePeriod: string;
  lines: Array<{
    athleteId: string;
    pricePlanId: string | null;
    amountCents: number;
    currency: string;
    coveredEnrollments: Array<{
      enrollmentId: string;
      classTemplateId: string;
      className: string;
      assignmentId: string;
    }>;
  }>;
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

type QuoteLine = {
  athleteId: string;
  athleteName: string | null;
  pricePlanId: string;
  pricePlanName: string;
  unitAmountCents: number;
  currency: string;
  coveredEnrollments: Array<{
    enrollmentId: string;
    classTemplateId: string;
    className: string;
    assignmentId: string;
  }>;
};

type QuoteFamily = {
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

async function buildMonthlyInvoiceOptions(
  tx: TransactionClient,
  input: MonthlyInvoiceOptionsInput
) {
  const bounds = periodBounds(input.servicePeriod);
  await assertOperationalAccess(tx, {
    organizationId: input.organizationId,
    locationId: input.locationId,
    actor: input.actor,
    allowedRoles: financialRoles,
  });

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

  const plans = await tx
    .select({
      id: pricePlans.id,
      name: pricePlans.name,
      amountCents: pricePlans.amountCents,
      currency: pricePlans.currency,
      cadence: pricePlans.cadence,
    })
    .from(pricePlans)
    .where(
      and(
        eq(pricePlans.organizationId, input.organizationId),
        eq(pricePlans.isActive, true),
        eq(pricePlans.cadence, "monthly")
      )
    )
    .orderBy(asc(pricePlans.name))
    .limit(100);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const enrollmentRows = await tx
    .select({
      enrollmentId: enrollments.id,
      athleteId: enrollments.athleteId,
      classTemplateId: enrollments.classTemplateId,
      className: classTemplates.name,
      athleteName: sql<string>`nullif(btrim(concat_ws(' ', ${people.givenName}, ${people.familyName})), '')`,
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
    .where(
      and(
        eq(enrollments.organizationId, input.organizationId),
        eq(enrollments.locationId, input.locationId),
        inArray(enrollments.status, ["active", "pending"]),
        lte(enrollments.startsOn, bounds.end),
        or(isNull(enrollments.endsOn), gte(enrollments.endsOn, bounds.start))
      )
    )
    .orderBy(asc(people.familyName), asc(people.givenName), asc(enrollments.id))
    .limit(1000);

  const athleteIds = [...new Set(enrollmentRows.map((row) => row.athleteId))];
  const enrollmentIds = enrollmentRows.map((row) => row.enrollmentId);
  const memberRows = athleteIds.length
    ? await tx
        .select({
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
        .where(
          and(
            eq(familyMembers.organizationId, input.organizationId),
            inArray(familyMembers.athleteId, athleteIds),
            lte(familyMembers.startsOn, bounds.end),
            or(
              isNull(familyMembers.endsOn),
              gte(familyMembers.endsOn, bounds.start)
            )
          )
        )
        .limit(2000)
    : [];
  const assignmentRows = enrollmentIds.length
    ? await tx
        .select()
        .from(enrollmentPriceAssignments)
        .where(
          and(
            eq(enrollmentPriceAssignments.organizationId, input.organizationId),
            inArray(enrollmentPriceAssignments.enrollmentId, enrollmentIds),
            lte(enrollmentPriceAssignments.startsOn, bounds.end),
            or(
              isNull(enrollmentPriceAssignments.endsOn),
              gte(enrollmentPriceAssignments.endsOn, bounds.start)
            )
          )
        )
        .orderBy(asc(enrollmentPriceAssignments.startsOn))
        .limit(2000)
    : [];

  const assignedPlanIds = [
    ...new Set(assignmentRows.map((assignment) => assignment.pricePlanId)),
  ];
  const classTemplateIds = [
    ...new Set(enrollmentRows.map((enrollment) => enrollment.classTemplateId)),
  ];
  const coverageRows =
    assignedPlanIds.length && classTemplateIds.length
      ? await tx
          .select({
            pricePlanId: pricePlanClassTemplateCoverage.pricePlanId,
            classTemplateId: pricePlanClassTemplateCoverage.classTemplateId,
            startsOn: pricePlanClassTemplateCoverage.startsOn,
            endsOn: pricePlanClassTemplateCoverage.endsOn,
          })
          .from(pricePlanClassTemplateCoverage)
          .where(
            and(
              eq(
                pricePlanClassTemplateCoverage.organizationId,
                input.organizationId
              ),
              eq(pricePlanClassTemplateCoverage.locationId, input.locationId),
              inArray(
                pricePlanClassTemplateCoverage.pricePlanId,
                assignedPlanIds
              ),
              inArray(
                pricePlanClassTemplateCoverage.classTemplateId,
                classTemplateIds
              ),
              lte(pricePlanClassTemplateCoverage.startsOn, bounds.end),
              or(
                isNull(pricePlanClassTemplateCoverage.endsOn),
                gte(pricePlanClassTemplateCoverage.endsOn, bounds.start)
              )
            )
          )
          .orderBy(asc(pricePlanClassTemplateCoverage.startsOn))
          .limit(4000)
      : [];

  const familyIds = [...new Set(memberRows.map((row) => row.familyId))];
  const payerRows = familyIds.length
    ? await tx
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
        .where(
          and(
            eq(familyPayers.organizationId, input.organizationId),
            inArray(familyPayers.familyId, familyIds),
            lte(familyPayers.startsOn, bounds.start),
            or(
              isNull(familyPayers.endsOn),
              gte(familyPayers.endsOn, bounds.end)
            )
          )
        )
        .orderBy(asc(familyPayers.familyId), asc(familyPayers.isPrimary))
        .limit(1000)
    : [];

  const memberByAthlete = new Map<string, typeof memberRows>();
  for (const row of memberRows) {
    const current = memberByAthlete.get(row.athleteId) ?? [];
    current.push(row);
    memberByAthlete.set(row.athleteId, current);
  }
  const assignmentsByEnrollment = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) {
    const current = assignmentsByEnrollment.get(row.enrollmentId) ?? [];
    current.push(row);
    assignmentsByEnrollment.set(row.enrollmentId, current);
  }
  const coverageByPlanTemplate = new Map<string, typeof coverageRows>();
  for (const row of coverageRows) {
    const key = `${row.pricePlanId}:${row.classTemplateId}`;
    const current = coverageByPlanTemplate.get(key) ?? [];
    current.push(row);
    coverageByPlanTemplate.set(key, current);
  }
  const payersByFamily = new Map<string, typeof payerRows>();
  for (const row of payerRows) {
    const current = payersByFamily.get(row.familyId) ?? [];
    current.push(row);
    payersByFamily.set(row.familyId, current);
  }

  const familyMap = new Map<string, QuoteFamily>();
  const candidatesByFamily = new Map<string, QuoteLine[]>();
  const unassignedEnrollments: Array<{
    enrollmentId: string;
    athleteId: string;
    athleteName: string | null;
    status: string;
    blockingReasons: string[];
  }> = [];

  for (const enrollment of enrollmentRows) {
    const memberships = memberByAthlete.get(enrollment.athleteId) ?? [];
    const overlapAssignments =
      assignmentsByEnrollment.get(enrollment.enrollmentId) ?? [];
    const coversEnrollmentMonth =
      enrollment.startsOn <= bounds.start &&
      (enrollment.endsOn === null || enrollment.endsOn >= bounds.end);
    const enrollmentReasons: string[] = [];
    if (enrollment.status === "pending") {
      enrollmentReasons.push("ENROLLMENT_PENDING");
    } else if (!coversEnrollmentMonth) {
      enrollmentReasons.push("ENROLLMENT_PERIOD_INCOMPLETE");
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

    let assignedPrice: QuoteFamily["enrollments"][number]["assignedPrice"] =
      null;
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
        const coverage = coverageByPlanTemplate.get(
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
    const candidates = candidatesByFamily.get(family.familyId) ?? [];
    const activeEnrollmentsByAthlete = new Map<
      string,
      QuoteFamily["enrollments"]
    >();
    for (const enrollment of family.enrollments) {
      if (enrollment.status !== "active") continue;
      const current =
        activeEnrollmentsByAthlete.get(enrollment.athleteId) ?? [];
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
  const existingRows = familyIds.length
    ? await tx
        .select({
          familyId: invoices.familyId,
          invoiceId: invoices.id,
          status: invoices.status,
          voidedAt: invoices.voidedAt,
        })
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
            eq(invoices.locationId, input.locationId),
            inArray(invoices.familyId, familyIds)
          )
        )
        .limit(1000)
    : [];
  const existingByFamily = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) existingByFamily.set(row.familyId, row);

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
    const existing = existingByFamily.get(family.familyId);
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
    family.blockingReasons = [...new Set(family.blockingReasons)];
    family.canIssue = family.blockingReasons.length === 0;
    family.quoteHash = monthlyQuoteHash({
      organizationId: input.organizationId,
      locationId: input.locationId,
      familyId: family.familyId,
      servicePeriod: input.servicePeriod,
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

  return {
    organizationId: input.organizationId,
    locationId: input.locationId,
    servicePeriod: input.servicePeriod,
    servicePeriodStart: bounds.start,
    servicePeriodEnd: bounds.end,
    timezone: location.timezone,
    pricingNote:
      "Una cuota mensual completa por gimnasta; las clases incluidas se declaran explícitamente. No se prorratea.",
    pricePlans: plans,
    families: familyResults.map((family) => ({
      ...family,
      lines: family.lines.map((line) => ({
        athleteId: line.athleteId,
        athleteName: line.athleteName,
        pricePlanId: line.pricePlanId,
        pricePlanName: line.pricePlanName,
        amountCents: line.unitAmountCents,
        currency: line.currency,
        coveredEnrollments: line.coveredEnrollments,
      })),
    })),
    unassignedEnrollments,
  };
}

export async function getMonthlyInvoiceOptions(
  input: MonthlyInvoiceOptionsInput
) {
  return db.transaction((tx) => buildMonthlyInvoiceOptions(tx, input));
}

function conflict(
  code: OperationalErrorCode,
  detail: string,
  extra?: Record<string, unknown>
) {
  return new OperationalError(code, detail, 409, extra);
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

async function loadIssuedLines(
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

async function loadMonthlyChargeState(
  tx: TransactionClient,
  organizationId: string,
  invoiceId: string
): Promise<{
  chargeStatus: "due" | "partially_paid" | "paid" | "void" | "mixed";
  collectionMode: "manual";
  charges: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
  }>;
}> {
  // Payment commands lock one charge. Lock each ordered page so a charge
  // cannot change after it has been included in the aggregate response.
  const rows = await readAllKeysetPages<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
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

export async function issueMonthlyInvoice(
  command: IssueMonthlyInvoiceInput
): Promise<{
  invoice: Invoice;
  replayed: boolean;
  lines: Awaited<ReturnType<typeof loadIssuedLines>>;
  chargeStatus: "due" | "partially_paid" | "paid" | "void" | "mixed";
  collectionMode: "manual";
  charges: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
  }>;
}> {
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
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-period:${input.locationId}:${input.servicePeriod}`
    );
    const lockedLocation = await tx.execute(sql`
      select id from zaltyko.locations
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.locationId}::uuid
        and is_active = true
      for update
    `);
    if (lockedLocation.rows.length === 0) {
      throw new OperationalError("NOT_FOUND", "Sede no encontrada", 404);
    }
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-family:${input.familyId}:${input.servicePeriod}`
    );
    // Shared lock order with family association: family row, sorted athletes,
    // then sorted enrollment rows. This makes the quote a stable family snapshot.
    await lockCommand(
      tx,
      input.organizationId,
      `monthly-family-scope:${input.familyId}`
    );
    await tx.execute(sql`
      select id from zaltyko.families
      where organization_id = ${input.organizationId}::uuid
        and id = ${input.familyId}::uuid
      for update
    `);
    const [location] = await tx
      .select({ timezone: locations.timezone })
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
    const dueAt = calendarDueDateToUtc(input.dueDate, location.timezone);
    // The shared family-scope lock above serializes this complete cohort read
    // with family association changes while stable pages are fetched.
    const familyAthletes = await readAllKeysetPages<{
      cursorId: string;
      athleteId: string;
    }>({
      pageSize: READ_PAGE_SIZE,
      cursorOf: (row) => row.cursorId,
      fetchPage: (cursor, limit) => {
        const conditions = [
          eq(familyMembers.organizationId, input.organizationId),
          eq(familyMembers.familyId, input.familyId),
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
    const familyAthleteIds = [
      ...new Set(familyAthletes.map((row) => row.athleteId)),
    ].sort();
    if (familyAthleteIds.length) {
      await tx.execute(sql`
        select id from zaltyko.athletes
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            familyAthleteIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
    }
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
    if (priorMarker) {
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
        invoice,
        replayed: true,
        lines,
        ...(await loadMonthlyChargeState(tx, input.organizationId, invoice.id)),
      };
    }

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
    const enrollmentIds = candidate.enrollments
      .map((item) => item.enrollmentId)
      .sort();
    for (const enrollmentId of enrollmentIds) {
      await lockCommand(
        tx,
        input.organizationId,
        `monthly-enrollment:${enrollmentId}:${input.servicePeriod}`
      );
    }
    const lockedEnrollments = enrollmentIds.length
      ? await tx.execute(sql`
        select id, class_template_id from zaltyko.enrollments
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            enrollmentIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `)
      : { rows: [] as Array<Record<string, unknown>> };
    const classTemplateIds = [
      ...new Set(
        lockedEnrollments.rows.map((row) => String(row.class_template_id))
      ),
    ].sort();
    const assignmentLocks = enrollmentIds.length
      ? await tx.execute(sql`
        select id, price_plan_id from zaltyko.enrollment_price_assignments
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and enrollment_id in (${sql.join(
            enrollmentIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and starts_on <= ${bounds.end}::date
          and (ends_on is null or ends_on >= ${bounds.start}::date)
        order by id for update
      `)
      : { rows: [] as Array<Record<string, unknown>> };
    const pricePlanIds = [
      ...new Set(assignmentLocks.rows.map((row) => String(row.price_plan_id))),
    ].sort();
    if (classTemplateIds.length && pricePlanIds.length) {
      await tx.execute(sql`
        select id from zaltyko.price_plan_class_template_coverage
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and price_plan_id in (${sql.join(
            pricePlanIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and class_template_id in (${sql.join(
            classTemplateIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
          and starts_on <= ${bounds.end}::date
          and (ends_on is null or ends_on >= ${bounds.start}::date)
        order by id for update
      `);
    }
    if (classTemplateIds.length) {
      await tx.execute(sql`
        select id from zaltyko.class_templates
        where organization_id = ${input.organizationId}::uuid
          and location_id = ${input.locationId}::uuid
          and id in (${sql.join(
            classTemplateIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
    }
    if (pricePlanIds.length) {
      await tx.execute(sql`
        select id from zaltyko.price_plans
        where organization_id = ${input.organizationId}::uuid
          and id in (${sql.join(
            pricePlanIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})
        order by id for update
      `);
    }

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
    if (existingInvoices.length === 1) {
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
      if (invoice.voidedAt || invoice.status === "void") {
        throw conflict(
          "INVOICE_VOIDED",
          "La factura del periodo está anulada. La reemisión requiere una decisión específica.",
          { invoiceId: invoice.id }
        );
      }
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
          invoice,
          replayed: true,
          lines: existingLines,
          ...(await loadMonthlyChargeState(
            tx,
            input.organizationId,
            invoice.id
          )),
        };
      }
      throw conflict(
        "PERIOD_ALREADY_INVOICED",
        "Ya existe una factura para esta familia y periodo con otra selección o cotización.",
        { invoiceId: invoice.id }
      );
    }

    if (family.quoteHash !== input.quoteHash) {
      throw conflict(
        "QUOTE_STALE",
        "La cotización cambió. Actualiza la vista previa."
      );
    }
    if (!family.canIssue || !family.currency) {
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
    const athleteIds = family.lines.map((line) => line.athleteId).sort();
    const previouslyBilledAthletes = await tx
      .select({
        invoiceId: invoiceLines.invoiceId,
        athleteId: sql<
          string | null
        >`coalesce(${invoiceLines.athleteId}, ${enrollments.athleteId})`,
      })
      .from(invoiceLines)
      .innerJoin(
        invoices,
        and(
          eq(invoices.organizationId, invoiceLines.organizationId),
          eq(invoices.id, invoiceLines.invoiceId)
        )
      )
      .leftJoin(
        enrollments,
        and(
          eq(enrollments.organizationId, invoiceLines.organizationId),
          eq(enrollments.id, invoiceLines.enrollmentId)
        )
      )
      .where(
        and(
          eq(invoiceLines.organizationId, input.organizationId),
          eq(invoices.locationId, input.locationId),
          eq(invoiceLines.lineType, "monthly_fee"),
          eq(invoiceLines.servicePeriodStart, bounds.start),
          eq(invoiceLines.servicePeriodEnd, bounds.end),
          or(
            inArray(invoiceLines.athleteId, athleteIds),
            inArray(enrollments.athleteId, athleteIds)
          )
        )
      )
      .limit(1);
    if (previouslyBilledAthletes.length) {
      throw conflict(
        "ENROLLMENT_ALREADY_BILLED",
        "Una o más gimnastas ya tienen una cuota para esta sede y este periodo.",
        {
          invoiceId: previouslyBilledAthletes[0].invoiceId,
          athleteId: previouslyBilledAthletes[0].athleteId,
        }
      );
    }

    const reference = `MENSUAL-${input.servicePeriod.replace("-", "")}-${input.familyId}`;
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
    );

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
