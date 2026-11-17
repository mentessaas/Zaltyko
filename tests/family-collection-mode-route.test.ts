import { getCurrentUser } from "@/lib/auth/current-user";
import { getLimitForRoute, rateLimit } from "@/lib/rate-limit";
import {
  getFamilyCollectionPreference,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  GET,
  PUT,
} from "@/app/api/v1/owner/billing/family-collection-preference/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/billing/application/family-collection-preferences", () => ({
  getFamilyCollectionPreference: vi.fn(),
  saveFamilyCollectionPreference: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000601";

const origin = "https://zaltyko.test";

function ownerScope(): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all" },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

function putRequest(
  body: unknown,
  idempotencyKey = "family-preference-001",
  requestOrigin: string | null = origin
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
  };
  if (requestOrigin !== null) headers.origin = requestOrigin;
  return new Request(
    "https://zaltyko.test/api/v1/owner/billing/family-collection-preference",
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }
  );
}

function getRequest() {
  return new Request(
    `https://zaltyko.test/api/v1/owner/billing/family-collection-preference?organizationId=${organizationId}&familyId=${familyId}`
  );
}

const automaticBody = {
  organizationId,
  familyId,
  mode: "automatic",
  expectedVersion: 0,
};

describe("per-family collection preference endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Math.floor(Date.now() / 1000) + 60,
    });
  });

  it("ROUTE_LIMITS fija 20/min para la ruta", () => {
    expect(
      getLimitForRoute("/api/v1/owner/billing/family-collection-preference")
    ).toEqual({ limit: 20, window: 60 });
  });

  it("rechaza un PUT de otro origen sin guardar ni consultar el límite", async () => {
    const response = await PUT(
      putRequest(automaticBody, "family-preference-001", "https://otra.test")
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(saveFamilyCollectionPreference).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("rechaza un PUT sin cabecera de origen", async () => {
    const response = await PUT(putRequest(automaticBody, "family-preference-001", null));
    expect(response.status).toBe(403);
    expect(saveFamilyCollectionPreference).not.toHaveBeenCalled();
  });

  it("limita los cambios por academia verificada: 429 con Retry-After y sin guardar", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });
    const response = await PUT(putRequest(automaticBody));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(saveFamilyCollectionPreference).not.toHaveBeenCalled();
    expect(resolveOwnerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(vi.mocked(rateLimit).mock.calls[0][0]).toMatchObject({ limit: 20, window: 60 });
    expect(vi.mocked(rateLimit).mock.calls[0][0].identifier).toContain(organizationId);
  });

  it("limita también las lecturas por academia verificada", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });
    const response = await GET(getRequest());

    expect(response.status).toBe(429);
    expect(getFamilyCollectionPreference).not.toHaveBeenCalled();
  });

  it("si la persona no es de la academia, el límite no llega a contarla y responde 403", async () => {
    vi.mocked(resolveOwnerScope).mockRejectedValue(
      new OperationalError("FORBIDDEN", "Sin acceso.", 403)
    );
    const response = await PUT(putRequest(automaticBody));

    expect(response.status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(saveFamilyCollectionPreference).not.toHaveBeenCalled();
  });

  it("requires a verified session before reading a family preference", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(
      new Request(
        `https://zaltyko.test/api/v1/owner/billing/family-collection-preference?organizationId=${organizationId}&familyId=${familyId}`
      )
    );

    expect(response.status).toBe(401);
    expect(getFamilyCollectionPreference).not.toHaveBeenCalled();
  });

  it("requires organization and family context before reading", async () => {
    const response = await GET(
      new Request(
        `https://zaltyko.test/api/v1/owner/billing/family-collection-preference?organizationId=${organizationId}`
      )
    );
    expect(response.status).toBe(400);
    expect(getFamilyCollectionPreference).not.toHaveBeenCalled();
  });

  it("derives the actor from the signed-in session and never activates collection", async () => {
    vi.mocked(saveFamilyCollectionPreference).mockResolvedValue({
      organizationId,
      familyId,
      requestedMode: "automatic",
      effectiveMode: "manual",
      version: 1,
      entitlementRevision: 4,
      preferenceEntitlementRevision: 4,
      automaticPreferenceAvailable: true,
      automaticProcessingEnabled: false,
      automaticStatus: "not_released",
      requiresConfirmation: false,
    });
    const response = await PUT(
      putRequest({
        organizationId,
        familyId,
        mode: "automatic",
        expectedVersion: 0,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toMatchObject({
      requestedMode: "automatic",
      effectiveMode: "manual",
      automaticProcessingEnabled: false,
    });
    expect(saveFamilyCollectionPreference).toHaveBeenCalledWith({
      organizationId,
      familyId,
      mode: "automatic",
      expectedVersion: 0,
      userId,
      idempotencyKey: "family-preference-001",
    });
  });

  it("does not persist automatic preference without paid entitlement", async () => {
    vi.mocked(saveFamilyCollectionPreference).mockRejectedValue(
      new OperationalError(
        "FEATURE_NOT_AVAILABLE",
        "El cobro automático solo se puede solicitar con un entitlement de pago vigente.",
        409
      )
    );
    const response = await PUT(
      putRequest({
        organizationId,
        familyId,
        mode: "automatic",
        expectedVersion: 0,
      })
    );

    expect(response.status).toBe(409);
    expect(saveFamilyCollectionPreference).toHaveBeenCalledOnce();
  });

  it("requires an idempotency key for writes", async () => {
    const response = await PUT(
      putRequest(
        {
          organizationId,
          familyId,
          mode: "manual",
          expectedVersion: 0,
        },
        "bad"
      )
    );

    expect(response.status).toBe(400);
    expect(saveFamilyCollectionPreference).not.toHaveBeenCalled();
  });
});
