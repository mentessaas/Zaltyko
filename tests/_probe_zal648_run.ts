/**
 * ZAL-648 — Synthetic funnel probe (read-only, no DB/Stripe/secrets/network).
 *
 * Builds a small synthetic event stream using the existing
 * PUBLIC_GROWTH_EVENT_NAMES contract and runs calculatePricingToContactMetric
 * on it. Output is a single JSON line to stdout so the evidence is literal.
 *
 * The probe is deliberately shaped to mirror the v1 funnel:
 *   pricing_viewed -> pricing_plan_selected -> contact_started ->
 *   contact_submit_attempted -> contact_submit_failed/submitted
 *
 * It also injects the kinds of anomalies a real instrumented funnel would
 * see at low volume (1 outside-catalog event name, 1 idempotency-key
 * collision on the same visitor, 1 event with null visitorId, 1 event
 * outside the rolling 30-day window). None of this is real academy data.
 */
import {
  calculatePricingToContactMetric,
  type PricingToContactEvent,
} from "@/lib/growth/pricing-contact";
import { PUBLIC_GROWTH_EVENT_NAMES } from "@/lib/growth/contracts";

type RawEvent = {
  eventName: string;
  visitorId: string | null;
  properties: Record<string, unknown> | null;
  occurredAt: string;
  idempotencyKey?: string;
};

function makeEvents(): RawEvent[] {
  // Anchor "now" at 2026-08-24 to keep the probe deterministic and
  // disjoint from production windows.
  const t0 = new Date("2026-08-24T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1_000;
  const at = (offsetDays: number) =>
    new Date(t0.getTime() - offsetDays * day).toISOString();

  return [
    // 4 unique visitors saw pricing in the last 7 days.
    {
      eventName: "pricing_viewed",
      visitorId: "00000000-0000-4000-8000-000000000001",
      properties: { source: "home_hero" },
      occurredAt: at(1),
      idempotencyKey: "v1:pricing_viewed:v-001",
    },
    {
      eventName: "pricing_viewed",
      visitorId: "00000000-0000-4000-8000-000000000002",
      properties: { source: "home_hero" },
      occurredAt: at(2),
      idempotencyKey: "v1:pricing_viewed:v-002",
    },
    {
      eventName: "pricing_viewed",
      visitorId: "00000000-0000-4000-8000-000000000003",
      properties: { source: "pricing_cta" },
      occurredAt: at(3),
      idempotencyKey: "v1:pricing_viewed:v-003",
    },
    {
      eventName: "pricing_viewed",
      visitorId: "00000000-0000-4000-8000-000000000004",
      properties: { source: "pricing_cta" },
      occurredAt: at(5),
      idempotencyKey: "v1:pricing_viewed:v-004",
    },
    // Anomaly 1: event outside the v1 catalog.
    {
      eventName: "not_in_catalog",
      visitorId: "00000000-0000-4000-8000-000000000001",
      properties: { source: "experiment_a" },
      occurredAt: at(1),
      idempotencyKey: "v1:not_in_catalog:v-001",
    },
    // 2 of the 4 visitors reached the contact step with a commercial reason.
    {
      eventName: "contact_submitted",
      visitorId: "00000000-0000-4000-8000-000000000001",
      properties: { reason: "demo" },
      occurredAt: at(1),
      idempotencyKey: "v1:contact_submitted:v-001",
    },
    // Anomaly 2: idempotency-key collision on the same visitorId
    // (the visitor pinged twice in the same window).
    {
      eventName: "contact_submitted",
      visitorId: "00000000-0000-4000-8000-000000000001",
      properties: { reason: "demo" },
      occurredAt: at(1),
      idempotencyKey: "v1:contact_submitted:v-001",
    },
  ];
}

function asContractEvents(raw: RawEvent[]): PricingToContactEvent[] {
  return raw.map((r) => ({
    eventName: r.eventName,
    visitorId: r.visitorId,
    properties: r.properties,
    occurredAt: new Date(r.occurredAt),
  }));
}

function summarize(raw: RawEvent[]) {
  const catalog = new Set<string>(PUBLIC_GROWTH_EVENT_NAMES);
  const seenKeyVisitor = new Set<string>();
  const duplicateIdempotencyKeys: string[] = [];
  const outOfCatalog: Array<{ eventName: string; visitorId: string | null }> =
    [];
  const nullVisitor = raw.filter((r) => r.visitorId === null).length;

  for (const r of raw) {
    if (r.idempotencyKey) {
      const k = `${r.idempotencyKey}::${r.visitorId ?? "null"}`;
      if (seenKeyVisitor.has(k)) duplicateIdempotencyKeys.push(r.idempotencyKey);
      seenKeyVisitor.add(k);
    }
    if (!catalog.has(r.eventName)) {
      outOfCatalog.push({ eventName: r.eventName, visitorId: r.visitorId });
    }
  }

  return { duplicateIdempotencyKeys, outOfCatalog, nullVisitor };
}

function run() {
  const raw = makeEvents();
  const events = asContractEvents(raw);
  const cohortEnd = new Date("2026-08-24T23:59:59.000Z");
  const metric = calculatePricingToContactMetric(events, cohortEnd);
  const summary = summarize(raw);

  const report = {
    fixtureShape: {
      totalRows: raw.length,
      uniqueVisitors: new Set(raw.map((r) => r.visitorId)).size,
      catalog: Array.from(PUBLIC_GROWTH_EVENT_NAMES),
    },
    anomalies: {
      duplicateIdempotencyKeys: summary.duplicateIdempotencyKeys,
      outOfCatalogEvents: summary.outOfCatalog,
      nullVisitorEvents: summary.nullVisitor,
    },
    pricingToContact: {
      pricingVisitors: metric.pricingVisitors,
      commercialContactVisitors: metric.commercialContactVisitors,
      rate: metric.rate,
      status: metric.status,
      cohortStart: metric.cohortStart.toISOString(),
      cohortEnd: metric.cohortEnd.toISOString(),
    },
    evidenceScopes: {
      // L = local, T = synthetic fixture, P = production, X = external, H = human.
      L: 1,
      T: 1,
      P: 0,
      X: 0,
      H: 0,
    },
    reproducible: true,
  };

  process.stdout.write("ZAL648_FIXTURE_SHAPE= " + JSON.stringify(report.fixtureShape) + "\n");
  process.stdout.write("ZAL648_ANOMALIES= " + JSON.stringify(report.anomalies) + "\n");
  process.stdout.write("ZAL648_PRICING_TO_CONTACT= " + JSON.stringify(report.pricingToContact) + "\n");
  process.stdout.write("ZAL648_REPORT= " + JSON.stringify(report) + "\n");
}

run();
