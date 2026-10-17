import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getFamilyCollectionPreference,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  GET,
  PUT,
} from "@/app/api/v1/owner/billing/family-collection-preference/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/modules/billing/application/family-collection-preferences", () => ({
  getFamilyCollectionPreference: vi.fn(),
  saveFamilyCollectionPreference: vi.fn(),
}));

const userId = "10000000-0000-0000-0000-000000000101";
const organizationId = "10000000-0000-0000-0000-000000000001";
const familyId = "10000000-0000-0000-0000-000000000601";

function putRequest(body: unknown, idempotencyKey = "family-preference-001") {
  return new Request(
    "https://zaltyko.test/api/v1/owner/billing/family-collection-preference",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    }
  );
}

describe("per-family collection preference endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
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
