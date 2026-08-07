/**
 * Sondeo del estado server-side de un cargo tras un reto 3DS.
 *
 * El webhook `payment_intent.succeeded` reconcilia la fila `charges.status`
 * en DB con asincronía (típicamente <1s en test mode, pero puede tardar más
 * en picos de Stripe). Si refrescamos el UI en cuanto `confirmCardPayment`
 * retorna, mostramos "Cobro autenticado" sobre un cargo todavía en
 * "Pago fallido". Este helper acota la espera hasta que el cargo alcance
 * `paid` o hasta agotar el timeout (entonces refrescamos igualmente).
 *
 * Pensado para llamarse desde el cliente DESPUÉS de `confirmScaChallenge`
 * y ANTES del `loadCharges` / `router.refresh` que muestra el estado al
 * usuario.
 */
export interface WaitForChargePaidOptions {
  fetchStatus: (signal: AbortSignal) => Promise<{ status: string } | null>;
  // ms entre intentos (default 500)
  intervalMs?: number;
  // ms totales antes de rendirse (default 5000)
  timeoutMs?: number;
}

export async function waitForChargePaid({
  fetchStatus,
  intervalMs = 500,
  timeoutMs = 5000,
}: WaitForChargePaidOptions): Promise<{ reachedPaid: boolean; timedOut: boolean }> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const tick = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    try {
      const result = await fetchStatus(controller.signal);
      if (result?.status === "paid") {
        return { reachedPaid: true, timedOut: false };
      }
    } catch {
      // Si el endpoint cae, no abortamos: dejamos que el siguiente tick lo reintente.
    } finally {
      controller.abort();
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, tick));
  }

  return { reachedPaid: false, timedOut: Date.now() - startedAt >= timeoutMs };
}
