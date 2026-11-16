/**
 * Conectar Stripe (Fase 1): rutas owner de estado, inicio y enlace nuevo.
 * El servicio se simula; aquí solo se prueba el contrato HTTP.
 */
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getConnectStatus,
  startConnectOnboarding,
} from "@/modules/payments-connect/application/connect-onboarding-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { GET, POST } from "@/app/api/v1/owner/payments/connect/route";
import { GET as GET_LINK } from "@/app/api/v1/owner/payments/connect/link/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  CONNECT_RETURN_PATH: "/owner/settings",
  CONNECT_LINK_ROUTE: "/api/v1/owner/payments/connect/link",
  getConnectStatus: vi.fn(),
  startConnectOnboarding: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const stripeUrl = "https://connect.stripe.com/setup/synthetic-link";
const base = "https://zaltyko.test/api/v1/owner/payments/connect";

function postRequest(body: unknown) {
  return new Request(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
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

  it("con sesión pide un enlace nuevo y redirige 303 a Stripe", async () => {
    vi.mocked(startConnectOnboarding).mockResolvedValue({ url: stripeUrl });

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(stripeUrl);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(startConnectOnboarding).toHaveBeenCalledWith({ userId, organizationId });
  });

  it.each([
    ["el servicio no está disponible", unavailable("flag_off")],
    ["Stripe falla", new Error("stripe caído")],
  ])("si %s redirige 303 a ajustes con stripe=error", async (_label, error) => {
    vi.mocked(startConnectOnboarding).mockRejectedValue(error);

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBe(organizationId);
    expect(location.searchParams.get("stripe")).toBe("error");
    expect(location.hash).toBe("#cobro-automatico");
  });

  it("con un organizationId no válido vuelve a ajustes con stripe=error y sin repetirlo", async () => {
    const response = await GET_LINK(new Request(`${base}/link?organizationId=no-es-un-guid`));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBeNull();
    expect(location.searchParams.get("stripe")).toBe("error");
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });

  it("sin sesión vuelve a ajustes (que pide iniciar sesión) sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET_LINK(new Request(linkUrl));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/owner/settings");
    expect(location.searchParams.get("organizationId")).toBe(organizationId);
    expect(location.searchParams.get("stripe")).toBeNull();
    expect(startConnectOnboarding).not.toHaveBeenCalled();
  });
});
