/**
 * Pago automático de cuotas (Fase 2): ruta de la familia (guardar, completar
 * y revocar) y ruta de la academia (revocar). El servicio se simula; aquí
 * solo se prueba el contrato HTTP.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logger } from "@/lib/logger";
import { getLimitForRoute, rateLimit } from "@/lib/rate-limit";
import {
  completeFamilyPaymentSetup,
  revokeFamilyPaymentMethod,
  revokeFamilyPaymentMethodByOwner,
  startFamilyPaymentSetup,
} from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { resolveOwnerScope, type OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { POST as FAMILY_POST } from "@/app/api/v1/family/payment-methods/route";
import { POST as OWNER_POST } from "@/app/api/v1/owner/payments/family-methods/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  // getLimitForRoute, el identificador y la respuesta 429 son puros: se conservan.
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/application/family-payment-methods-service", () => ({
  startFamilyPaymentSetup: vi.fn(),
  completeFamilyPaymentSetup: vi.fn(),
  revokeFamilyPaymentMethod: vi.fn(),
  revokeFamilyPaymentMethodByOwner: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000101";
const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000301";
const authorizationId = "10000000-0000-4000-8000-000000000401";
const origin = "https://zaltyko.test";
const familyUrl = `${origin}/api/v1/family/payment-methods`;
const ownerUrl = `${origin}/api/v1/owner/payments/family-methods`;
const consentVersion = "borrador-2026-11-16";

const FAMILY_FLAG = "ZALTYKO_FAMILY_ACCESS_ENABLED";
const PHASE_FLAG = "ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED";
const previousFlags = { family: process.env[FAMILY_FLAG], phase: process.env[PHASE_FLAG] };

const setupBody = {
  action: "setup",
  organizationId,
  familyId,
  kind: "card",
  consentVersion,
  consentAccepted: true,
};
const completeBody = { action: "complete", organizationId, familyId, setupIntentId: "seti_1SyntheticAbc" };
const revokeBody = { action: "revoke", organizationId, familyId };
/** Valor sintético montado en tiempo de ejecución: no es un secreto real. */
const SYNTHETIC_CLIENT_SECRET = ["seti_1SyntheticAbc", "secret", "synthetic"].join("_");

function post(
  url: string,
  body: unknown,
  options: { origin?: string | null; headers?: Record<string, string>; raw?: boolean } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json", ...options.headers };
  const requestOrigin = options.origin === undefined ? origin : options.origin;
  if (requestOrigin !== null) headers.origin = requestOrigin;
  return new Request(url, {
    method: "POST",
    headers,
    body: options.raw ? String(body) : JSON.stringify(body),
  });
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

function noServiceCalled() {
  expect(startFamilyPaymentSetup).not.toHaveBeenCalled();
  expect(completeFamilyPaymentSetup).not.toHaveBeenCalled();
  expect(revokeFamilyPaymentMethod).not.toHaveBeenCalled();
  expect(revokeFamilyPaymentMethodByOwner).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  process.env[FAMILY_FLAG] = "true";
  process.env[PHASE_FLAG] = "true";
  vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
  vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope());
  vi.mocked(rateLimit).mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

afterAll(() => {
  if (previousFlags.family === undefined) delete process.env[FAMILY_FLAG];
  else process.env[FAMILY_FLAG] = previousFlags.family;
  if (previousFlags.phase === undefined) delete process.env[PHASE_FLAG];
  else process.env[PHASE_FLAG] = previousFlags.phase;
});

describe("POST /api/v1/family/payment-methods: acceso", () => {
  it("sin sesión responde 401 sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await FAMILY_POST(post(familyUrl, setupBody));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    noServiceCalled();
  });

  it.each([
    ["con un origin ajeno", "https://evil.example"],
    ["sin cabecera origin", null],
  ])("%s responde 403 sin llamar al servicio", async (_label, requestOrigin) => {
    const response = await FAMILY_POST(post(familyUrl, setupBody, { origin: requestOrigin }));

    expect(response.status).toBe(403);
    expect(getCurrentUser).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it("con el acceso de familias apagado responde 503 sin leer la sesión", async () => {
    delete process.env[FAMILY_FLAG];

    const response = await FAMILY_POST(post(familyUrl, setupBody));

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("FEATURE_NOT_AVAILABLE");
    expect(getCurrentUser).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it.each([
    ["setup", setupBody],
    ["complete", completeBody],
    ["una acción desconocida", { ...revokeBody, action: "charge" }],
    ["un cuerpo sin acción", { organizationId, familyId }],
  ])("con la bandera de esta fase apagada, %s responde 503 sin llamar al servicio", async (_label, body) => {
    delete process.env[PHASE_FLAG];

    const response = await FAMILY_POST(post(familyUrl, body));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload.code).toBe("FEATURE_NOT_AVAILABLE");
    expect(payload.message).toBe("El pago automático no está disponible ahora mismo.");
    noServiceCalled();
  });

  it("con la bandera de esta fase apagada, revoke sí llega al servicio", async () => {
    delete process.env[PHASE_FLAG];
    vi.mocked(revokeFamilyPaymentMethod).mockResolvedValue({ outcome: "revoked" });

    const response = await FAMILY_POST(post(familyUrl, revokeBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(revokeFamilyPaymentMethod).toHaveBeenCalledWith({ userId, organizationId, familyId });
    expect(startFamilyPaymentSetup).not.toHaveBeenCalled();
    expect(completeFamilyPaymentSetup).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ ok: true, data: { outcome: "revoked" } });
  });

  it("con la bandera de esta fase apagada, revoke con un campo extra responde 400 sin llamar al servicio", async () => {
    delete process.env[PHASE_FLAG];

    const response = await FAMILY_POST(post(familyUrl, { ...revokeBody, userId }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_FAMILY_ACCESS_COMMAND");
    noServiceCalled();
  });

  it("con las dos banderas apagadas, revoke responde 503 sin leer la sesión", async () => {
    delete process.env[PHASE_FLAG];
    delete process.env[FAMILY_FLAG];

    const response = await FAMILY_POST(post(familyUrl, revokeBody));

    expect(response.status).toBe(503);
    expect(getCurrentUser).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it("aplica el límite por cuenta de 10 por minuto", async () => {
    vi.mocked(revokeFamilyPaymentMethod).mockResolvedValue({ outcome: "none" });

    await FAMILY_POST(post(familyUrl, revokeBody));

    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `family-access:/api/v1/family/payment-methods:${userId}`,
      limit: 10,
      window: 60,
    });
  });

  it("con el límite superado responde 429 sin llamar al servicio", async () => {
    limitExceeded();

    const response = await FAMILY_POST(post(familyUrl, setupBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    noServiceCalled();
  });
});

describe("POST /api/v1/family/payment-methods: cuerpo", () => {
  it.each([
    ["setup con un campo extra", { ...setupBody, clientIp: "203.0.113.9" }],
    ["complete con un campo extra", { ...completeBody, kind: "card" }],
    ["revoke con un campo extra", { ...revokeBody, userId }],
    ["una acción desconocida", { ...revokeBody, action: "charge" }],
    ["sin acción", { organizationId, familyId }],
    ["setup sin aceptar el texto", { ...setupBody, consentAccepted: false }],
    ["setup sin consentAccepted", { action: "setup", organizationId, familyId, kind: "card", consentVersion }],
    ["setup con un método desconocido", { ...setupBody, kind: "paypal" }],
    ["complete con una referencia que no es seti_", { ...completeBody, setupIntentId: "pi_123" }],
    ["complete con caracteres raros en la referencia", { ...completeBody, setupIntentId: "seti_abc/../x" }],
    ["una academia que no es uuid", { ...revokeBody, organizationId: "no-es-un-uuid" }],
    ["una familia que no es uuid", { ...revokeBody, familyId: "no-es-un-uuid" }],
  ])("%s responde 400 sin llamar al servicio", async (_label, body) => {
    const response = await FAMILY_POST(post(familyUrl, body));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).code).toBe("INVALID_FAMILY_ACCESS_COMMAND");
    noServiceCalled();
  });

  it("un cuerpo que no es JSON responde 400", async () => {
    const response = await FAMILY_POST(post(familyUrl, "{no-json", { raw: true }));

    expect(response.status).toBe(400);
    noServiceCalled();
  });
});

describe("POST /api/v1/family/payment-methods: acciones", () => {
  it("setup pasa la IP entera (primera de x-forwarded-for) y el agente, y devuelve solo clientSecret y connectedAccount", async () => {
    vi.mocked(startFamilyPaymentSetup).mockResolvedValue({
      clientSecret: SYNTHETIC_CLIENT_SECRET,
      connectedAccount: "acct_1Synthetic",
      setupIntentId: "seti_1SyntheticAbc",
    });

    const response = await FAMILY_POST(
      post(familyUrl, setupBody, {
        headers: {
          "x-forwarded-for": "203.0.113.77, 10.0.0.1",
          "x-real-ip": "198.51.100.5",
          "user-agent": "Mozilla/5.0 (Sintético)",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(startFamilyPaymentSetup).toHaveBeenCalledWith({
      userId,
      organizationId,
      familyId,
      kind: "card",
      consentVersion,
      consentAccepted: true,
      clientIp: "203.0.113.77",
      userAgent: "Mozilla/5.0 (Sintético)",
    });
    const payload = await response.json();
    expect(payload).toEqual({
      ok: true,
      data: { clientSecret: SYNTHETIC_CLIENT_SECRET, connectedAccount: "acct_1Synthetic" },
    });
    expect(Object.keys(payload.data).sort()).toEqual(["clientSecret", "connectedAccount"]);
  });

  it("setup usa x-real-ip si no hay x-forwarded-for, y domiciliación como método", async () => {
    vi.mocked(startFamilyPaymentSetup).mockResolvedValue({
      clientSecret: "secret",
      connectedAccount: "acct_1Synthetic",
      setupIntentId: "seti_1SyntheticAbc",
    });

    await FAMILY_POST(
      post(familyUrl, { ...setupBody, kind: "sepa_debit" }, { headers: { "x-real-ip": "2001:db8:1:2::7" } })
    );

    expect(startFamilyPaymentSetup).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sepa_debit", clientIp: "2001:db8:1:2::7", userAgent: null })
    );
  });

  it("setup sin cabeceras de red ni agente pasa null", async () => {
    vi.mocked(startFamilyPaymentSetup).mockResolvedValue({
      clientSecret: "secret",
      connectedAccount: "acct_1Synthetic",
      setupIntentId: "seti_1SyntheticAbc",
    });

    await FAMILY_POST(post(familyUrl, setupBody));

    expect(startFamilyPaymentSetup).toHaveBeenCalledWith(
      expect.objectContaining({ clientIp: null, userAgent: null })
    );
  });

  it("complete llama al servicio con la referencia y devuelve el resultado", async () => {
    vi.mocked(completeFamilyPaymentSetup).mockResolvedValue({ outcome: "active", method: "card" });

    const response = await FAMILY_POST(post(familyUrl, completeBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(completeFamilyPaymentSetup).toHaveBeenCalledWith({
      userId,
      organizationId,
      familyId,
      setupIntentId: "seti_1SyntheticAbc",
    });
    expect(await response.json()).toEqual({ ok: true, data: { outcome: "active", method: "card" } });
  });

  it("complete pendiente devuelve pending", async () => {
    vi.mocked(completeFamilyPaymentSetup).mockResolvedValue({ outcome: "pending" });

    const response = await FAMILY_POST(post(familyUrl, completeBody));

    expect(await response.json()).toEqual({ ok: true, data: { outcome: "pending" } });
  });

  it("revoke llama al servicio con la sesión, la academia y la familia", async () => {
    vi.mocked(revokeFamilyPaymentMethod).mockResolvedValue({ outcome: "revoked" });

    const response = await FAMILY_POST(post(familyUrl, revokeBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(revokeFamilyPaymentMethod).toHaveBeenCalledWith({ userId, organizationId, familyId });
    expect(await response.json()).toEqual({ ok: true, data: { outcome: "revoked" } });
  });

  it.each([
    ["consentimiento", new OperationalError("FAMILY_PAYMENT_CONSENT_REQUIRED", "Lee y acepta el texto del pago automático para continuar.", 400), 400],
    ["no pagadora", new OperationalError("NOT_FOUND", "No encontramos este pago automático.", 404), 404],
    ["método no ofrecido", new OperationalError("FAMILY_PAYMENT_METHOD_NOT_OFFERED", "Tu academia no acepta ahora mismo este método de pago.", 409), 409],
    ["preparación fallida", new OperationalError("FAMILY_PAYMENT_SETUP_FAILED", "No se pudo guardar el método de pago. Vuelve a intentarlo.", 409), 409],
    ["no disponible", new OperationalError("FEATURE_NOT_AVAILABLE", "El pago automático no está disponible ahora mismo.", 503, { reason: "live_not_released" }), 503],
    ["reintento", new OperationalError("CONCURRENCY_RETRY", "Vuelve a intentarlo.", 409), 409],
  ])("un error operativo (%s) conserva código, mensaje y estado", async (_label, error, status) => {
    vi.mocked(startFamilyPaymentSetup).mockRejectedValue(error);

    const response = await FAMILY_POST(post(familyUrl, setupBody));

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload.code).toBe(error.code);
    expect(payload.message).toBe(error.message);
  });

  it("un error inesperado al guardar responde 502 sin detalles y solo deja ids en el log", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.mocked(completeFamilyPaymentSetup).mockRejectedValue(new Error("detalle interno del proveedor"));

    const response = await FAMILY_POST(post(familyUrl, completeBody));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("detalle interno");
    expect(text).not.toContain("seti_");
    expect(JSON.parse(text).code).toBe("FAMILY_PAYMENT_SETUP_FAILED");
    expect(warn).toHaveBeenCalledWith(expect.any(String), {
      action: "complete",
      organizationId,
      familyId,
      errorName: "Error",
    });
  });

  it("un error inesperado al revocar responde 503 con su código propio y sin detalles", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.mocked(revokeFamilyPaymentMethod).mockRejectedValue(new Error("detalle interno"));

    const response = await FAMILY_POST(post(familyUrl, revokeBody));

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("detalle interno");
    const payload = JSON.parse(text);
    expect(payload.code).toBe("FAMILY_PAYMENT_REVOKE_FAILED");
    expect(payload.message).toBe("No se pudo dejar de pagar automáticamente. Vuelve a intentarlo en un momento.");
  });
});

describe("POST /api/v1/owner/payments/family-methods", () => {
  const ownerBody = { organizationId, authorizationId };

  it("ROUTE_LIMITS fija 20/min para la ruta", () => {
    expect(getLimitForRoute("/api/v1/owner/payments/family-methods")).toEqual({ limit: 20, window: 60 });
  });

  it("sin sesión responde 401 sin llamar al servicio", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    noServiceCalled();
  });

  it.each([
    ["con un origin ajeno", "https://evil.example"],
    ["sin cabecera origin", null],
  ])("%s responde 403 sin llamar al servicio", async (_label, requestOrigin) => {
    const response = await OWNER_POST(post(ownerUrl, ownerBody, { origin: requestOrigin }));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it("con la bandera de esta fase apagada revoca igual (los cerrojos los pone el servicio)", async () => {
    delete process.env[PHASE_FLAG];
    vi.mocked(revokeFamilyPaymentMethodByOwner).mockResolvedValue({ outcome: "revoked" });

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ outcome: "revoked" });
    expect(revokeFamilyPaymentMethodByOwner).toHaveBeenCalledWith({ userId, organizationId, authorizationId });
  });

  it.each([
    ["con un campo extra", { ...ownerBody, familyId }],
    ["sin authorizationId", { organizationId }],
    ["con un authorizationId que no es uuid", { organizationId, authorizationId: "no-es-un-uuid" }],
    ["con un organizationId que no es uuid", { organizationId: "x", authorizationId }],
  ])("%s responde 400 sin llamar al servicio", async (_label, body) => {
    const response = await OWNER_POST(post(ownerUrl, body));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it("revoca con la sesión como actor tras el límite por academia verificada", async () => {
    vi.mocked(revokeFamilyPaymentMethodByOwner).mockResolvedValue({ outcome: "revoked" });

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ outcome: "revoked" });
    expect(resolveOwnerScope).toHaveBeenCalledWith({ userId, organizationId });
    expect(rateLimit).toHaveBeenCalledWith({
      identifier: `/api/v1/owner/payments/family-methods:tenant:${organizationId}:ip:unknown`,
      limit: 20,
      window: 60,
    });
    expect(revokeFamilyPaymentMethodByOwner).toHaveBeenCalledWith({ userId, organizationId, authorizationId });
    expect(vi.mocked(resolveOwnerScope).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rateLimit).mock.invocationCallOrder[0]
    );
  });

  it("sin autorización activa devuelve none", async () => {
    vi.mocked(revokeFamilyPaymentMethodByOwner).mockResolvedValue({ outcome: "none" });

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(await response.json()).toEqual({ outcome: "none" });
  });

  it("con el límite superado responde 429 sin llamar al servicio", async () => {
    limitExceeded();

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).not.toBeNull();
    noServiceCalled();
  });

  it("una academia ajena responde 403 sin consumir el límite", async () => {
    vi.mocked(resolveOwnerScope).mockRejectedValue(new OperationalError("FORBIDDEN", "Sin acceso.", 403));

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(403);
    expect(rateLimit).not.toHaveBeenCalled();
    noServiceCalled();
  });

  it.each([
    ["manager o admin con sedes", new OperationalError("FORBIDDEN", "Solo la propiedad o la administración de todas las sedes puede gestionar los pagos automáticos.", 403), 403],
    ["función no disponible", new OperationalError("FEATURE_NOT_AVAILABLE", "El pago automático no está disponible ahora mismo.", 503, { reason: "storage_missing" }), 503],
  ])("un error operativo del servicio (%s) se traduce a problem+json", async (_label, error, status) => {
    vi.mocked(revokeFamilyPaymentMethodByOwner).mockRejectedValue(error);

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect((await response.json()).detail).toBe(error.message);
  });

  it("un error inesperado responde 503 sin detalles y solo deja ids en el log", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.mocked(revokeFamilyPaymentMethodByOwner).mockRejectedValue(new Error("detalle interno"));

    const response = await OWNER_POST(post(ownerUrl, ownerBody));

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const text = await response.text();
    expect(text).not.toContain("detalle interno");
    expect(JSON.parse(text).type).toBe("https://zaltyko.com/problems/family-payment-revoke-failed");
    expect(warn).toHaveBeenCalledWith(expect.any(String), {
      organizationId,
      authorizationId,
      errorName: "Error",
    });
  });
});
