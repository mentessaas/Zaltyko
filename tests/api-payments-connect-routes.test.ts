/**
 * Conectar Stripe (Fase 1): rutas owner de estado, inicio y enlace nuevo.
 * El servicio se simula; aquí solo se prueba el contrato HTTP.
 */
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLimitForRoute, rateLimit } from "@/lib/rate-limit";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  getConnectStatus,
  renewConnectOnboardingLink,
  startConnectOnboarding,
} from "@/modules/payments-connect/application/connect-onboarding-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { GET, POST } from "@/app/api/v1/owner/payments/connect/route";
import { GET as GET_LINK } from "@/app/api/v1/owner/payments/connect/link/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  // getLimitForRoute y el identificador son puros: se conservan los reales.
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  CONNECT_RETURN_PATH: "/owner/settings",
  CONNECT_LINK_ROUTE: "/api/v1/owner/payments/connect/link",
  getConnectStatus: vi.fn(),
  startConnectOnboarding: vi.fn(),
  renewConnectOnboardingLink: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const stripeUrl = "https://connect.stripe.com/setup/synthetic-link";
const base = "https://zaltyko.test/api/v1/owner/payments/connect";

// El navegador pone Origin en el fetch de la tarjeta: por defecto, el mismo
// origen que la URL; `origin: null` lo omite.
function postRequest(body: unknown, origin: string | null = new URL(base).origin) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return new Request(base, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function unavailable(reason: string) {
  return new OperationalError(
    "CONNECT_UNAVAILABLE",
    "Conectar Stripe no está disponible para esta academia ahora mismo.",
    409,
    { reason }
  );
}

function ownerScope(): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all" },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

function limitExceeded() {
  vi.mocked(rateLimit).mockResolvedValue({
    success: false,
    limit: 10,
    remaining: 0,
    reset: Math.floor(Date.now() / 1000) + 30,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

describe("límite de frecuencia de Conectar Stripe", () => {
  it("ROUTE_LIMITS fija 10/min para la ruta y, por prefijo, también para /link", () => {
    expect(getLimitForRoute("/api/v1/owner/payments/connect")).toEqual({ limit: 10, window: 60 });
    expect(getLimitForRoute("/api/v1/owner/payments/connect/link")).toEqual({ limit: 10, window: 60 });
  });
});

describe("GET /api/v1/owner/payments/connect", () => {
  it("sin sesión responde 401 sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(new Request(`${base}?organizationId=${organizationId}`));

    expect(response.status).toBe(401);
    expect(getConnectStatus).not.toHaveBeenCalled();
  });

  it.each([["sin organizationId", ""], ["con un organizationId que no es guid", "?organizationId=no-es-un-guid"]])(
    "%s responde 400",
    async (_label, query) => {
      const response = await GET(new Request(`${base}${query}`));

      expect(response.status).toBe(400);
      expect(getConnectStatus).not.toHaveBeenCalled();
    }
  );

  it("devuelve el estado con la sesión como actor y refresh=1 → refresh true", async () => {
    vi.mocked(getConnectStatus).mockResolvedValue({ kind: "not_connected" });

    const response = await GET(new Request(`${base}?organizationId=${organizationId}&refresh=1`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ kind: "not_connected" });
    expect(getConnectStatus).toHaveBeenCalledWith({ userId, organizationId, refresh: true });
  });

  it("sin refresh pide el estado guardado", async () => {
    vi.mocked(getConnectStatus).mockResolvedValue({ kind: "not_connected" });

    await GET(new Request(`${base}?organizationId=${organizationId}`));

    expect(getConnectStatus).toHaveBeenCalledWith({ userId, organizationId, refresh: false });
    // Sin refresh no se llama a Stripe: no consume el límite.
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("el refresh aplica el límite por academia verificada tras resolver el alcance", async () => {
    vi.mocked(getConnectStatus).mockResolvedValue({ kind: "not_connected" });

    await GET(new Request(`${base}?organizationId=${organizationId}&refresh=1`));

    expect(resolveOwnerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `/api/v1/owner/payments/connect:tenant:${organizationId}:ip:unknown`,
      limit: 10,
      window: 60,
    });
    expect(vi.mocked(resolveOwnerScope).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rateLimit).mock.invocationCallOrder[0]
    );
  });

  it("con el límite superado el refresh responde 429 sin llamar al servicio", async () => {
    limitExceeded();

    const response = await GET(new Request(`${base}?organizationId=${organizationId}&refresh=1`));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).not.toBeNull();
    const body = await response.json();
    expect(body.type).toBe("https://zaltyko.com/problems/rate-limit-exceeded");
    expect(getConnectStatus).not.toHaveBeenCalled();
  });

  it("una academia ajena en el refresh responde 403 sin consumir el límite", async () => {
    vi.mocked(resolveOwnerScope).mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso.", 403));

    const response = await GET(new Request(`${base}?organizationId=${organizationId}&refresh=1`));

    expect(response.status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(getConnectStatus).not.toHaveBeenCalled();
  });

  it("un error operativo del alcance se traduce a problem+json", async () => {
    vi.mocked(getConnectStatus).mockRejectedValue(
      new OperationalError("FORBIDDEN", "Sin acceso.", 403)
    );

    const response = await GET(new Request(`${base}?organizationId=${organizationId}`));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("POST /api/v1/owner/payments/connect", () => {
  it("sin sesión responde 401 sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(postRequest({ organizationId }));

    expect(response.status).toBe(401);
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it.each([
    ["sin cabecera origin", null],
    ["con un origin ajeno", "https://evil.example"],
  ])("%s responde 403 sin llamar al servicio", async (_label, origin) => {
    const response = await POST(postRequest({ organizationId }, origin));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.title).toBe("Origen no válido");
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it.each([
    ["organizationId no guid", { organizationId: "no-es-un-guid" }],
    ["sin organizationId", {}],
    ["campos de más", { organizationId, userId }],
  ])("%s responde 400", async (_label, body) => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it("CONNECT_UNAVAILABLE responde 409 con el motivo en el cuerpo", async () => {
    vi.mocked(startConnectOnboarding).mockRejectedValue(unavailable("paid_plan_required"));

    const response = await POST(postRequest({ organizationId }));

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.type).toBe("https://zaltyko.com/problems/connect-unavailable");
    expect(body.errors).toEqual({ reason: "paid_plan_required" });
  });

  it("responde 200 { url } sin caché y con la sesión como actor", async () => {
    vi.mocked(startConnectOnboarding).mockResolvedValue({ url: stripeUrl });

    const response = await POST(postRequest({ organizationId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ url: stripeUrl });
    expect(startConnectOnboarding).toHaveBeenCalledWith({ userId, organizationId });
  });

  it("con el límite superado responde 429 sin crear la cuenta", async () => {
    limitExceeded();

    const response = await POST(postRequest({ organizationId }));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.type).toBe("https://zaltyko.com/problems/rate-limit-exceeded");
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: expect.stringContaining(`:tenant:${organizationId}:`), limit: 10, window: 60 })
    );
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it("si Stripe falla responde 502 sin detalles del proveedor", async () => {
    vi.mocked(startConnectOnboarding).mockRejectedValue(new Error("detalle interno del proveedor"));

    const response = await POST(postRequest({ organizationId }));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("detalle interno");
  });
});

describe("GET /api/v1/owner/payments/connect/link", () => {
  const linkUrl = `${base}/link?organizationId=${organizationId}`;

  it("con sesión renueva el enlace y redirige 303 a Stripe, sin pasar por el alta", async () => {
    vi.mocked(renewConnectOnboardingLink).mockResolvedValue({ url: stripeUrl });

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(stripeUrl);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(renewConnectOnboardingLink).toHaveBeenCalledWith({ userId, organizationId });
    // El GET nunca usa el camino que puede crear la cuenta conectada.
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it.each([
    ["el servicio no está disponible", unavailable("flag_off")],
    ["la academia aún no tiene cuenta conectada (NOT_FOUND)", new OperationalError("NOT_FOUND", "Esta academia todavía no ha conectado Stripe.", 404)],
    ["Stripe falla", new Error("stripe caído")],
  ])("si %s redirige 303 a ajustes con stripe=error", async (_label, error) => {
    vi.mocked(renewConnectOnboardingLink).mockRejectedValue(error);

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBe(organizationId);
    expect(location.searchParams.get("stripe")).toBe("error");
    expect(location.hash).toBe("#cobro-automatico");
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it("con el límite superado redirige 303 a ajustes con stripe=error, sin JSON ni Stripe", async () => {
    limitExceeded();

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBe(organizationId);
    expect(location.searchParams.get("stripe")).toBe("error");
    expect(location.hash).toBe("#cobro-automatico");
    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `/api/v1/owner/payments/connect/link:tenant:${organizationId}:ip:unknown`,
      limit: 10,
      window: 60,
    });
    expect(renewConnectOnboardingLink).not.toHaveBeenCalled();
  });

  it("con un organizationId no válido vuelve a ajustes con stripe=error y sin repetirlo", async () => {
    const response = await GET_LINK(new Request(`${base}/link?organizationId=no-es-un-guid`));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBeNull();
    expect(location.searchParams.get("stripe")).toBe("error");
    expect(renewConnectOnboardingLink).not.toHaveBeenCalled();
  });

  it("sin sesión vuelve a ajustes (que pide iniciar sesión) sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBe(organizationId);
    expect(location.searchParams.get("stripe")).toBeNull();
    expect(renewConnectOnboardingLink).not.toHaveBeenCalled();
  });
});
