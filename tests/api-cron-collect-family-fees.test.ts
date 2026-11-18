import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ruta cron del cobro automático de cuotas (Fase 3). Usa el servicio real
 * (`runFamilyCollection`) con sus dos fases, el almacén y Stripe simulados,
 * para comprobar de punta a punta lo que decide la ruta: secreto, lease,
 * cerrojos de entorno, tablas ausentes, bandera apagada (solo la puesta al
 * día, nunca un cobro nuevo) y una respuesta con solo contadores.
 * Solo datos sintéticos; nunca llama a Stripe ni a la base.
 */

const env = vi.hoisted(() => ({
  flag: false,
  environment: "test" as "test" | "live" | null,
  production: false,
}));

const mocks = vi.hoisted(() => ({
  lease: vi.fn(),
  error: vi.fn(),
  createStore: vi.fn(),
  isStorageAvailable: vi.fn(),
  createGateway: vi.fn(),
  reconcile: vi.fn(),
  collect: vi.fn(),
  deliverNotices: vi.fn(),
  deliverReceipts: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/cron-lease", () => ({ runCronWithLease: mocks.lease }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
  isFamilyAutomaticSepaCollectionFlagEnabled: () => false,
  // Fase 4 (Tarea 4): createRunState la lee también en la pasada diaria
  // (authenticationRecovery); apagada, no consulta la forma del almacenamiento.
  isFamilyCollectionEventsFlagEnabled: () => false,
  resolveConnectEnvironment: () => env.environment,
  isProductionDatabase: () => env.production,
}));
vi.mock("@/modules/family-collection/infrastructure/family-collection-store", () => ({
  createFamilyCollectionStore: mocks.createStore,
}));
vi.mock("@/modules/family-collection/infrastructure/stripe-collection-gateway", () => ({
  createStripeCollectionGateway: mocks.createGateway,
}));
vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  refreshConnectAccountForCollection: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/family-collection-reconcile", () => ({
  reconcilePendingAttempts: mocks.reconcile,
}));
vi.mock("@/modules/family-collection/application/family-collection-collect", () => ({
  collectDueInvoices: mocks.collect,
}));
// D3: el envío de los avisos de primer fallo a las familias (nunca un correo de verdad).
vi.mock("@/modules/family-collection/application/family-failure-notice-delivery", () => ({
  deliverFamilyFailureNotices: mocks.deliverNotices,
}));

// Tarea 9: el envío de los justificantes de pago (nunca un correo de verdad).
vi.mock("@/modules/family-collection/application/family-receipt-delivery", () => ({
  deliverFamilyReceipts: mocks.deliverReceipts,
  FAMILY_RECEIPT_DEADLINE_MS: 20_000,
}));

import { GET, POST } from "@/app/api/cron/collect-family-fees/route";
import type { RunState } from "@/modules/family-collection/application/family-collection-steps";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const CRON_URL = "https://zaltyko.com/api/cron/collect-family-fees";
// Valor sintético montado en tiempo de ejecución.
const SECRET = ["cron", "prueba", "cobro"].join("-");
const withSecret = (secret = SECRET) =>
  new Request(CRON_URL, { method: "POST", headers: { authorization: `Bearer ${secret}` } });

const NO_NOTICES = { sent: 0, notSent: 0, pending: 0 };

const ZERO = {
  familyNotices: NO_NOTICES,
  receipts: NO_NOTICES,
  enabled: false,
  complete: true,
  reconciled: 0,
  collected: 0,
  processing: 0,
  failed: 0,
  canceled: 0,
  skipped: {},
  retried: 0,
  resumed: 0,
  needsReview: 0,
  circuitOpen: false,
};

async function body(response: Response) {
  return (await response.json()) as { ok: boolean; data?: Record<string, unknown>; code?: string };
}

describe("cron del cobro automático de cuotas", () => {
  const previous = { ...process.env };
  const gateway = { synthetic: "gateway" };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    env.flag = false;
    env.environment = "test";
    env.production = false;
    mocks.lease.mockImplementation(async (_name: string, job: () => Promise<unknown>) => ({
      acquired: true,
      value: await job(),
    }));
    mocks.isStorageAvailable.mockResolvedValue(true);
    mocks.createStore.mockReturnValue({ isStorageAvailable: mocks.isStorageAvailable });
    mocks.createGateway.mockReturnValue(gateway);
    mocks.deliverNotices.mockResolvedValue(NO_NOTICES);
    mocks.deliverReceipts.mockResolvedValue(NO_NOTICES);
    // Fase A: pone al día un intento reanudado y uno releído.
    mocks.reconcile.mockImplementation(async (state: RunState) => {
      state.result.reconciled += 2;
      state.result.resumed += 1;
      state.result.collected += 1;
    });
    // Fase B: cobra lo que vence hoy.
    mocks.collect.mockImplementation(async (state: RunState) => {
      state.result.collected += 3;
      state.result.processing += 1;
      state.result.failed += 1;
      state.result.retried += 1;
      state.result.canceled += 1;
      state.result.needsReview += 1;
      state.result.skipped.account_stale = 2;
    });
  });

  afterEach(() => {
    process.env = { ...previous };
  });

  it("acepta GET con el mismo manejador que POST", () => {
    expect(GET).toBe(POST);
  });

  it("sin el secreto o con otro responde 401 y no hace ningún trabajo", async () => {
    for (const request of [new Request(CRON_URL, { method: "POST" }), withSecret("otro")]) {
      const response = await POST(request);
      expect(response.status).toBe(401);
    }
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado responde 503 y no hace nada", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(withSecret());
    expect(response.status).toBe(503);
    expect((await body(response)).code).toBe("CRON_NOT_CONFIGURED");
    expect(mocks.lease).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
  });

  it("si otra ejecución tiene el lease, no se solapa", async () => {
    mocks.lease.mockResolvedValue({ acquired: false });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await body(response)).data).toEqual({ skipped: true, reason: "ALREADY_RUNNING" });
    expect(mocks.deliverNotices).not.toHaveBeenCalled();
    expect(mocks.deliverReceipts).not.toHaveBeenCalled();
    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("con la clave que no es de test o contra la base de producción no toca nada, ni con la bandera encendida", async () => {
    env.flag = true;
    for (const [environment, production] of [
      ["live", false],
      [null, false],
      ["test", true],
    ] as const) {
      env.environment = environment;
      env.production = production;
      const response = await POST(withSecret());
      expect(response.status).toBe(200);
      expect((await body(response)).data).toEqual(ZERO);
    }
    expect(mocks.createStore).not.toHaveBeenCalled();
    expect(mocks.createGateway).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("sin las tablas del cobro responde enabled: false y no hace nada más", async () => {
    mocks.isStorageAvailable.mockResolvedValue(false);
    for (const flag of [false, true]) {
      env.flag = flag;
      const response = await POST(withSecret());
      expect((await body(response)).data).toEqual(ZERO);
    }
    expect(mocks.createGateway).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("con la bandera apagada solo pone al día lo que quedó a medias y nunca cobra nada nuevo", async () => {
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(mocks.lease).toHaveBeenCalledWith("cron:collect-family-fees", expect.any(Function));
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    const state = mocks.reconcile.mock.calls[0]![0] as RunState;
    expect(state.flagEnabled).toBe(false);
    // D2: la domiciliación sigue apagada por defecto (nunca un cobro nuevo por domiciliación).
    expect(state.sepaEnabled).toBe(false);
    expect(state.environment).toBe("test");
    expect(state.productionDatabase).toBe(false);
    expect(state.gateway).toBe(gateway);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect((await body(response)).data).toEqual({
      ...ZERO,
      reconciled: 2,
      resumed: 1,
      collected: 1,
    });
  });

  it("con la bandera encendida pone al día y después cobra, y responde solo los contadores", async () => {
    env.flag = true;
    mocks.reconcile.mockImplementation(async (state: RunState) => {
      state.result.reconciled += 1;
      // Lo que no es un contador nunca sale en la respuesta.
      Object.assign(state.result, {
        organizationId: "20000000-0000-4000-8000-000000000001",
        lastIntent: "pi_SyntheticNoSale",
      });
      state.result.skipped["20000000-0000-4000-8000-000000000001"] = 1;
    });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.collect.mock.invocationCallOrder[0]!);
    const data = (await body(response)).data;
    expect(data).toEqual({
      enabled: true,
      complete: true,
      reconciled: 1,
      collected: 3,
      processing: 1,
      failed: 1,
      canceled: 1,
      skipped: { account_stale: 2 },
      retried: 1,
      resumed: 0,
      needsReview: 1,
      circuitOpen: false,
      familyNotices: NO_NOTICES,
      receipts: NO_NOTICES,
    });
    expect(JSON.stringify(data)).not.toMatch(/pi_|20000000-/);
  });

  it("Fase 4 (D9): con el cortacircuitos abierto responde circuitOpen: true, sin ids", async () => {
    env.flag = true;
    mocks.collect.mockImplementation(async (state: RunState) => {
      state.result.canceled += 2;
      state.result.skipped.circuit_open = 1;
      state.result.circuitOpen = true;
    });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    // La pasada empezó con el cortacircuitos cerrado (los pasos simulados no lo tocan).
    const state = mocks.reconcile.mock.calls[0]![0] as RunState;
    expect(state.breaker).toEqual({ consecutive: 0, created: 0, invalid: 0, open: false });
    const data = (await body(response)).data;
    expect(data).toEqual({
      ...ZERO,
      enabled: true,
      reconciled: 2,
      resumed: 1,
      collected: 1,
      canceled: 2,
      skipped: { circuit_open: 1 },
      circuitOpen: true,
    });
    expect(JSON.stringify(data)).not.toMatch(/pi_|20000000-/);
  });

  it("con el plazo agotado en la puesta al día no empieza a cobrar y lo indica", async () => {
    env.flag = true;
    mocks.reconcile.mockImplementation(async (state: RunState) => {
      state.result.complete = false;
    });
    const response = await POST(withSecret());
    expect(mocks.collect).not.toHaveBeenCalled();
    expect((await body(response)).data).toMatchObject({ enabled: true, complete: false, collected: 0 });
  });

  it("D3: envía los avisos de primer fallo antes de cobrar (los de otro día) y después (los de hoy); responde solo sus contadores", async () => {
    env.flag = true;
    mocks.deliverNotices
      .mockResolvedValueOnce({
        sent: 2,
        notSent: 1,
        pending: 1,
        // Lo que no es un contador nunca sale en la respuesta.
        attemptId: "20000000-0000-4000-8000-000000000009",
      })
      .mockResolvedValueOnce({ sent: 3, notSent: 0, pending: 0 });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(mocks.deliverNotices).toHaveBeenCalledTimes(2);
    // C2: los pendientes salen ANTES de la puesta al día y de la Fase B (que
    // reclama los reintentos); los de hoy, después de cobrar. Todo dentro del lease.
    const [early, late] = mocks.deliverNotices.mock.invocationCallOrder;
    expect(early).toBeLessThan(mocks.reconcile.mock.invocationCallOrder[0]!);
    expect(early).toBeLessThan(mocks.collect.mock.invocationCallOrder[0]!);
    expect(mocks.collect.mock.invocationCallOrder[0]).toBeLessThan(late!);
    // El primer envío tiene su propio plazo corto; el segundo, el de por defecto.
    expect(mocks.deliverNotices.mock.calls[0]).toEqual([{ deadlineMs: 20_000 }]);
    expect(mocks.deliverNotices.mock.calls[1]).toEqual([{}]);
    const data = (await body(response)).data;
    // Suma de los dos envíos; los pendientes, los del último.
    expect(data?.familyNotices).toEqual({ sent: 5, notSent: 1, pending: 0 });
    expect(data).toMatchObject({ enabled: true, collected: 4 });
    expect(JSON.stringify(data)).not.toMatch(/20000000-/);
  });

  it("C2: si falla el primer envío de avisos, se cobra igual y cuenta el segundo", async () => {
    env.flag = true;
    mocks.deliverNotices
      .mockRejectedValueOnce(Object.assign(new Error("base caída"), { code: "57P01" }))
      .mockResolvedValueOnce({ sent: 1, notSent: 0, pending: 0 });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    const data = (await body(response)).data;
    expect(data).toMatchObject({ enabled: true, collected: 4, familyNotices: { sent: 1, notSent: 0, pending: 0 } });
  });

  it("D3: si fallan los avisos, el cobro ya hecho se responde igual y solo se registra el nombre del error", async () => {
    env.flag = true;
    mocks.deliverNotices.mockRejectedValue(
      Object.assign(new Error("correo de la familia en el mensaje"), { code: "53300" })
    );
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    const data = (await body(response)).data;
    expect(data).toMatchObject({ enabled: true, collected: 4, familyNotices: null });
    expect(mocks.error).toHaveBeenCalledWith("Error al enviar los avisos de cobro fallido a las familias", undefined, {
      errorName: "Error",
      errorCode: "53300",
    });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("correo de la familia");
  });

  it("ruta cron: contadores de justificantes en la respuesta, sin ids", async () => {
    env.flag = true;
    mocks.deliverReceipts.mockResolvedValueOnce({
      sent: 2,
      notSent: 1,
      pending: 0,
      // Lo que no es un contador nunca sale en la respuesta.
      attemptId: "20000000-0000-4000-8000-000000000011",
      payerEmail: "familia@example.invalid",
    });
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // Una sola vez, al final: después del cobro y de los avisos de hoy, con un plazo.
    expect(mocks.deliverReceipts).toHaveBeenCalledTimes(1);
    const [receiptsCall] = mocks.deliverReceipts.mock.invocationCallOrder;
    expect(mocks.collect.mock.invocationCallOrder[0]).toBeLessThan(receiptsCall!);
    expect(mocks.deliverNotices.mock.invocationCallOrder[1]).toBeLessThan(receiptsCall!);
    const [options] = mocks.deliverReceipts.mock.calls[0] as [{ deadlineMs: number }];
    expect(Object.keys(options)).toEqual(["deadlineMs"]);
    expect(options.deadlineMs).toBeGreaterThanOrEqual(0);
    expect(options.deadlineMs).toBeLessThanOrEqual(20_000);
    const data = (await body(response)).data;
    expect(data?.receipts).toEqual({ sent: 2, notSent: 1, pending: 0 });
    expect(JSON.stringify(data)).not.toMatch(/20000000-|example\.invalid/);
  });

  it("si fallan los justificantes, el cobro se responde igual con receipts: null y solo el nombre del error", async () => {
    env.flag = true;
    mocks.deliverReceipts.mockRejectedValue(Object.assign(new Error("correo de la familia"), { code: "53300" }));
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect((await body(response)).data).toMatchObject({ enabled: true, collected: 4, receipts: null });
    expect(mocks.error).toHaveBeenCalledWith("Error al enviar los justificantes de pago a las familias", undefined, {
      errorName: "Error",
      errorCode: "53300",
    });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("correo de la familia");
  });

  it("si la función no está disponible responde enabled: false", async () => {
    mocks.lease.mockRejectedValue(new OperationalError("FEATURE_NOT_AVAILABLE", "No disponible", 503));
    const response = await POST(withSecret());
    expect(response.status).toBe(200);
    expect((await body(response)).data).toEqual({ enabled: false, reason: "UNAVAILABLE" });
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("un error inesperado responde 500 y registra solo el nombre y el código, nunca el mensaje", async () => {
    const failure = Object.assign(new Error("mensaje de la base con datos sensibles"), { code: "57014" });
    mocks.reconcile.mockRejectedValue(failure);
    const response = await POST(withSecret());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await body(response)).code).toBe("INTERNAL_ERROR");
    expect(mocks.error).toHaveBeenCalledWith("Error en el cobro automático de cuotas", undefined, {
      errorName: "Error",
      errorCode: "57014",
    });
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain("datos sensibles");
  });
});
