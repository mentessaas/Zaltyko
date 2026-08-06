/**
 * Tests de integración para ZAL-157: persistencia de UTMs en `academies`
 * durante el signup del owner.
 *
 * Cubre:
 * - createAcademy() persiste `utm_source/medium/campaign` cuando se pasan
 * - createAcademy() persiste `direct/none/none` como fallback si NO se pasan
 * - createAcademy() persiste `utm_captured_at` con un timestamp ISO válido
 * - createAcademy() pasa UTMs a `trackEvent` para analytics downstream
 *
 * Patrón de mocks alineado con tests/api-academies.test.ts: la DB real no se
 * toca, se mockean las llamadas de Drizzle y se inspeccionan los payloads.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let POST: typeof import("@/app/api/academies/route").POST;

const originalEnv = { ...process.env };

let insertCalls: Array<{ table: unknown; payload: any }> = [];
let updateCalls: Array<{ table: unknown; values: any }> = [];
let selectQueue: any[] = [];
let currentProfileRole: string;
let trackEventCalls: Array<{ name: string; payload: any }> = [];
let logEventCalls: Array<{ academyId: string; eventType: string; metadata: any }> = [];

const createSelectChain = (config: { resolveAt: "limit" | "orderBy"; result: any[] }) => {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  if (config.resolveAt === "limit") {
    chain.limit = vi.fn(() => Promise.resolve(config.result));
  } else {
    chain.orderBy = vi.fn(() => Promise.resolve(config.result));
  }
  return chain;
};

vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: any) => Promise<Response>) =>
    (request: Request, ctx: any = {}) =>
      handler(request, {
        tenantId: "tenant-123",
        userId: "user-123",
        profile: {
          id: "profile-1",
          userId: "user-123",
          role: currentProfileRole,
          tenantId: "tenant-123",
        },
        ...ctx,
      }),
}));

vi.mock("@/lib/limits", () => ({
  assertUserAcademyLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sport-config/seed", () => ({
  activateAcademySportConfig: vi.fn().mockResolvedValue({
    configVersion: "test-v1",
    isGenericFallback: false,
  }),
}));

vi.mock("@/lib/onboarding", () => ({
  seedOnboardingForAcademy: vi.fn().mockResolvedValue(undefined),
  markWizardStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn((name: string, payload: any) => {
    trackEventCalls.push({ name, payload });
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@/lib/event-logging", () => ({
  logEvent: vi.fn((args: any) => {
    logEventCalls.push(args);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn((table) => ({
      values: (payload: unknown) => {
        insertCalls.push({ table, payload });
        return {
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
      },
    })),
    select: vi.fn(() => {
      const chain = selectQueue.shift();
      if (!chain) {
        throw new Error("Select queue exhausted");
      }
      return chain;
    }),
    update: vi.fn((table) => ({
      set: (values: unknown) => {
        updateCalls.push({ table, values });
        return {
          where: vi.fn(() => Promise.resolve()),
        };
      },
    })),
  },
}));

describe("API /api/academies — ZAL-157 UTM persistence", () => {
  beforeAll(async () => {
    const academiesModule = await import("@/app/api/academies/route");
    POST = academiesModule.POST;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    insertCalls = [];
    updateCalls = [];
    selectQueue = [];
    trackEventCalls = [];
    logEventCalls = [];
    currentProfileRole = "owner";
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("persiste utm_* en la fila de academies cuando el signup los trae", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        region: "Madrid",
        academyType: "artistica",
        utm: {
          utm_source: "instagram",
          utm_medium: "social",
          utm_campaign: "zal_q1_awareness",
          utm_term: "gimnasia_artistica",
          utm_content: "carousel_v2",
        },
      }),
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(201);

    expect(insertCalls.length).toBeGreaterThan(0);
    const academyRow = insertCalls[0]?.payload;
    expect(academyRow).toMatchObject({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "zal_q1_awareness",
      utmTerm: "gimnasia_artistica",
      utmContent: "carousel_v2",
    });
    expect(academyRow?.utmCapturedAt).toBeInstanceOf(Date);
  });

  it("aplica fallback direct/none cuando el signup NO trae UTMs", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        region: "Madrid",
        academyType: "artistica",
      }),
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(201);

    const academyRow = insertCalls[0]?.payload;
    expect(academyRow).toMatchObject({
      utmSource: "direct",
      utmMedium: "none",
      utmCampaign: "none",
      utmTerm: null,
      utmContent: null,
    });
    expect(academyRow?.utmCapturedAt).toBeInstanceOf(Date);
  });

  it("pasa UTMs al trackEvent de analytics para atribución downstream", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        academyType: "artistica",
        utm: {
          utm_source: "google_ads",
          utm_medium: "cpc",
          utm_campaign: "brand_q3",
        },
      }),
    });

    await POST(request, {} as any);

    const academyCreated = trackEventCalls.find((c) => c.name === "academy_created");
    expect(academyCreated?.payload?.metadata).toMatchObject({
      utm_source: "google_ads",
      utm_medium: "cpc",
      utm_campaign: "brand_q3",
    });
  });

  it("el logEvent incluye UTMs en metadata", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        academyType: "artistica",
        utm: {
          utm_source: "tiktok",
          utm_medium: "social",
          utm_campaign: "creator_collab",
        },
      }),
    });

    await POST(request, {} as any);

    expect(logEventCalls.length).toBeGreaterThan(0);
    const academyCreatedLog = logEventCalls.find(
      (c) => c.eventType === "academy_created"
    );
    expect(academyCreatedLog?.metadata).toMatchObject({
      utm_source: "tiktok",
      utm_medium: "social",
      utm_campaign: "creator_collab",
    });
  });

  it("Acepta UTMs parciales (utm_source/medium/campaign sin term/content)", async () => {
    selectQueue.push(
      createSelectChain({
        resolveAt: "limit",
        result: [{ id: "plan-free-id" }],
      })
    );

    const request = new Request("http://localhost/api/academies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Academia Aurora",
        country: "ES",
        academyType: "artistica",
        utm: {
          utm_source: "facebook",
          utm_medium: "social",
          utm_campaign: "launch_aug",
        },
      }),
    });

    const response = await POST(request, {} as any);
    expect(response.status).toBe(201);

    const academyRow = insertCalls[0]?.payload;
    expect(academyRow?.utmSource).toBe("facebook");
    expect(academyRow?.utmMedium).toBe("social");
    expect(academyRow?.utmCampaign).toBe("launch_aug");
    expect(academyRow?.utmTerm).toBeNull();
    expect(academyRow?.utmContent).toBeNull();
  });
});