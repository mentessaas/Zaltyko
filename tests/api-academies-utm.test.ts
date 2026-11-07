/**
 * Contrato de retirada de atribución servidor: el alta de academia conserva
 * compatibilidad con clientes que envían UTM heredado, pero no lo persiste.
 *
 * Cubre:
 * - La creación sigue respondiendo 201 aunque reciba UTM heredado
 * - Los campos UTM quedan en null, incluso cuando el cliente los envía
 * - Los eventos academy_created no reciben valores UTM
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

describe("API /api/academies — server-side attribution disabled", () => {
  // Keep the cold route import deterministic under the single-worker release
  // gate; normal test execution remains unchanged.
  beforeAll(async () => {
    const academiesModule = await import("@/app/api/academies/route");
    POST = academiesModule.POST;
  }, 30000);

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

  it("ignora UTM heredado sin bloquear el alta ni persistirlo", async () => {
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
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      utmCapturedAt: null,
    });
  });

  it("no registra fallback direct/none si el cliente no envía UTM", async () => {
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
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      utmCapturedAt: null,
    });
  });

  it("omite UTMs de trackEvent aunque el cuerpo heredado los incluya", async () => {
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
    expect(academyCreated).toBeDefined();
    expect(academyCreated?.payload?.metadata).not.toHaveProperty("utm_source");
    expect(academyCreated?.payload?.metadata).not.toHaveProperty("utm_medium");
    expect(academyCreated?.payload?.metadata).not.toHaveProperty("utm_campaign");
  });

  it("omite UTMs de logEvent aunque el cuerpo heredado los incluya", async () => {
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
    expect(academyCreatedLog).toBeDefined();
    expect(academyCreatedLog?.metadata).not.toHaveProperty("utm_source");
    expect(academyCreatedLog?.metadata).not.toHaveProperty("utm_medium");
    expect(academyCreatedLog?.metadata).not.toHaveProperty("utm_campaign");
  });

  it("ignora UTM parcial sin rechazar el alta", async () => {
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
    expect(academyRow).toMatchObject({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      utmCapturedAt: null,
    });
  });
});
