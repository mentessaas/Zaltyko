import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  submit: vi.fn(),
  list: vi.fn(),
  changeStatus: vi.fn(),
  convert: vi.fn(),
  anonymize: vi.fn(),
  manageLink: vi.fn(),
  resolveOrg: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (_request: Request, organizationId: string) => `verified:${organizationId}`,
  getClientIdentifier: () => "ip:203.0.113.10",
  getAddressHashRateLimitIdentifier: (_email: string, pathname: string) => `${pathname}:address:hash`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({ resolveOwnerScope: mocks.ownerScope }));
vi.mock("@/modules/admissions/application/admission-requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/admissions/application/admission-requests")>()),
  submitPublicTrialRequest: mocks.submit,
  listOwnerTrialRequests: mocks.list,
  changeTrialRequestStatus: mocks.changeStatus,
  convertTrialRequest: mocks.convert,
  anonymizeTrialRequest: mocks.anonymize,
  manageAdmissionLink: mocks.manageLink,
  resolveAdmissionLinkOrganization: mocks.resolveOrg,
}));

import { POST as submitRoute } from "@/app/api/public/trial-requests/route";
import { GET as listRoute } from "@/app/api/v1/owner/trial-requests/route";
import { POST as statusRoute } from "@/app/api/v1/owner/trial-requests/[requestId]/status/route";
import { POST as convertRoute } from "@/app/api/v1/owner/trial-requests/[requestId]/convert/route";
import { POST as anonymizeRoute } from "@/app/api/v1/owner/trial-requests/[requestId]/anonymize/route";
import { POST as linksRoute } from "@/app/api/v1/owner/trial-requests/links/route";
import { LINK_NOT_RECEIVING_MESSAGE } from "@/modules/admissions/application/admission-requests";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ORIGIN = "https://zaltyko.test";
const ORG = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const SITE = "a0000000-0000-4000-8000-000000000011";
const REQUEST_ID = "a0000000-0000-4000-8000-0000000000cc";
const USER = "a0000000-0000-4000-8000-0000000000ee";
const TOKEN = "0123456789abcdef0123456789abcdef";

function request(path: string, method: string, body?: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function publicBody(overrides: Record<string, unknown> = {}) {
  return {
    linkToken: TOKEN,
    locationId: SITE,
    submissionId: "a0000000-0000-4000-8000-0000000000aa",
    contactName: "Ana Pérez",
    contactEmail: "ana@example.invalid",
    contactPhone: null,
    athleteGivenName: "Lúa",
    athleteBirthYear: 2017,
    message: null,
    privacyConsent: true,
    website: null,
    ...overrides,
  };
}

const scope = {
  organization: { id: ORG, name: "Club", defaultCurrency: "EUR" },
  member: { id: "a0000000-0000-4000-8000-0000000000dd", role: "manager", locationScopeMode: "selected" },
  locations: [{ id: SITE, name: "Sede 1" }],
  selectedLocationId: SITE,
  canViewOrganizationAggregate: false,
};

const params = (requestId = REQUEST_ID) => ({ params: Promise.resolve({ requestId }) });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.rateLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
  mocks.currentUser.mockResolvedValue({ id: USER });
  mocks.ownerScope.mockResolvedValue(scope);
  mocks.resolveOrg.mockResolvedValue(ORG);
});

describe("POST /api/public/trial-requests", () => {
  it("rechaza otro origen sin tocar datos", async () => {
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody(), "https://other.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("responde como si nada al honeypot y no guarda", async () => {
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody({ website: "spam.example" })));
    expect(response.status).toBe(201);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("exige consentimiento y valida con Zod", async () => {
    const noConsent = await submitRoute(request("/api/public/trial-requests", "POST", publicBody({ privacyConsent: false })));
    expect(noConsent.status).toBe(400);
    expect((await noConsent.json()).detail).toMatch(/consentimiento/);
    const extra = await submitRoute(request("/api/public/trial-requests", "POST", publicBody({ athleteFamilyName: "Pérez" })));
    expect(extra.status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("rechaza cuerpos de más de 8 KB", async () => {
    const response = await submitRoute(
      request("/api/public/trial-requests", "POST", JSON.stringify(publicBody({ message: "x".repeat(9000) })))
    );
    expect(response.status).toBe(413);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("aplica el límite por IP antes de validar y el de email después", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: 0 });
    const blocked = await submitRoute(request("/api/public/trial-requests", "POST", publicBody()));
    expect(blocked.status).toBe(429);
    expect(mocks.rateLimit.mock.calls[0]?.[0]).toMatchObject({ identifier: "trial-requests:ip:203.0.113.10" });

    mocks.rateLimit
      .mockResolvedValueOnce({ success: true, limit: 10, remaining: 9, reset: 0 })
      .mockResolvedValueOnce({ success: false, limit: 5, remaining: 0, reset: 0 });
    const byAddress = await submitRoute(request("/api/public/trial-requests", "POST", publicBody()));
    expect(byAddress.status).toBe(429);
    expect(mocks.rateLimit.mock.calls[2]?.[0]).toMatchObject({ identifier: "/api/public/trial-requests:address:hash" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("crea la solicitud normalizada y no devuelve datos personales", async () => {
    mocks.submit.mockResolvedValue({ requestId: REQUEST_ID, replayed: false });
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody({ contactEmail: "Ana@Example.INVALID" })));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: "ana@example.invalid", linkToken: TOKEN }));
    expect(mocks.resolveOrg).toHaveBeenCalledWith(TOKEN);
  });

  it("responde 200 a un reenvío idéntico y propaga 503 si no está activado", async () => {
    mocks.submit.mockResolvedValueOnce({ requestId: REQUEST_ID, replayed: true });
    expect((await submitRoute(request("/api/public/trial-requests", "POST", publicBody()))).status).toBe(200);
    mocks.submit.mockRejectedValueOnce(new OperationalError("FEATURE_NOT_AVAILABLE", "no", 503));
    expect((await submitRoute(request("/api/public/trial-requests", "POST", publicBody()))).status).toBe(503);
  });
});

describe("token del enlace público", () => {
  async function problemFor(setup: () => void) {
    setup();
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody()));
    return { status: response.status, body: await response.json() };
  }

  it("responde igual a un token desconocido, desactivado o revocado", async () => {
    // El servicio no distingue: los tres casos devuelven null al resolver.
    const unknown = await problemFor(() => mocks.resolveOrg.mockResolvedValueOnce(null));
    const disabled = await problemFor(() => mocks.resolveOrg.mockResolvedValueOnce(null));
    // Revocado entre la resolución y la escritura: el servicio lanza el mismo 404.
    const revoked = await problemFor(() =>
      mocks.submit.mockRejectedValueOnce(new OperationalError("NOT_FOUND", LINK_NOT_RECEIVING_MESSAGE, 404))
    );
    expect(unknown).toEqual({
      status: 404,
      body: expect.objectContaining({ status: 404, detail: LINK_NOT_RECEIVING_MESSAGE }),
    });
    expect(disabled).toEqual(unknown);
    expect(revoked).toEqual(unknown);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("rechaza tokens mal formados sin consultar la base de datos", async () => {
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody({ linkToken: ORG })));
    expect(response.status).toBe(400);
    expect(mocks.resolveOrg).not.toHaveBeenCalled();
  });

  it("aplica el límite por academia resuelta desde el enlace", async () => {
    mocks.rateLimit
      .mockResolvedValueOnce({ success: true, limit: 10, remaining: 9, reset: 0 })
      .mockResolvedValueOnce({ success: true, limit: 5, remaining: 4, reset: 0 })
      .mockResolvedValueOnce({ success: false, limit: 30, remaining: 0, reset: 0 });
    const response = await submitRoute(request("/api/public/trial-requests", "POST", publicBody()));
    expect(response.status).toBe(429);
    expect(mocks.rateLimit.mock.calls[2]?.[0]).toEqual({ identifier: `trial-requests:org:${ORG}`, limit: 30, window: 3600 });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("no aplica el límite por academia a un token que no resuelve", async () => {
    mocks.resolveOrg.mockResolvedValueOnce(null);
    await submitRoute(request("/api/public/trial-requests", "POST", publicBody()));
    expect(mocks.rateLimit.mock.calls.map(([config]) => config.identifier)).not.toContain(`trial-requests:org:${ORG}`);
  });
});

describe("POST /api/v1/owner/trial-requests/links", () => {
  it("exige sesión y mismo origen", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    expect((await linksRoute(request("/api/v1/owner/trial-requests/links", "POST", { organizationId: ORG, locationId: null, action: "enable" }))).status).toBe(401);
    expect((await linksRoute(request("/api/v1/owner/trial-requests/links", "POST", { organizationId: ORG, locationId: null, action: "enable" }, "https://other.invalid"))).status).toBe(403);
    expect(mocks.manageLink).not.toHaveBeenCalled();
  });

  it("valida la acción", async () => {
    const response = await linksRoute(request("/api/v1/owner/trial-requests/links", "POST", { organizationId: ORG, locationId: null, action: "delete" }));
    expect(response.status).toBe(400);
    expect(mocks.manageLink).not.toHaveBeenCalled();
  });

  it("propaga el 403 cuando no es dirección o administración con todas las sedes", async () => {
    mocks.manageLink.mockRejectedValue(new OperationalError("FORBIDDEN", "no", 403));
    const response = await linksRoute(request("/api/v1/owner/trial-requests/links", "POST", { organizationId: ORG, locationId: SITE, action: "regenerate" }));
    expect(response.status).toBe(403);
    expect(mocks.manageLink).toHaveBeenCalledWith({ scope, userId: USER, locationId: SITE, action: "regenerate" });
  });

  it("devuelve el enlace con el alcance resuelto en el servidor", async () => {
    mocks.manageLink.mockResolvedValue({ id: REQUEST_ID, locationId: null, token: TOKEN, enabled: true, createdAt: "2026-11-10T00:00:00.000Z" });
    const response = await linksRoute(request("/api/v1/owner/trial-requests/links", "POST", { organizationId: ORG, locationId: null, action: "enable" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.token).toBe(TOKEN);
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId: USER, organizationId: ORG });
  });
});

describe("POST /api/v1/owner/trial-requests/[requestId]/anonymize", () => {
  it("suprime con la revisión esperada y el alcance resuelto", async () => {
    mocks.anonymize.mockResolvedValue({ id: REQUEST_ID, status: "declined", revision: 3 });
    const response = await anonymizeRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/anonymize`, "POST", { organizationId: ORG, expectedRevision: 2 }),
      params()
    );
    expect(response.status).toBe(200);
    expect(mocks.anonymize).toHaveBeenCalledWith({ scope, userId: USER, requestId: REQUEST_ID, expectedRevision: 2 });
  });

  it("rechaza otro origen", async () => {
    const response = await anonymizeRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/anonymize`, "POST", { organizationId: ORG, expectedRevision: 2 }, "https://other.invalid"),
      params()
    );
    expect(response.status).toBe(403);
    expect(mocks.anonymize).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/owner/trial-requests", () => {
  it("exige sesión", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await listRoute(request(`/api/v1/owner/trial-requests?organizationId=${ORG}`, "GET"));
    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
  });

  it("valida el filtro con Zod", async () => {
    const response = await listRoute(request(`/api/v1/owner/trial-requests?organizationId=${ORG}&view=all`, "GET"));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("resuelve el alcance con resolveOwnerScope y no lista si lo deniega", async () => {
    mocks.ownerScope.mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso a la superficie Owner", 403));
    const response = await listRoute(request(`/api/v1/owner/trial-requests?organizationId=${ORG_B}`, "GET"));
    expect(response.status).toBe(403);
    expect(mocks.ownerScope).toHaveBeenCalledWith({ userId: USER, organizationId: ORG_B });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("pasa el alcance resuelto (no el del cliente) al servicio", async () => {
    mocks.list.mockResolvedValue({ available: true, items: [], total: 0, page: 1, pageSize: 25 });
    const response = await listRoute(
      request(`/api/v1/owner/trial-requests?organizationId=${ORG}&locationId=${SITE}&view=closed`, "GET")
    );
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ scope, locationId: SITE, view: "closed", page: 1, pageSize: 25 });
  });
});

describe("POST /api/v1/owner/trial-requests/[requestId]/status y /convert", () => {
  it("rechaza otro origen", async () => {
    const response = await statusRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/status`, "POST", { organizationId: ORG, expectedRevision: 1, status: "contacted" }, "https://other.invalid"),
      params()
    );
    expect(response.status).toBe(403);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });

  it("cambia el estado con el alcance resuelto", async () => {
    mocks.changeStatus.mockResolvedValue({ id: REQUEST_ID, status: "contacted", revision: 2 });
    const response = await statusRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/status`, "POST", { organizationId: ORG, expectedRevision: 1, status: "contacted" }),
      params()
    );
    expect(response.status).toBe(200);
    expect(mocks.changeStatus).toHaveBeenCalledWith({
      scope,
      userId: USER,
      requestId: REQUEST_ID,
      expectedRevision: 1,
      status: "contacted",
    });
  });

  it("devuelve 404 cuando la solicitud es de otra sede o academia", async () => {
    mocks.changeStatus.mockRejectedValue(new OperationalError("NOT_FOUND", "Solicitud no encontrada", 404));
    const response = await statusRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/status`, "POST", { organizationId: ORG, expectedRevision: 1, status: "declined" }),
      params()
    );
    expect(response.status).toBe(404);
  });

  it("valida el destino de la conversión antes de resolver el alcance", async () => {
    const response = await convertRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/convert`, "POST", {
        organizationId: ORG,
        expectedRevision: 1,
        familyName: "Pérez",
        relationship: "parent",
        destination: "waitlist",
        classTemplateId: null,
      }),
      params()
    );
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toBe("Elige la clase de la lista de espera");
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("propaga el 403 del servicio cuando quien convierte no tiene todas las sedes", async () => {
    mocks.convert.mockRejectedValue(new OperationalError("FORBIDDEN", "requiere todas las sedes", 403));
    const response = await convertRoute(
      request(`/api/v1/owner/trial-requests/${REQUEST_ID}/convert`, "POST", {
        organizationId: ORG,
        expectedRevision: 1,
        familyName: "Pérez",
        relationship: "parent",
        destination: "enrollment",
        classTemplateId: null,
      }),
      params()
    );
    expect(response.status).toBe(403);
    expect(mocks.convert).toHaveBeenCalledWith(expect.objectContaining({ scope, userId: USER, requestId: REQUEST_ID }));
  });

  it("rechaza identificadores de solicitud inválidos", async () => {
    const response = await statusRoute(
      request(`/api/v1/owner/trial-requests/nope/status`, "POST", { organizationId: ORG, expectedRevision: 1, status: "contacted" }),
      params("nope")
    );
    expect(response.status).toBe(400);
    expect(mocks.changeStatus).not.toHaveBeenCalled();
  });
});
