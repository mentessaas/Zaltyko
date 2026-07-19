import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  academyExpenses,
  charges,
  churnReasons,
  classCoachAssignments,
  classEnrollments,
  classWaitingList,
  classes,
  coachCompensation,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { requireLeakProfitabilityFeature } from "@/lib/product/leak-profitability-feature";
import { calculateClassProfitability } from "@/lib/reports/leak-profitability";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  academyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export const GET = withTenant(async (request, context) => {
  const disabled = requireLeakProfitabilityFeature();
  if (disabled) return disabled;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid report query", 400, parsed.error.flatten());
  }

  const period = parsed.data.period ?? currentPeriod();
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, parsed.data.academyId), eq(academies.tenantId, context.tenantId)))
    .limit(1);
  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  const [classRows, enrollmentRows, waitlistRows, chargeRows, assignmentRows, compensationRows, expenseRows, churnRows] =
    await Promise.all([
      db
        .select({ id: classes.id, name: classes.name, capacity: classes.capacity })
        .from(classes)
        .where(and(eq(classes.tenantId, context.tenantId), eq(classes.academyId, parsed.data.academyId))),
      db
        .select({ classId: classEnrollments.classId, athleteId: classEnrollments.athleteId })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.tenantId, context.tenantId), eq(classEnrollments.academyId, parsed.data.academyId))),
      db
        .select({ classId: classWaitingList.classId, athleteId: classWaitingList.athleteId })
        .from(classWaitingList)
        .where(and(eq(classWaitingList.tenantId, context.tenantId), eq(classWaitingList.academyId, parsed.data.academyId))),
      db
        .select({
          classId: charges.classId,
          amountCents: charges.amountCents,
          status: charges.status,
          dueDate: charges.dueDate,
        })
        .from(charges)
        .where(and(eq(charges.tenantId, context.tenantId), eq(charges.academyId, parsed.data.academyId), eq(charges.period, period))),
      db
        .select({ classId: classCoachAssignments.classId, coachId: classCoachAssignments.coachId })
        .from(classCoachAssignments)
        .where(eq(classCoachAssignments.tenantId, context.tenantId)),
      db
        .select()
        .from(coachCompensation)
        .where(
          and(
            eq(coachCompensation.tenantId, context.tenantId),
            eq(coachCompensation.academyId, parsed.data.academyId),
            eq(coachCompensation.isActive, true)
          )
        ),
      db
        .select()
        .from(academyExpenses)
        .where(
          and(
            eq(academyExpenses.tenantId, context.tenantId),
            eq(academyExpenses.academyId, parsed.data.academyId),
            eq(academyExpenses.isActive, true)
          )
        ),
      db
        .select({ id: churnReasons.id, athleteId: churnReasons.athleteId, reason: churnReasons.reason })
        .from(churnReasons)
        .where(and(eq(churnReasons.tenantId, context.tenantId), eq(churnReasons.academyId, parsed.data.academyId))),
    ]);

  const enrolledByClass = new Map<string, number>();
  for (const enrollment of enrollmentRows) {
    enrolledByClass.set(enrollment.classId, (enrolledByClass.get(enrollment.classId) ?? 0) + 1);
  }

  const waitlistByClass = new Map<string, number>();
  for (const entry of waitlistRows) {
    waitlistByClass.set(entry.classId, (waitlistByClass.get(entry.classId) ?? 0) + 1);
  }

  const chargesByClass = new Map<string, { expected: number; collected: number; overdue: number }>();
  for (const charge of chargeRows) {
    if (!charge.classId) continue;
    const bucket = chargesByClass.get(charge.classId) ?? { expected: 0, collected: 0, overdue: 0 };
    if (charge.status !== "cancelled") {
      bucket.expected += charge.amountCents;
    }
    if (charge.status === "paid") {
      bucket.collected += charge.amountCents;
    }
    if (charge.status === "overdue") {
      bucket.overdue += 1;
    }
    chargesByClass.set(charge.classId, bucket);
  }

  const classCount = Math.max(classRows.length, 1);
  const generalExpenseCents = expenseRows
    .filter((expense) => expense.appliesToType === "academy")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const generalExpensePerClass = Math.round(generalExpenseCents / classCount);

  const assignmentsByClass = new Map<string, string[]>();
  const assignmentsByCoach = new Map<string, number>();
  for (const assignment of assignmentRows) {
    assignmentsByClass.set(assignment.classId, [...(assignmentsByClass.get(assignment.classId) ?? []), assignment.coachId]);
    assignmentsByCoach.set(assignment.coachId, (assignmentsByCoach.get(assignment.coachId) ?? 0) + 1);
  }

  const compensationByCoach = new Map(compensationRows.map((row) => [row.coachId, row]));

  const classesReport = classRows.map((classRow) => {
    const assignedCoachIds = assignmentsByClass.get(classRow.id) ?? [];
    let missingCostData = assignedCoachIds.length === 0;
    const coachCostCents = assignedCoachIds.reduce((sum, coachId) => {
      const compensation = compensationByCoach.get(coachId);
      if (!compensation) {
        missingCostData = true;
        return sum;
      }
      const assignedClassCount = Math.max(assignmentsByCoach.get(coachId) ?? 1, 1);
      const monthlyHourlyEstimate = Math.round((compensation.hourlyRateCents * compensation.estimatedWeeklyHours * 433) / 100);
      return sum + Math.round((compensation.monthlySalaryCents + monthlyHourlyEstimate) / assignedClassCount);
    }, 0);

    const directExpenseCents = expenseRows
      .filter((expense) => expense.appliesToType === "class" && expense.appliesToId === classRow.id)
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    const revenue = chargesByClass.get(classRow.id) ?? { expected: 0, collected: 0, overdue: 0 };

    return calculateClassProfitability({
      classId: classRow.id,
      className: classRow.name,
      capacity: classRow.capacity ?? 0,
      enrolledCount: enrolledByClass.get(classRow.id) ?? 0,
      waitlistCount: waitlistByClass.get(classRow.id) ?? 0,
      expectedRevenueCents: revenue.expected,
      collectedRevenueCents: revenue.collected,
      coachCostCents,
      allocatedExpenseCents: directExpenseCents + generalExpensePerClass,
      missingCostData,
    });
  });

  const totals = classesReport.reduce(
    (acc, row) => ({
      expectedRevenueCents: acc.expectedRevenueCents + row.expectedRevenueCents,
      collectedRevenueCents: acc.collectedRevenueCents + row.collectedRevenueCents,
      estimatedCostCents: acc.estimatedCostCents + row.estimatedCostCents,
      estimatedMarginCents: acc.estimatedMarginCents + row.estimatedMarginCents,
      freeSeats: acc.freeSeats + Math.max(row.capacity - row.enrolledCount, 0),
      waitlistCount: acc.waitlistCount + row.waitlistCount,
    }),
    {
      expectedRevenueCents: 0,
      collectedRevenueCents: 0,
      estimatedCostCents: 0,
      estimatedMarginCents: 0,
      freeSeats: 0,
      waitlistCount: 0,
    }
  );

  return apiSuccess({
    period,
    isEstimated: true,
    totals,
    classes: classesReport.sort((a, b) => a.estimatedMarginCents - b.estimatedMarginCents),
    leaks: {
      overduePayments: chargeRows.filter((charge) => charge.status === "overdue").length,
      freeSeats: totals.freeSeats,
      waitlistCount: totals.waitlistCount,
      churnReasonsCount: churnRows.length,
      underOccupiedClasses: classesReport.filter((row) => row.capacity > 0 && row.occupancyRate < 0.75).length,
      classesWithMissingCosts: classesReport.filter((row) => row.missingCostData).length,
    },
  });
});

