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
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/cron-lease", () => ({ runCronWithLease: mocks.lease }));
vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: () => env.flag,
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

import { GET, POST } from "@/app/api/cron/collect-family-fees/route";
import type { RunState } from "@/modules/family-collection/application/family-collection-steps";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const CRON_URL = "https://zaltyko.com/api/cron/collect-family-fees";
// Valor sintético montado en tiempo de ejecución.
const SECRET = ["cron", "prueba", "cobro"].join("-");
const withSecret = (secret = SECRET) =>
  new Request(CRON_URL, { method: "POST", headers: { authorization: `Bearer ${secret}` } });

const ZERO = {
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
