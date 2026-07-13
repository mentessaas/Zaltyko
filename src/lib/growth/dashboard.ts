import { and, count, countDistinct, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academyTrials,
  commercialInterviews,
  growthEvents,
  leads,
  subscriptions,
} from "@/db/schema";

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
    trialToPaidRate: number | null;
    checkoutToPaidRate: number | null;
  };
  interviews: CommercialInterviewRow[];
  leads: CommercialLeadRow[];
}

export function getSafeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export async function getGrowthDashboardData(): Promise<GrowthDashboardData> {
  const [interviewRows, leadRows, leadCountRows, eventRows, trialRows, paidRows] = await Promise.all([
    db.select().from(commercialInterviews).orderBy(desc(commercialInterviews.createdAt)),
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

  const eventMap = new Map(eventRows.map((row) => [row.eventName, row]));
  const trialMap = new Map(trialRows.map((row) => [row.status, Number(row.total)]));
  const completed = interviewRows.filter((row) => row.status === "completed");
  const easyPrices = completed.flatMap((row) =>
    row.easyPriceEurCents === null ? [] : [row.easyPriceEurCents / 100]
  );
  const limitPrices = completed.flatMap((row) =>
    row.limitPriceEurCents === null ? [] : [row.limitPriceEurCents / 100]
  );
  const pricingVisitors = Number(eventMap.get("pricing_viewed")?.visitors ?? 0);
  const planSelectors = Number(eventMap.get("pricing_plan_selected")?.visitors ?? 0);
  const contactSubmitters = Number(eventMap.get("contact_submitted")?.visitors ?? 0);
  const checkoutAcademies = Number(eventMap.get("checkout_started")?.academies ?? 0);
  const trialsStarted = [...trialMap.values()].reduce((sum, total) => sum + total, 0);
  const trialsConverted = trialMap.get("converted") ?? 0;
  const paidSubscriptions = Number(paidRows[0]?.total ?? 0);

  return {
    metrics: {
      interviewGoal: 10,
      interviewsCompleted: completed.length,
      interviewsScheduled: interviewRows.filter((row) => row.status === "scheduled").length,
      betaInterested: completed.filter((row) => row.betaInterest === "yes").length,
      willingToPay: completed.filter((row) => row.willingnessToPay === "yes").length,
      averageEasyPriceEur:
        easyPrices.length > 0
          ? Math.round((easyPrices.reduce((sum, value) => sum + value, 0) / easyPrices.length) * 100) / 100
          : null,
      averageLimitPriceEur:
        limitPrices.length > 0
          ? Math.round((limitPrices.reduce((sum, value) => sum + value, 0) / limitPrices.length) * 100) / 100
          : null,
      pricingVisitors,
      planSelectors,
      contactSubmitters,
      leads: Number(leadCountRows[0]?.total ?? 0),
      trialsStarted,
      trialsConverted,
      checkoutAcademies,
      paidSubscriptions,
      intentToContactRate: getSafeRate(contactSubmitters, planSelectors),
      trialToPaidRate: getSafeRate(trialsConverted, trialsStarted),
      checkoutToPaidRate: getSafeRate(paidSubscriptions, checkoutAcademies),
    },
    interviews: interviewRows.map((row) => ({
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
      easyPriceEur: row.easyPriceEurCents === null ? null : row.easyPriceEurCents / 100,
      limitPriceEur: row.limitPriceEurCents === null ? null : row.limitPriceEurCents / 100,
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
    leads: leadRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
