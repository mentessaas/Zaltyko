// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactRequestSchema, LeadCaptureSchema } from "@/lib/growth/contracts";
import {
  calculatePricingToContactMetric,
  PRICING_TO_CONTACT_MIN_DENOMINATOR,
  PRICING_TO_CONTACT_WINDOW_DAYS,
} from "@/lib/growth/pricing-contact";

const VISITOR_STORAGE_KEY = "zaltyko_growth_visitor_id";
const CONSENT_STORAGE_KEY = "zaltyko.consent.v1";

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
  let resetConsentForTests: (() => void) | undefined;
  let restoreSendBeacon: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    resetConsentForTests?.();
    resetConsentForTests = undefined;
    restoreSendBeacon?.();
    restoreSendBeacon = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("acepta migracion como motivo de contacto", () => {
    const parsed = ContactRequestSchema.safeParse(buildContactRequest());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reason).toBe("migracion");
  });

  it("conserva la atribución de ficha sin aceptar identificadores inválidos", () => {
    expect(ContactRequestSchema.parse(buildContactRequest({directoryEntryId:"00000000-0000-4000-8000-000000000001"})).directoryEntryId).toBe("00000000-0000-4000-8000-000000000001");
    expect(ContactRequestSchema.safeParse(buildContactRequest({directoryEntryId:"correo@example.com"})).success).toBe(false);
  });

  it("mantiene cerrada la atribución pública y purga solo su clave heredada", async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, "legacy-visitor");
    localStorage.setItem("unrelated.preference", "keep");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const fetchMock = vi.fn();
    const sendBeacon = vi.fn(() => true);
    const previousSendBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
    restoreSendBeacon = () => {
      if (previousSendBeacon) {
        Object.defineProperty(navigator, "sendBeacon", previousSendBeacon);
      } else {
        Reflect.deleteProperty(navigator, "sendBeacon");
      }
    };
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });

    const consentStore = await import("@/lib/consent/store");
    resetConsentForTests = consentStore.__resetConsentForTests;
    const { capturePublicGrowthEvent, getGrowthVisitorId, getPublicAttribution } = await import("@/lib/growth/client");

    expect(getGrowthVisitorId()).toBeUndefined();
    expect(getPublicAttribution()).toEqual({});
    capturePublicGrowthEvent({ eventName: "pricing_viewed", planCode: null, source: "public_pricing", properties: {} });

    expect(getItem).not.toHaveBeenCalledWith(VISITOR_STORAGE_KEY);
    expect(setItem).not.toHaveBeenCalledWith(VISITOR_STORAGE_KEY, expect.any(String));
    expect(removeItem).toHaveBeenCalledWith(VISITOR_STORAGE_KEY);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(localStorage.getItem("unrelated.preference")).toBe("keep");
  });

  it("vuelve a purgar solo su clave al revocar consentimiento", async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, "legacy-visitor");
    localStorage.setItem("unrelated.preference", "keep");
    const consentStore = await import("@/lib/consent/store");
    resetConsentForTests = consentStore.__resetConsentForTests;
    await import("@/lib/growth/client");

    localStorage.setItem(VISITOR_STORAGE_KEY, "legacy-visitor-again");
    consentStore.writeConsent("revoked");

    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("unrelated.preference")).toBe("keep");
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("revoked");
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

  it("acepta un lead sin visitorId para que el formulario comercial no dependa del tracking", () => {
    expect(LeadCaptureSchema.safeParse({ email: "lead@example.com", source: "landing_page" }).success).toBe(true);
    expect(LeadCaptureSchema.safeParse({ email: "lead@example.com", source: "landing_page", visitorId: null }).success).toBe(true);
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
