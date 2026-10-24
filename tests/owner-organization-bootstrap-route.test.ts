import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ConsentError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "OwnerSignupConsentError";
    }
  }

  return {
    ConsentError,
    cookies: vi.fn(),
    currentUser: vi.fn(),
    authUser: vi.fn(),
    createClient: vi.fn(),
    legacyMemberships: vi.fn(),
    recordConsent: vi.fn(),
    bootstrap: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  findLegacyAcademyMemberships: mocks.legacyMemberships,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/organizations/application/owner-signup-consent", () => ({
  OwnerSignupConsentError: mocks.ConsentError,
  recordOwnerSignupConsent: mocks.recordConsent,
}));
vi.mock(
  "@/modules/organizations/application/bootstrap-organization",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/modules/organizations/application/bootstrap-organization")
    >();
    return { ...actual, bootstrapOrganization: mocks.bootstrap };
  }
);

import { POST } from "@/app/api/v1/organizations/bootstrap/route";

const userId = "10000000-0000-4000-8000-000000000001";
const idempotencyKey = "owner-bootstrap-request-01";
const payload = {
  organizationName: "Academia sintética",
  locationName: "Sede centro",
  countryCode: "ES",
  primaryDiscipline: "artistic",
  additionalDisciplines: [],
  complementaryActivities: [],
  contractualAcceptance: {
    accepted: true,
    policyVersion: "v1-2026-01-01",
  },
};

function request(body: unknown = payload, key = idempotencyKey) {
  return new Request("https://example.invalid/api/v1/organizations/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.cookies.mockReset();
  mocks.currentUser.mockReset();
  mocks.authUser.mockReset();
  mocks.createClient.mockReset();
  mocks.legacyMemberships.mockReset();
  mocks.recordConsent.mockReset();
  mocks.bootstrap.mockReset();
  mocks.cookies.mockResolvedValue({});
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.authUser.mockResolvedValue({ id: userId, user_metadata: {} });
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.authUser },
  });
  mocks.legacyMemberships.mockResolvedValue([]);
  mocks.recordConsent.mockResolvedValue("recorded");
  mocks.bootstrap.mockResolvedValue({
    organizationId: "20000000-0000-4000-8000-000000000001",
    locationId: "30000000-0000-4000-8000-000000000001",
    memberId: "40000000-0000-4000-8000-000000000001",
  });
});

describe("Owner organization bootstrap HTTP boundary", () => {
  it("requires the authenticated session before parsing or writing", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await POST(request(null));

    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("requires the independently verified Auth subject to match the session", async () => {
    mocks.authUser.mockResolvedValue({ id: "50000000-0000-4000-8000-000000000001" });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.legacyMemberships).not.toHaveBeenCalled();
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("blocks creation for an account with a legacy academy membership", async () => {
    mocks.legacyMemberships.mockResolvedValue([{ academyId: "legacy-academy" }]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("fails closed when current contractual consent is missing", async () => {
    mocks.recordConsent.mockRejectedValue(
      new mocks.ConsentError("CONSENT_REQUIRED")
    );

    const response = await POST(
      request({ ...payload, contractualAcceptance: undefined })
    );

    expect(response.status).toBe(428);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("passes only the verified user, request key and accepted payload to bootstrap", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.recordConsent).toHaveBeenCalledWith(
      { id: userId, user_metadata: {} },
      {
        requestKey: idempotencyKey,
        contractualAcceptance: payload.contractualAcceptance,
      }
    );
    expect(mocks.bootstrap).toHaveBeenCalledWith({
      organizationName: payload.organizationName,
      locationName: payload.locationName,
      countryCode: payload.countryCode,
      primaryDiscipline: payload.primaryDiscipline,
      additionalDisciplines: payload.additionalDisciplines,
      complementaryActivities: payload.complementaryActivities,
      idempotencyKey,
      userId,
    });
    expect(await response.json()).toMatchObject({
      organizationId: "20000000-0000-4000-8000-000000000001",
    });
  });
});
