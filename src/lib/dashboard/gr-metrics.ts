// Gymnastics-specific (GR) dashboard metrics

import { addDays, formatISO } from "date-fns";
import { and, count, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { athletes, athleteAssessments, events, federativeLicenses } from "@/db/schema";
import type { AthleteCategoryCount, ExpiringLicense, GrDashboardMetrics, UpcomingCompetition } from "./types";

export interface GrMetricsParams {
  academyId: string;
  tenantId: string;
  athleteIds: string[];
}

/**
 * Calculate GR-specific metrics for gymnastics academies (ritmica, artistica)
 */
export async function calculateGrMetrics(params: GrMetricsParams): Promise<GrDashboardMetrics | undefined> {
  const { academyId, tenantId, athleteIds } = params;

  const today = new Date();
  const todayIso = formatISO(today, { representation: "date" });
  const thirtyDaysFromNow = addDays(today, 30);
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDayOfMonthIso = formatISO(firstDayOfMonth, { representation: "date" });

  // Athletes by level (using 'level' field which exists in schema)
  const athleteLevelsResult = await db
    .select({
      level: athletes.level,
      count: count(),
    })
    .from(athletes)
    .where(eq(athletes.academyId, academyId))
    .groupBy(athletes.level);

  const athletesByCategory: AthleteCategoryCount[] = athleteLevelsResult
    .filter((row) => row.level !== null)
    .map((row) => ({
      category: row.level ?? "sin nivel",
      count: Number(row.count ?? 0),
    }));

  let expiringLicenses: ExpiringLicense[] = [];
  let expiringLicensesThisWeek = 0;
  let expiringLicensesThisMonth = 0;
  let totalAthletesWithActiveLicense = 0;

  if (athleteIds.length > 0) {
    // Get all athlete licenses with person info
    const athleteLicensesResult = await db
      .select({
        id: federativeLicenses.id,
        personId: federativeLicenses.personId,
        personName: athletes.name,
        licenseType: federativeLicenses.licenseType,
        federation: federativeLicenses.federation,
        validUntil: federativeLicenses.validUntil,
        status: federativeLicenses.status,
      })
      .from(federativeLicenses)
      .leftJoin(athletes, eq(federativeLicenses.personId, athletes.id))
      .where(
        and(
          eq(federativeLicenses.tenantId, tenantId),
          eq(federativeLicenses.personType, "athlete"),
          inArray(federativeLicenses.personId, athleteIds)
        )
      );

    // Calculate days until expiry and categorize
    const now = new Date();
    const processedLicenses = athleteLicensesResult
      .filter((l) => l.validUntil !== null)
      .map((l) => {
        const expiryDate = new Date(l.validUntil as string);
        const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: l.id,
          personId: l.personId,
          personName: l.personName,
          licenseType: l.licenseType,
          federation: l.federation,
          validUntil: l.validUntil as string,
          daysUntilExpiry: daysUntil,
        };
      });

    expiringLicensesThisWeek = processedLicenses.filter(
      (l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 7
    ).length;

    expiringLicensesThisMonth = processedLicenses.filter(
      (l) => l.daysUntilExpiry > 7 && l.daysUntilExpiry <= 30
    ).length;

    totalAthletesWithActiveLicense = processedLicenses.filter(
      (l) => l.daysUntilExpiry > 0
    ).length;

    expiringLicenses = processedLicenses
      .filter((l) => l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 30)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
      .slice(0, 5);
  }

  // Upcoming competitions (next 60 days)
  const sixtyDaysFromNow = addDays(today, 60);
  const sixtyDaysFromNowIso = formatISO(sixtyDaysFromNow, { representation: "date" });

  const upcomingCompetitionsResult = await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      level: events.level,
      status: events.status,
    })
    .from(events)
    .where(
      and(
        eq(events.academyId, academyId),
        gte(events.startDate, todayIso),
        lte(events.startDate, sixtyDaysFromNowIso),
        eq(events.status, "published")
      )
    )
    .orderBy(events.startDate)
    .limit(5);

  const upcomingCompetitions: UpcomingCompetition[] = upcomingCompetitionsResult.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.startDate as string,
    level: e.level,
    status: e.status,
  }));

  // Assessments this month
  const assessmentsThisMonthResult = await db
    .select({ count: count() })
    .from(athleteAssessments)
    .where(
      and(
        eq(athleteAssessments.academyId, academyId),
        gte(athleteAssessments.assessmentDate, firstDayOfMonthIso),
        lte(athleteAssessments.assessmentDate, todayIso)
      )
    );

  const assessmentsThisMonth = Number(assessmentsThisMonthResult[0]?.count ?? 0);

  return {
    athletesByCategory,
    expiringLicenses,
    expiringLicensesThisWeek,
    expiringLicensesThisMonth,
    upcomingCompetitions,
    assessmentsThisMonth,
    totalAthletesWithActiveLicense,
  };
}
