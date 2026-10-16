import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContactRequestSchema,
  toContactAttributionProperties,
} from "@/lib/growth/contracts";
import { getContactRateLimitIdentifier } from "@/lib/rate-limit";
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

  it("acepta y valida los cinco campos UTM de la landing de academias", () => {
    const attribution = {
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "academy_acquisition_2026",
      utm_term: "gimnasia_artistica",
      utm_content: "hero_v1",
    };
    const parsed = ContactRequestSchema.safeParse(
      buildContactRequest({ source: "academy_waitlist", attribution })
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.source).toBe("academy_waitlist");
    expect(parsed.data.attribution).toEqual(attribution);
    expect(toContactAttributionProperties(parsed.data.attribution)).toEqual(
      attribution
    );
    expect(toContactAttributionProperties(undefined)).toEqual({});
  });

  it("rechaza UTMs libres, demasiado largos y claves desconocidas", () => {
    expect(
      ContactRequestSchema.safeParse(
        buildContactRequest({ attribution: { utm_source: "instagram/ana@example.com" } })
      ).success
    ).toBe(false);
    expect(
      ContactRequestSchema.safeParse(
        buildContactRequest({ attribution: { utm_campaign: "a".repeat(129) } })
      ).success
    ).toBe(false);
    expect(
      ContactRequestSchema.safeParse(
        buildContactRequest({ attribution: { email: "ana@example.com" } })
      ).success
    ).toBe(false);
  });

  it("limita la waitlist por hash de email y conserva el límite IP del contacto general", async () => {
    const waitlistRequest = (email: string, ip: string) =>
      new Request("https://zaltyko.com/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ source: "academy_waitlist", email }),
      });

    const first = await getContactRateLimitIdentifier(
      waitlistRequest("Academy@Example.test", "198.51.100.1")
    );
    const normalizedRetry = await getContactRateLimitIdentifier(
      waitlistRequest(" academy@example.test ", "203.0.113.2")
    );
    const anotherEmail = await getContactRateLimitIdentifier(
      waitlistRequest("other@example.test", "203.0.113.2")
    );
    expect(first).toBe(normalizedRetry);
    expect(first).not.toContain("academy@example.test");
    expect(anotherEmail).not.toBe(first);

    const regularRequest = new Request("https://zaltyko.com/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.9",
      },
      body: JSON.stringify({ source: "public_contact", email: "test@example.com" }),
    });
    expect(await getContactRateLimitIdentifier(regularRequest)).toBe(
      "ip:198.51.100.9"
    );
  });

  it("conserva la atribución de ficha sin aceptar identificadores inválidos", () => {
    expect(ContactRequestSchema.parse(buildContactRequest({directoryEntryId:"00000000-0000-4000-8000-000000000001"})).directoryEntryId).toBe("00000000-0000-4000-8000-000000000001");
    expect(ContactRequestSchema.safeParse(buildContactRequest({directoryEntryId:"correo@example.com"})).success).toBe(false);
  });

  it("reemplaza visitorId legacy en localStorage por UUID v4", async () => {
    const newVisitorId = "00000000-0000-4000-8000-000000000123";
    const storage = new Map<string, string>([[VISITOR_STORAGE_KEY, "v-001"]]);
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      storage.set(key, value);
    });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === "zaltyko.cookie-consent.v1"
            ? JSON.stringify({
                version: 1,
                necessary: true,
                analytics: true,
                marketing: false,
                savedAt: "2026-10-15T00:00:00.000Z",
              })
            : getItem(key),
        setItem,
      },
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

  it("permite un contacto sin visitorId cuando no hay consentimiento de analítica", () => {
    expect(
      ContactRequestSchema.safeParse(
        buildContactRequest({ visitorId: undefined })
      ).success
    ).toBe(true);
    expect(
      ContactRequestSchema.safeParse(buildContactRequest({ visitorId: null }))
        .success
    ).toBe(true);
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
