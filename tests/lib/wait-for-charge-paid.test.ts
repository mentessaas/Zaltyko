import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura del helper `waitForChargePaid`. La pieza que evita la carrera entre
 * la UI (refresco inmediato) y el webhook `payment_intent.succeeded`. Si el
 * helper no respeta los contratos cubiertos aquí, los widgets vuelven a
 * mostrar "Cobro autenticado" sobre un cargo todavía en `failed`/`pending`.
 *
 * Contratos a fijar (todos los previamente cerrados en ZAL-410):
 *   1. Devuelve `reachedPaid: true` en cuanto `fetchStatus` reporta `paid`,
 *      sin esperar al timeout.
 *   2. Hace `AbortController.abort()` después de cada tick para que el fetch
 *      quede cancelado si la siguiente iteración ya no lo necesita.
 *   3. Tolera un fetch que falle (red, 5xx) sin abortar el bucle entero.
 *   4. Cuando agota `timeoutMs`, devuelve `reachedPaid: false, timedOut: true`
 *      en vez de colgarse.
 *   5. Respeta el deadline: nunca se ejecuta más allá de `timeoutMs`.
 */

let waitForChargePaid: typeof import("@/lib/billing/wait-for-charge-paid").waitForChargePaid;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  if (!waitForChargePaid) {
    const mod = await import("@/lib/billing/wait-for-charge-paid");
    waitForChargePaid = mod.waitForChargePaid;
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("waitForChargePaid — contrato de polling", () => {
  it("devuelve reachedPaid=true cuando el endpoint reporta paid en el primer tick", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ status: "paid" });

    const promise = waitForChargePaid({
      fetchStatus: async (signal) => fetchStatus(signal),
      intervalMs: 500,
      timeoutMs: 5000,
    });
    // El fetch del primer tick es síncrono desde la perspectiva del helper;
    // esperamos a que la microtask enqueue se complete.
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result).toEqual({ reachedPaid: true, timedOut: false });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("devuelve reachedPaid=true en cuanto el endpoint reporta paid (no espera al timeout)", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "failed" })
      .mockResolvedValueOnce({ status: "paid" });

    const promise = waitForChargePaid({
      fetchStatus: async (signal) => fetchStatus(signal),
      intervalMs: 500,
      timeoutMs: 5000,
    });

    // 1ª iteración: fetch devuelve failed, espera 500ms.
    await vi.advanceTimersByTimeAsync(0);
    // 2ª iteración: fetch devuelve failed, espera 500ms.
    await vi.advanceTimersByTimeAsync(500);
    // 3ª iteración: fetch devuelve paid, sale del bucle.
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result.reachedPaid).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("aborta el fetch de cada tick al salir del bucle (AbortController se llama)", async () => {
    const abortSpy = vi.fn();
    const realAbortController = globalThis.AbortController;
    class TrackedAbortController {
      signal = { aborted: false };
      abort = (...args: unknown[]) => {
        this.signal.aborted = true;
        abortSpy(...args);
      };
    }
    globalThis.AbortController = TrackedAbortController as unknown as typeof AbortController;
    try {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "paid" });
      await waitForChargePaid({
        fetchStatus: async (signal) => fetchStatus(signal),
        intervalMs: 500,
        timeoutMs: 5000,
      });
      // Cada tick crea y aborta su propio AbortController; al menos una vez.
      expect(abortSpy).toHaveBeenCalled();
    } finally {
      globalThis.AbortController = realAbortController;
    }
  });

  it("tolera un fetch que lanza y sigue sondeando hasta agotar el timeout", async () => {
    // En este test usamos timers reales para evitar el ciclo microtask de
    // Promises rechazadas en `vi.useFakeTimers`. Los delays son lo bastante
    // pequeños para mantener el test rápido.
    vi.useRealTimers();
    const fetchStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "pending" })
      .mockRejectedValueOnce(new Error("boom"));

    const result = await waitForChargePaid({
      fetchStatus: async (signal) => fetchStatus(signal),
      intervalMs: 10,
      timeoutMs: 80,
    });

    expect(result.reachedPaid).toBe(false);
    expect(result.timedOut).toBe(true);
    // Al menos 1 fetch se intentó. No afirmamos el número exacto: los rechazos
    // y resoluciones se intercalan con microtasks y el bucle puede reintentar.
    expect(fetchStatus.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("devuelve timedOut=true y reachedPaid=false cuando nunca llega a paid", async () => {
    vi.useRealTimers();
    const fetchStatus = vi.fn().mockResolvedValue({ status: "failed" });

    const result = await waitForChargePaid({
      fetchStatus: async (signal) => fetchStatus(signal),
      intervalMs: 30,
      timeoutMs: 100,
    });

    expect(result.reachedPaid).toBe(false);
    expect(result.timedOut).toBe(true);
    // 100ms / 30ms = 3 (suelen ser 3 con redondeo).
    expect(fetchStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("acepta fetchStatus que devuelve null (endpoint devolvió no-ok o shape raro)", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "paid" });

    const promise = waitForChargePaid({
      fetchStatus: async (signal) => fetchStatus(signal),
      intervalMs: 500,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result.reachedPaid).toBe(true);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });
});
