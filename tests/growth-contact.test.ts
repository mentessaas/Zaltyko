import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactRequestSchema } from "@/lib/growth/contracts";
import {
  calculatePricingToContactMetric,
  PRICING_TO_CONTACT_MIN_DENOMINATOR,
  PRICING_TO_CONTACT_WINDOW_DAYS,
} from "@/lib/growth/pricing-contact";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISITOR_STORAGE_KEY = "zaltyko_growth_visitor_id";

function buildContactRequest(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: "test@example.com",
    reason: "migracion",
    source: "public_contact",
    message: "Hola quiero migrar mis datos",
    submissionId: "00000000-0000-4000-8000-000000000099",
    visitorId: "00000000-0000-4000-8000-000000000098",
    ...overrides,
  };
}

describe("contact growth contracts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acepta migracion como motivo de contacto", () => {
    const parsed = ContactRequestSchema.safeParse(buildContactRequest());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reason).toBe("migracion");
  });

  it("reemplaza visitorId legacy en localStorage por UUID v4", async () => {
    const newVisitorId = "00000000-0000-4000-8000-000000000123";
    const storage = new Map<string, string>([[VISITOR_STORAGE_KEY, "v-001"]]);
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      storage.set(key, value);
    });

    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => newVisitorId),
    });

    const { getGrowthVisitorId } = await import("@/lib/growth/client");

    const visitorId = getGrowthVisitorId();

    expect(visitorId).toBe(newVisitorId);
    expect(visitorId).toMatch(UUID_V4_PATTERN);
    expect(getItem).toHaveBeenCalledWith(VISITOR_STORAGE_KEY);
    expect(setItem).toHaveBeenCalledWith(VISITOR_STORAGE_KEY, newVisitorId);
    expect(storage.get(VISITOR_STORAGE_KEY)).toBe(newVisitorId);
  });

  it("rechaza un contacto sin visitorId", () => {
    expect(
      ContactRequestSchema.safeParse(
        buildContactRequest({ visitorId: undefined })
      ).success
    ).toBe(false);
    expect(
      ContactRequestSchema.safeParse(buildContactRequest({ visitorId: null }))
        .success
    ).toBe(false);
  });

  it("usa una cohorte rolling de 30 días y solo cruza visitantes elegibles", () => {
    const cohortEnd = new Date("2026-08-03T12:00:00.000Z");
    const inside = new Date("2026-07-05T12:00:00.000Z");
    const outside = new Date("2026-07-04T11:59:59.999Z");
    const events = [
      {
        eventName: "pricing_viewed",
        visitorId: "inside",
        properties: {},
        occurredAt: inside,
      },
      {
        eventName: "pricing_viewed",
        visitorId: "inside",
        properties: {},
        occurredAt: inside,
      },
      {
        eventName: "pricing_viewed",
        visitorId: "outside",
        properties: {},
        occurredAt: outside,
      },
      {
        eventName: "contact_submitted",
        visitorId: "inside",
        properties: { reason: "demo" },
        occurredAt: inside,
      },
      {
        eventName: "contact_submitted",
        visitorId: "inside",
        properties: { reason: "support" },
        occurredAt: inside,
      },
      {
        eventName: "contact_submitted",
        visitorId: "outside",
        properties: { reason: "demo" },
        occurredAt: inside,
      },
    ];

    const metric = calculatePricingToContactMetric(events, cohortEnd);

    expect(metric.cohortStart).toEqual(
      new Date(
        cohortEnd.getTime() -
          PRICING_TO_CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1_000
      )
    );
    expect(metric.pricingVisitors).toBe(1);
    expect(metric.commercialContactVisitors).toBe(1);
    expect(metric.rate).toBeNull();
    expect(metric.status).toBe("sin base");
  });

  it("reporta baseline exactamente desde N=30 y excluye motivos no comerciales", () => {
    const cohortEnd = new Date("2026-08-03T12:00:00.000Z");
    const pricingEvents = Array.from(
      { length: PRICING_TO_CONTACT_MIN_DENOMINATOR },
      (_, index) => ({
        eventName: "pricing_viewed",
        visitorId: `visitor-${index}`,
        properties: {},
        occurredAt: new Date("2026-08-02T12:00:00.000Z"),
      })
    );
    const contactEvents = [
      {
        eventName: "contact_submitted",
        visitorId: "visitor-0",
        properties: { reason: "network" },
        occurredAt: new Date("2026-08-02T12:00:00.000Z"),
      },
      {
        eventName: "contact_submitted",
        visitorId: "visitor-1",
        properties: { reason: "sales" },
        occurredAt: new Date("2026-08-02T12:00:00.000Z"),
      },
      {
        eventName: "contact_submitted",
        visitorId: "visitor-2",
        properties: { reason: "billing" },
        occurredAt: new Date("2026-08-02T12:00:00.000Z"),
      },
    ];

    const metric = calculatePricingToContactMetric(
      [...pricingEvents, ...contactEvents],
      cohortEnd
    );

    expect(metric.pricingVisitors).toBe(30);
    expect(metric.commercialContactVisitors).toBe(2);
    expect(metric.rate).toBe(6.7);
    expect(metric.status).toBe("baseline");
  });
});
