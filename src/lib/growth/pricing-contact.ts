export const PRICING_TO_CONTACT_WINDOW_DAYS = 30;
export const PRICING_TO_CONTACT_MIN_DENOMINATOR = 30;

const COMMERCIAL_CONTACT_REASONS = new Set(["demo", "network", "sales"]);

export type PricingToContactEvent = {
  eventName: string;
  visitorId: string | null;
  properties: Record<string, unknown> | null;
  occurredAt: Date;
};

export type PricingToContactStatus = "sin base" | "baseline";

export interface PricingToContactMetric {
  cohortStart: Date;
  cohortEnd: Date;
  pricingVisitors: number;
  commercialContactVisitors: number;
  rate: number | null;
  status: PricingToContactStatus;
}

function isInRollingWindow(
  eventDate: Date,
  cohortStart: Date,
  cohortEnd: Date
): boolean {
  return eventDate >= cohortStart && eventDate <= cohortEnd;
}

function isCommercialContact(event: PricingToContactEvent): boolean {
  const reason = event.properties?.reason;
  return typeof reason === "string" && COMMERCIAL_CONTACT_REASONS.has(reason);
}

export function calculatePricingToContactMetric(
  events: readonly PricingToContactEvent[],
  cohortEnd: Date
): PricingToContactMetric {
  const cohortStart = new Date(
    cohortEnd.getTime() - PRICING_TO_CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1_000
  );
  const pricingVisitors = new Set<string>();

  for (const event of events) {
    if (
      event.eventName !== "pricing_viewed" ||
      !event.visitorId ||
      !isInRollingWindow(event.occurredAt, cohortStart, cohortEnd)
    ) {
      continue;
    }
    pricingVisitors.add(event.visitorId);
  }

  const commercialContactVisitors = new Set<string>();
  for (const event of events) {
    if (
      event.eventName !== "contact_submitted" ||
      !event.visitorId ||
      !pricingVisitors.has(event.visitorId) ||
      !isCommercialContact(event) ||
      !isInRollingWindow(event.occurredAt, cohortStart, cohortEnd)
    ) {
      continue;
    }
    commercialContactVisitors.add(event.visitorId);
  }

  const denominator = pricingVisitors.size;
  const numerator = commercialContactVisitors.size;
  const reportable = denominator >= PRICING_TO_CONTACT_MIN_DENOMINATOR;

  return {
    cohortStart,
    cohortEnd,
    pricingVisitors: denominator,
    commercialContactVisitors: numerator,
    rate:
      reportable && denominator > 0
        ? Math.round((numerator / denominator) * 1_000) / 10
        : null,
    status: reportable ? "baseline" : "sin base",
  };
}
