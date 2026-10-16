import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAuthUser: vi.fn(),
  findLegacyAcademyMemberships: vi.fn(),
  recordConsent: vi.fn(),
  bootstrap: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getAuthUser },
  })),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  findLegacyAcademyMemberships: mocks.findLegacyAcademyMemberships,
}));
vi.mock("@/modules/organizations/application/owner-signup-consent", () => {
  class OwnerSignupConsentError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    OwnerSignupConsentError,
    recordOwnerSignupConsent: mocks.recordConsent,
  };
});
vi.mock("@/modules/organizations/application/bootstrap-organization", () => ({
  bootstrapOrganizationRequestSchema: {
    safeParse: (value: unknown) => ({
      success: true,
      data: value,
    }),
  },
  bootstrapOrganization: mocks.bootstrap,
}));

import { POST } from "@/app/api/v1/organizations/bootstrap/route";
import { OwnerSignupConsentError } from "@/modules/organizations/application/owner-signup-consent";

const payload = {
  organizationName: "Club de Prueba",
  locationName: "Sede Centro",
  primaryDiscipline: "rhythmic",
  additionalDisciplines: [],
  complementaryActivities: [],
  idempotencyKey: "request-12345678",
};
const owner = { id: "f0a8d116-459b-4e4c-b4d0-865f63180123" };
const authUser = {
  ...owner,
  user_metadata: { legal_consent_version: "v1-2026-10-14" },
};

function request(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/v1/organizations/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "request-12345678",
    },
    body: JSON.stringify({ ...payload, ...extra }),
  });
}

describe("POST /api/v1/organizations/bootstrap consent gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(owner);
    mocks.findLegacyAcademyMemberships.mockResolvedValue([]);
    mocks.getAuthUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    mocks.recordConsent.mockResolvedValue("recorded");
    mocks.bootstrap.mockResolvedValue({ organizationId: "org-1" });
  });

  it("no crea organización si falta consentimiento", async () => {
    mocks.recordConsent.mockRejectedValue(
      new OwnerSignupConsentError("CONSENT_REQUIRED")
    );
    const response = await POST(request());
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({
      type: expect.stringContaining("consent-required"),
    });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("usa el usuario completo obtenido de auth.getUser, ligado a la sesión", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.recordConsent).toHaveBeenCalledWith(authUser, {
      requestKey: payload.idempotencyKey,
      contractualAcceptance: undefined,
    });
  });

  it("bloquea cuentas legacy antes de registrar consentimiento o crear organización", async () => {
    mocks.findLegacyAcademyMemberships.mockResolvedValue([
      { academyId: "legacy-academy-1", membershipRole: "owner" },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: expect.stringContaining("legacy-academy-link-required"),
    });
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("falla cerrado si no puede comprobar membresías legacy", async () => {
    mocks.findLegacyAcademyMemberships.mockRejectedValue(
      new Error("catalog permission denied")
    );

    await expect(POST(request())).rejects.toThrow("catalog permission denied");
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("pasa la aceptación explícita al gate para una cuenta existente", async () => {
    const contractualAcceptance = {
      accepted: true as const,
      policyVersion: "v1-2026-08-01",
    };
    const response = await POST(request({ contractualAcceptance }));
    expect(response.status).toBe(201);
    expect(mocks.recordConsent).toHaveBeenCalledWith(authUser, {
      requestKey: payload.idempotencyKey,
      contractualAcceptance,
    });
  });

  it("rechaza la forma de aceptación explícita antes de consultar el store", async () => {
    const response = await POST(
      request({
        contractualAcceptance: { accepted: false, policyVersion: "v1" },
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("rechaza una segunda lectura auth inconsistente antes del gate", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: "d4a719e5-d6ba-4f6e-bddc-8f1228b24426" } },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("falla cerrado si no se puede recuperar el usuario verificado", async () => {
    mocks.getAuthUser.mockRejectedValue(new Error("auth backend unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "auth backend unavailable"
    );
    expect(mocks.recordConsent).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("devuelve un error controlado si los metadatos no son válidos", async () => {
    mocks.recordConsent.mockRejectedValue(
      new OwnerSignupConsentError("CONSENT_REJECTED")
    );
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(
      "CONSENT_REJECTED"
    );
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("falla cerrado y no expone errores internos de base de datos", async () => {
    mocks.recordConsent.mockRejectedValue(
      new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE")
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "CONSENT_STORE_UNAVAILABLE"
    );
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("espera a persistir consentimiento antes de crear y vincula el usuario autenticado", async () => {
    const order: string[] = [];
    mocks.recordConsent.mockImplementation(async () => {
      order.push("consent");
    });
    mocks.bootstrap.mockImplementation(async (command) => {
      order.push("bootstrap");
      expect(command.userId).toBe(owner.id);
      return { organizationId: "org-1" };
    });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(order).toEqual(["consent", "bootstrap"]);
  });
});
