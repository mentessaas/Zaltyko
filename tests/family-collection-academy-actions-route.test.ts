import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): ruta POST /api/v1/owner/payments/automatic-collection
 * con el servicio simulado. Sesión, mismo origen, cuerpo estricto, límite por
 * academia verificada y no-store.
 */

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/family-collection-academy-actions", () => ({
  cancelAutomaticCollection: vi.fn(),
  markAutomaticCollectionReviewed: vi.fn(),
}));

import { POST } from "@/app/api/v1/owner/payments/automatic-collection/route";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getLimitForRoute, rateLimit } from "@/lib/rate-limit";
import {
  cancelAutomaticCollection,
  markAutomaticCollectionReviewed,
} from "@/modules/family-collection/application/family-collection-academy-actions";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const invoiceId = "10000000-0000-4000-8000-000000000008";
const origin = "https://zaltyko.test";
const url = `${origin}/api/v1/owner/payments/automatic-collection`;

function ownerScope(): OwnerScope {
  return {
    organization: { id: organizationId, name: "Club Sintético", defaultCurrency: "EUR" },
    member: { id: "10000000-0000-4000-8000-000000000201", role: "owner", locationScopeMode: "all" },
    locations: [],
    selectedLocationId: null,
    canViewOrganizationAggregate: true,
  };
}

function post(body: unknown, requestOrigin: string | null = origin) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (requestOrigin !== null) headers.origin = requestOrigin;
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId } as never);
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(rateLimit).mockResolvedValue({
    success: true,
    limit: 10,
    remaining: 9,
    reset: Math.floor(Date.now() / 1000) + 60,
  });
  vi.mocked(cancelAutomaticCollection).mockResolvedValue({ outcome: "canceled" });
  vi.mocked(markAutomaticCollectionReviewed).mockResolvedValue({ outcome: "reviewed" });
});

describe("ruta /api/v1/owner/payments/automatic-collection", () => {
  it("ROUTE_LIMITS fija 10/min para la ruta", () => {
    expect(getLimitForRoute("/api/v1/owner/payments/automatic-collection")).toEqual({ limit: 10, window: 60 });
  });

  it("sin sesión responde 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
  });

  it.each([
    ["con un origin ajeno", "https://evil.example"],
    ["sin cabecera origin", null],
  ])("%s responde 403 sin resolver el alcance", async (_label, requestOrigin) => {
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }, requestOrigin));
    expect(response.status).toBe(403);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
  });

  it.each([
    ["una acción desconocida", { action: "refund", organizationId, invoiceId }],
    ["revisar sin confirmar Stripe", { action: "mark_reviewed", organizationId, invoiceId }],
    ["revisar con la confirmación en falso", { action: "mark_reviewed", organizationId, invoiceId, checkedInStripe: false }],
    ["un campo extra", { action: "cancel", organizationId, invoiceId, amountCents: 100 }],
    ["una factura que no es un id", { action: "cancel", organizationId, invoiceId: "MENSUAL-1" }],
  ])("con %s responde 400", async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
    expect(markAutomaticCollectionReviewed).not.toHaveBeenCalled();
  });

  it("cancelar llama al servicio con la sesión como actor, tras el límite por academia verificada", async () => {
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ outcome: "canceled" });
    expect(cancelAutomaticCollection).toHaveBeenCalledWith({ userId, organizationId, invoiceId });
    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `/api/v1/owner/payments/automatic-collection:tenant:${organizationId}:ip:unknown`,
      limit: 10,
      window: 60,
    });
  });

  it("marcar como revisado pasa la confirmación de la persona", async () => {
    const response = await POST(post({ action: "mark_reviewed", organizationId, invoiceId, checkedInStripe: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "reviewed" });
    expect(markAutomaticCollectionReviewed).toHaveBeenCalledWith({
      userId,
      organizationId,
      invoiceId,
      checkedInStripe: true,
    });
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
  });

  it("C1: revisado sin poder saber si se cobró: la respuesta lo dice (unverifiable)", async () => {
    vi.mocked(markAutomaticCollectionReviewed).mockResolvedValueOnce({ outcome: "unverifiable" });
    const response = await POST(post({ action: "mark_reviewed", organizationId, invoiceId, checkedInStripe: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "unverifiable" });
  });

  it("un 409 del servicio llega con su texto", async () => {
    vi.mocked(cancelAutomaticCollection).mockRejectedValue(
      new OperationalError(
        "AUTOMATIC_COLLECTION_PROCESSING",
        "Este cobro ya se envió al banco y no se puede cancelar. Espera al resultado.",
        409
      )
    );
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      type: "https://zaltyko.com/problems/automatic-collection-processing",
      detail: "Este cobro ya se envió al banco y no se puede cancelar. Espera al resultado.",
    });
  });

  it("un error inesperado responde 503 sin detalles", async () => {
    vi.mocked(cancelAutomaticCollection).mockRejectedValue(new Error("boom: sql text"));
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sql text");
  });

  it("con el límite agotado responde 429 sin llamar al servicio", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 30,
    });
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).not.toBeNull();
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
  });

  it("sin pertenecer a la academia responde 403 antes del límite", async () => {
    vi.mocked(resolveOwnerScope).mockRejectedValue(new OperationalError("FORBIDDEN", "Acceso denegado", 403));
    const response = await POST(post({ action: "cancel", organizationId, invoiceId }));
    expect(response.status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(cancelAutomaticCollection).not.toHaveBeenCalled();
  });
});
