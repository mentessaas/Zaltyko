import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  dbSelect: vi.fn(() => {
    throw new Error("database_reached");
  }),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  rows: vi.fn(),
  directoryUser: vi.fn(),
  recordOwnerSignupConsent: vi.fn(),
  withTransaction: vi.fn(),
  createAcademy: vi.fn(),
  markChecklistItem: vi.fn(),
  activateAcademySportConfig: vi.fn(),
  getUserSubscription: vi.fn(),
  enqueueOnboardingOwnerD0: vi.fn(),
  recordGrowthEvent: vi.fn(),
  logEvent: vi.fn(),
  trackEvent: vi.fn(),
  apiError: vi.fn(
    (code: string, message: string, status: number) =>
      new Response(JSON.stringify({ code, message }), {
        status,
        headers: { "content-type": "application/json" },
      })
  ),
  apiCreated: vi.fn(
    (data: unknown) =>
      new Response(JSON.stringify({ data }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
  ),
  flag: vi.fn(() => false),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getAuthUser },
  })),
}));
vi.mock("@/db", () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    update: mocks.dbUpdate,
  },
}));
vi.mock("@/db/schema", () => ({
  academies: { id: "academies.id", tenantId: "academies.tenantId" },
  classes: { id: "classes.id" },
  classWeekdays: { id: "classWeekdays.id" },
  groups: { id: "groups.id" },
  memberships: { id: "memberships.id", userId: "memberships.userId" },
  profiles: {
    id: "profiles.id",
    userId: "profiles.userId",
    role: "profiles.role",
    tenantId: "profiles.tenantId",
    activeAcademyId: "profiles.activeAcademyId",
    name: "profiles.name",
    canLogin: "profiles.canLogin",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((...values: unknown[]) => values),
  sql: vi.fn((...values: unknown[]) => values),
}));
vi.mock("@/lib/api-response", () => ({
  apiError: mocks.apiError,
  apiCreated: mocks.apiCreated,
}));
vi.mock("@/lib/growth/events", () => ({
  recordGrowthEvent: mocks.recordGrowthEvent,
}));
vi.mock("@/lib/directory/contracts", () => ({
  directoryAcademyIdentityMatches: vi.fn(() => false),
  EntryDataSchema: { safeParse: vi.fn() },
  flag: mocks.flag,
}));
vi.mock("@/lib/directory/service", () => ({
  academyDuplicateLock: vi.fn(),
  academyDuplicateQuery: vi.fn(),
  academyOperationalIdentityQuery: vi.fn(),
  rows: mocks.rows,
}));
vi.mock("@/lib/directory/auth", () => ({
  directoryUser: mocks.directoryUser,
  directoryFailure: vi.fn(),
}));
vi.mock("@/app/api/academies/academies.lib", () => ({
  createAcademy: mocks.createAcademy,
}));
vi.mock("@/lib/specialization/operational-presets", () => ({
  getStarterClassPresets: vi.fn(() => []),
  getStarterGroupPresets: vi.fn(() => []),
}));
vi.mock("@/lib/onboarding", () => ({
  markChecklistItem: mocks.markChecklistItem,
}));
vi.mock("@/lib/sport-config/seed", () => ({
  activateAcademySportConfig: mocks.activateAcademySportConfig,
}));
vi.mock("@/lib/db-transactions", () => ({
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/lib/event-logging", () => ({ logEvent: mocks.logEvent }));
vi.mock("@/lib/analytics", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("@/lib/onboarding-owner-integration", () => ({
  enqueueOnboardingOwnerD0: mocks.enqueueOnboardingOwnerD0,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/consent/owner-consent-store", () => ({
  recordOwnerSignupConsent: mocks.recordOwnerSignupConsent,
}));
vi.mock("@/lib/limits", () => ({
  getUserSubscription: mocks.getUserSubscription,
}));

import { POST } from "@/app/api/onboarding/owner/route";

const authenticatedUser = {
  id: "5b60c3a9-e0d3-4a1e-bf47-9ef356eb42a1",
  email_confirmed_at: "2026-11-04T10:00:00.000Z",
};

function request(countryCode: string) {
  return new Request("http://localhost/api/onboarding/owner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Owner de prueba",
      academyName: "Club de prueba",
      disciplineVariant: "rhythmic",
      countryCode,
    }),
  });
}

function expectNoDatabaseOrPostCreateSideEffects() {
  expect(mocks.dbSelect).not.toHaveBeenCalled();
  expect(mocks.dbInsert).not.toHaveBeenCalled();
  expect(mocks.dbUpdate).not.toHaveBeenCalled();
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(mocks.directoryUser).not.toHaveBeenCalled();
  expect(mocks.recordOwnerSignupConsent).not.toHaveBeenCalled();
  expect(mocks.withTransaction).not.toHaveBeenCalled();
  expect(mocks.createAcademy).not.toHaveBeenCalled();
  expect(mocks.activateAcademySportConfig).not.toHaveBeenCalled();
  expect(mocks.getUserSubscription).not.toHaveBeenCalled();
  expect(mocks.markChecklistItem).not.toHaveBeenCalled();
  expect(mocks.apiCreated).not.toHaveBeenCalled();
  expect(mocks.recordGrowthEvent).not.toHaveBeenCalled();
  expect(mocks.logEvent).not.toHaveBeenCalled();
  expect(mocks.trackEvent).not.toHaveBeenCalled();
  expect(mocks.enqueueOnboardingOwnerD0).not.toHaveBeenCalled();
}

describe("POST /api/onboarding/owner administrative market guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({ data: { user: authenticatedUser } });
    mocks.dbSelect.mockImplementation(() => {
      throw new Error("database_reached");
    });
  });

  it.each(["US", "BR", "ZZ"])(
    "rechaza el mercado no admitido %s antes de consultar o escribir datos",
    async (countryCode) => {
      const response = await POST(request(countryCode));

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "INVALID_RELATION",
      });
      expect(mocks.apiError).toHaveBeenCalledWith(
        "INVALID_RELATION",
        "Aún no está disponible el alta autoservicio para este país.",
        422
      );
      expectNoDatabaseOrPostCreateSideEffects();
    }
  );

  it.each(["ES", "es", "MX", "mx"])(
    "deja que el mercado permitido %s continúe al control existente de perfil",
    async (countryCode) => {
      await expect(POST(request(countryCode))).rejects.toThrow(
        "database_reached"
      );

      expect(mocks.apiError).not.toHaveBeenCalled();
      expect(mocks.dbSelect).toHaveBeenCalledTimes(1);
      expect(mocks.recordOwnerSignupConsent).not.toHaveBeenCalled();
      expect(mocks.enqueueOnboardingOwnerD0).not.toHaveBeenCalled();
    }
  );

  it("exige autenticación antes de evaluar el mercado o acceder a datos", async () => {
    mocks.getAuthUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(request("US"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.apiError).toHaveBeenCalledWith(
      "UNAUTHENTICATED",
      "Debes iniciar sesión para completar la configuración",
      401
    );
    expectNoDatabaseOrPostCreateSideEffects();
  });
});
