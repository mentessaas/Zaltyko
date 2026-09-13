import {
  and,
  count,
  countDistinct,
  desc,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  academyTrials,
  commercialInterviews,
  growthEvents,
  leads,
  subscriptions,
} from "@/db/schema";
import {
  calculatePricingToContactMetric,
  PRICING_TO_CONTACT_WINDOW_DAYS,
} from "@/lib/growth/pricing-contact";

export interface CommercialInterviewRow {
  id: string;
  leadId: string | null;
  academyName: string;
  contactName: string | null;
  contactEmail: string | null;
  countryCode: string | null;
  city: string | null;
  modality: string | null;
  athleteCount: number | null;
  coachCount: number | null;
  locationCount: number;
  currentTools: string | null;
  biggestPain: string | null;
  mostValuableFeature: string | null;
  primaryObjection: string | null;
  easyPriceEur: number | null;
  limitPriceEur: number | null;
  preferredPricingModel: string | null;
  freePlanExpectation: string | null;
  upgradeTrigger: string | null;
  betaInterest: string;
  willingnessToPay: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CommercialLeadRow {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  plan: string | null;
  createdAt: string;
}

export interface GrowthDashboardData {
  metrics: {
    interviewGoal: number;
    interviewsCompleted: number;
    interviewsScheduled: number;
    betaInterested: number;
    willingToPay: number;
    averageEasyPriceEur: number | null;
    averageLimitPriceEur: number | null;
    pricingVisitors: number;
    planSelectors: number;
    contactSubmitters: number;
    leads: number;
    trialsStarted: number;
    trialsConverted: number;
    checkoutAcademies: number;
    paidSubscriptions: number;
    intentToContactRate: number | null;
    intentToContactStatus: "sin base" | "baseline";
    trialToPaidRate: number | null;
    checkoutToPaidRate: number | null;
    activatedAcademies: number;
    averageTimeToValueHours: number | null;
  };
  interviews: CommercialInterviewRow[];
  interviewsPage: number;
  interviewsPageSize: number;
  interviewsTotal: number;
  interviewsTotalPages: number;
  leads: CommercialLeadRow[];
}

export const GROWTH_INTERVIEW_PAGE_SIZE = 50;

export function getGrowthInterviewPagination(total: number, requestedPage = 1) {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / GROWTH_INTERVIEW_PAGE_SIZE));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(Number.isFinite(requestedPage) ? requestedPage : 1))
  );

  return {
    page,
    pageSize: GROWTH_INTERVIEW_PAGE_SIZE,
    total: safeTotal,
    totalPages,
  };
}

export function getSafeRate(
  numerator: number,
  denominator: number
): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export async function getGrowthDashboardData(args: { interviewPage?: number } = {}): Promise<GrowthDashboardData> {
  const requestedInterviewPage = Math.max(
    1,
    Math.floor(Number.isFinite(args.interviewPage) ? args.interviewPage! : 1)
  );
  const cohortEnd = new Date();
  const cohortStart = new Date(
    cohortEnd.getTime() - PRICING_TO_CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1_000
  );
  const [
    interviewSummaryRows,
    leadRows,
    leadCountRows,
    eventRows,
    pricingContactRows,
    activationRows,
    trialRows,
    paidRows,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where ${commercialInterviews.status} = 'completed')`,
        scheduled: sql<number>`count(*) filter (where ${commercialInterviews.status} = 'scheduled')`,
        betaInterested: sql<number>`count(*) filter (where ${commercialInterviews.status} = 'completed' and ${commercialInterviews.betaInterest} = 'yes')`,
        willingToPay: sql<number>`count(*) filter (where ${commercialInterviews.status} = 'completed' and ${commercialInterviews.willingnessToPay} = 'yes')`,
        averageEasyPriceEurCents: sql<number | null>`avg(${commercialInterviews.easyPriceEurCents}) filter (where ${commercialInterviews.status} = 'completed' and ${commercialInterviews.easyPriceEurCents} is not null)`,
        averageLimitPriceEurCents: sql<number | null>`avg(${commercialInterviews.limitPriceEurCents}) filter (where ${commercialInterviews.status} = 'completed' and ${commercialInterviews.limitPriceEurCents} is not null)`,
      })
      .from(commercialInterviews),
    db
      .select({
        id: leads.id,
        email: leads.email,
        name: leads.name,
        source: leads.source,
        plan: leads.plan,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(50),
    db.select({ total: count(leads.id) }).from(leads),
    db
      .select({
        eventName: growthEvents.eventName,
        events: count(growthEvents.id),
        visitors: countDistinct(growthEvents.visitorId),
        academies: countDistinct(growthEvents.academyId),
      })
      .from(growthEvents)
      .groupBy(growthEvents.eventName),
    db
      .select({
        eventName: growthEvents.eventName,
        visitorId: growthEvents.visitorId,
        properties: growthEvents.properties,
        occurredAt: growthEvents.occurredAt,
      })
      .from(growthEvents)
      .where(
        and(
          gte(growthEvents.occurredAt, cohortStart),
          lte(growthEvents.occurredAt, cohortEnd),
          inArray(growthEvents.eventName, [
            "pricing_viewed",
            "contact_submitted",
          ])
        )
      ),
    db
      .select({
        academyId: growthEvents.academyId,
        createdAt: sql<Date | null>`min(${growthEvents.occurredAt}) filter (where ${growthEvents.eventName} = 'academy_created')`,
        activatedAt: sql<Date | null>`min(${growthEvents.occurredAt}) filter (where ${growthEvents.eventName} = 'academy_activated')`,
      })
      .from(growthEvents)
      .where(
        and(
          isNotNull(growthEvents.academyId),
          inArray(growthEvents.eventName, [
            "academy_created",
            "academy_activated",
          ])
        )
      )
      .groupBy(growthEvents.academyId),
    db
      .select({ status: academyTrials.status, total: count(academyTrials.id) })
      .from(academyTrials)
      .groupBy(academyTrials.status),
    db
      .select({ total: count(subscriptions.id) })
      .from(subscriptions)
      .where(
        and(
          isNotNull(subscriptions.stripeSubscriptionId),
          inArray(subscriptions.status, ["active", "trialing"])
        )
      ),
  ]);

  const interviewTotal = Number(interviewSummaryRows[0]?.total ?? 0);
  const interviewPagination = getGrowthInterviewPagination(
    interviewTotal,
    requestedInterviewPage
  );
  const effectiveInterviewRows = await db
    .select()
    .from(commercialInterviews)
    .orderBy(desc(commercialInterviews.createdAt), desc(commercialInterviews.id))
    .limit(GROWTH_INTERVIEW_PAGE_SIZE)
    .offset((interviewPagination.page - 1) * GROWTH_INTERVIEW_PAGE_SIZE);

  const eventMap = new Map(eventRows.map((row) => [row.eventName, row]));
  const trialMap = new Map(
    trialRows.map((row) => [row.status, Number(row.total)])
  );
  const interviewSummary = interviewSummaryRows[0];
  const completedCount = Number(interviewSummary?.completed ?? 0);
  const scheduledCount = Number(interviewSummary?.scheduled ?? 0);
  const betaInterestedCount = Number(interviewSummary?.betaInterested ?? 0);
  const willingToPayCount = Number(interviewSummary?.willingToPay ?? 0);
  const averageEasyPriceEurCents = interviewSummary?.averageEasyPriceEurCents;
  const averageLimitPriceEurCents = interviewSummary?.averageLimitPriceEurCents;
  const pricingToContact = calculatePricingToContactMetric(
    pricingContactRows,
    cohortEnd
  );
  const pricingVisitors = pricingToContact.pricingVisitors;
  const planSelectors = Number(
    eventMap.get("pricing_plan_selected")?.visitors ?? 0
  );
  const contactSubmitters = pricingToContact.commercialContactVisitors;
  const checkoutAcademies = Number(
    eventMap.get("checkout_started")?.academies ?? 0
  );
  const trialsStarted = [...trialMap.values()].reduce(
    (sum, total) => sum + total,
    0
  );
  const trialsConverted = trialMap.get("converted") ?? 0;
  const paidSubscriptions = Number(paidRows[0]?.total ?? 0);
  const activatedAcademies = Number(
    eventMap.get("academy_activated")?.academies ?? 0
  );
  const timeToValueHours = activationRows.flatMap((entry) => {
    if (
      !entry.createdAt ||
      !entry.activatedAt ||
      entry.activatedAt < entry.createdAt
    ) {
      return [];
    }
    return [
      (entry.activatedAt.getTime() - entry.createdAt.getTime()) / 3_600_000,
    ];
  });

  return {
    metrics: {
      interviewGoal: 10,
      interviewsCompleted: completedCount,
      interviewsScheduled: scheduledCount,
      betaInterested: betaInterestedCount,
      willingToPay: willingToPayCount,
      averageEasyPriceEur:
        averageEasyPriceEurCents === null || averageEasyPriceEurCents === undefined
          ? null
          : Math.round((Number(averageEasyPriceEurCents) / 100) * 100) / 100,
      averageLimitPriceEur:
        averageLimitPriceEurCents === null || averageLimitPriceEurCents === undefined
          ? null
          : Math.round((Number(averageLimitPriceEurCents) / 100) * 100) / 100,
      pricingVisitors,
      planSelectors,
      contactSubmitters,
      leads: Number(leadCountRows[0]?.total ?? 0),
      trialsStarted,
      trialsConverted,
      checkoutAcademies,
      paidSubscriptions,
      intentToContactRate: pricingToContact.rate,
      intentToContactStatus: pricingToContact.status,
      trialToPaidRate: getSafeRate(trialsConverted, trialsStarted),
      checkoutToPaidRate: getSafeRate(paidSubscriptions, checkoutAcademies),
      activatedAcademies,
      averageTimeToValueHours:
        timeToValueHours.length > 0
          ? Math.round(
              (timeToValueHours.reduce((sum, value) => sum + value, 0) /
                timeToValueHours.length) *
                10
            ) / 10
          : null,
    },
    interviews: effectiveInterviewRows.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      academyName: row.academyName,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      countryCode: row.countryCode,
      city: row.city,
      modality: row.modality,
      athleteCount: row.athleteCount,
      coachCount: row.coachCount,
      locationCount: row.locationCount,
      currentTools: row.currentTools,
      biggestPain: row.biggestPain,
      mostValuableFeature: row.mostValuableFeature,
      primaryObjection: row.primaryObjection,
      easyPriceEur:
        row.easyPriceEurCents === null ? null : row.easyPriceEurCents / 100,
      limitPriceEur:
        row.limitPriceEurCents === null ? null : row.limitPriceEurCents / 100,
      preferredPricingModel: row.preferredPricingModel,
      freePlanExpectation: row.freePlanExpectation,
      upgradeTrigger: row.upgradeTrigger,
      betaInterest: row.betaInterest,
      willingnessToPay: row.willingnessToPay,
      status: row.status,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    })),
    interviewsPage: interviewPagination.page,
    interviewsPageSize: interviewPagination.pageSize,
    interviewsTotal: interviewPagination.total,
    interviewsTotalPages: interviewPagination.totalPages,
    leads: leadRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
