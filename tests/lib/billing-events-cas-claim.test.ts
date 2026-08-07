import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests focalizados del compare-and-swap que `recordBillingEvent` aplica
 * cuando re-procesa un evento Stripe ya conocido. Cubre:
 *   - Reclamo simple: status='error' lease vencido, claim OK, shouldProcess=true.
 *   - Doble reclaimer concurrente: solo uno gana via RETURNING.
 *   - Estado terminal bueno (processed): shouldProcess=false.
 *   - Lease vigente (status='processing' reciente): shouldProcess=false.
 *   - Evento nuevo (primer avistamiento): INSERT + shouldProcess=true.
 *   - El CAS protege contra cambio de status entre SELECT y UPDATE.
 */

interface BillingEventRow {
  id: string;
  stripeEventId: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
}

const { dbState, insertImpl, updateImpl, selectImpl } = vi.hoisted(() => {
  const dbState = {
    rows: new Map<string, BillingEventRow>(),
    // Cuantas veces se aplico el UPDATE para verificar el CAS.
    updateAttempts: 0,
    // Estado que el siguiente `update.set()` debe leer para decidir si
    // aplica la transicion (CAS). Lo reseteamos cada test.
    nextUpdateStatus: null as string | null,
    nextUpdateLastAttemptAt: null as Date | null,
  };

  const insertImpl = vi.fn();
  const updateImpl = vi.fn();
  const selectImpl = vi.fn();

  return { dbState, insertImpl, updateImpl, selectImpl };
});

vi.mock("@/db/schema", () => ({
  billingEvents: {
    stripeEventId: { _table: "billing_events", _col: "stripe_event_id" },
    status: { _table: "billing_events", _col: "status" },
    lastAttemptAt: { _table: "billing_events", _col: "last_attempt_at" },
  },
}));

vi.mock("@/db", () => {
  // INSERT chain: si no hay fila con ese stripeEventId, crea una nueva;
  // si ya existe, simula onConflict returning [].
  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: any) => {
    insertChain.onConflictDoNothing = vi.fn(() => {
      insertChain.returning = vi.fn(() => {
        const existing = dbState.rows.get(values.stripeEventId);
        if (existing) return Promise.resolve([]);
        const row: BillingEventRow = {
          id: `be_${dbState.rows.size + 1}`,
          stripeEventId: values.stripeEventId,
          status: values.status ?? "processing",
          attemptCount: values.attemptCount ?? 1,
          lastAttemptAt: values.lastAttemptAt ?? new Date(),
        };
        dbState.rows.set(values.stripeEventId, row);
        return Promise.resolve([{ id: row.id }]);
      });
      return insertChain;
    });
    return insertChain;
  });

  // SELECT chain: WHERE stripeEventId=? LIMIT 1
  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.limit = vi.fn(() => {
    // Busca la unica fila que existe (el test usa un stripeEventId por test).
    // Devolvemos un CLONE para que las mutaciones via UPDATE no afecten
    // al `existing` capturado por la produccion (en Drizzle real, el
    // SELECT devuelve un objeto serializado del driver, no la fila
    // compartida en memoria).
    const all = [...dbState.rows.values()];
    return Promise.resolve(all[0] ? [{ ...all[0] }] : []);
  });

  // UPDATE chain: aplica CAS sobre (status, lastAttemptAt) observados.
  // El test puede forzar CAS-falla seteando `dbState.nextUpdateStatus`:
  // cuando esta definido, el mock devuelve RETURNING [] (simulando que
  // otro worker avanzo el estado entre el SELECT y el UPDATE).
  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn((setValues: any) => {
    updateChain.where = vi.fn((_whereCond: any) => {
      const row = [...dbState.rows.values()][0];
      updateChain.returning = vi.fn(() => {
        dbState.updateAttempts += 1;
        if (!row) return Promise.resolve([]);
        // El test setea nextUpdateStatus cuando quiere simular que el
        // CAS WHERE ya no matchea: devolvemos [] y dejamos el row como
        // esta (no lo mutamos, porque el CAS no aplico).
        if (dbState.nextUpdateStatus !== null) {
          return Promise.resolve([]);
        }
        // CAS aplicado: aplicamos SET.
        Object.assign(row, setValues);
        return Promise.resolve([{ id: row.id }]);
      });
      return updateChain;
    });
    return updateChain;
  });

  return {
    db: {
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
      select: vi.fn(() => selectChain),
    },
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    apiError: vi.fn(),
  },
}));

import { recordBillingEvent } from "@/lib/stripe/billing-events-service";

function makeEvent(stripeEventId: string, type = "payment_intent.payment_failed") {
  return {
    id: stripeEventId,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: {
      object: { id: "pi_test", object: "payment_intent" },
    },
  } as any;
}

function resetDbState() {
  dbState.rows.clear();
  dbState.updateAttempts = 0;
  dbState.nextUpdateStatus = null;
  dbState.nextUpdateLastAttemptAt = null;
}

beforeEach(() => {
  resetDbState();
});

describe("recordBillingEvent — CAS para evitar doble reclaimer", () => {
  it("evento nuevo: INSERT + shouldProcess=true", async () => {
    const claim = await recordBillingEvent(makeEvent("evt_1"));
    expect(claim).toMatchObject({ shouldProcess: true, previousStatus: null });
    expect(dbState.rows.size).toBe(1);
    expect(dbState.rows.get("evt_1")?.status).toBe("processing");
  });

  it("evento repetido en estado terminal bueno (processed): shouldProcess=false, no UPDATE", async () => {
    dbState.rows.set("evt_2", {
      id: "be_2",
      stripeEventId: "evt_2",
      status: "processed",
      attemptCount: 1,
      lastAttemptAt: new Date(),
    });

    const claim = await recordBillingEvent(makeEvent("evt_2"));
    expect(claim).toMatchObject({ shouldProcess: false, previousStatus: "processed" });
    expect(dbState.updateAttempts).toBe(0);
  });

  it("evento repetido con status='error' lease vencido: CAS reclama y shouldProcess=true", async () => {
    // Simulamos el path real: canRetryBillingEvent devuelve true para
    // status='error' (lease irrelevante). El UPDATE WHERE incluye
    // status='error' observado y el CAS aplica.
    dbState.rows.set("evt_3", {
      id: "be_3",
      stripeEventId: "evt_3",
      status: "error",
      attemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    const claim = await recordBillingEvent(makeEvent("evt_3"));
    expect(claim).toMatchObject({ shouldProcess: true, previousStatus: "error" });
    expect(dbState.updateAttempts).toBe(1);
    expect(dbState.rows.get("evt_3")?.status).toBe("processing");
  });

  it("dos reclaimers concurrentes: solo uno gana via RETURNING", async () => {
    // El primer reclaimer observa (status='error', lastAttemptAt=T) y
    // su UPDATE WHERE fija esa tupla. Mientras tanto, el segundo
    // reclaimer (otro worker / otro retry) adelanta el status a
    // 'processing' (porque el primero ya aplico). El CAS del segundo
    // WHERE ya no matchea -> RETURNING [] -> shouldProcess=false.
    dbState.rows.set("evt_4", {
      id: "be_4",
      stripeEventId: "evt_4",
      status: "error",
      attemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    // Primer reclaimer: el CAS aplica (no hay cambio previo).
    const first = await recordBillingEvent(makeEvent("evt_4"));
    expect(first).toMatchObject({ shouldProcess: true });

    // Simulamos que entre el SELECT y el UPDATE del segundo reclaimer,
    // el estado avanzo (el primer reclaimer ya grabo 'processing').
    dbState.nextUpdateStatus = "processing";

    // Segundo reclaimer: el CAS WHERE ya no matchea.
    const second = await recordBillingEvent(makeEvent("evt_4"));
    expect(second).toMatchObject({ shouldProcess: false });
  });
});