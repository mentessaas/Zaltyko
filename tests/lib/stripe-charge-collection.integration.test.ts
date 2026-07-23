import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test de integración del motor de cobro (charge-collection-service) y de la
 * reconciliación por webhook (charge-reconcile-service), con el SDK de Stripe
 * y la capa de datos mockeados.
 *
 * Nota sobre el mock de DB: el repo NO tiene una estrategia de test-DB real
 * (Supabase/pg-mem/testcontainers). Los intentos previos de mockear `@/db` de
 * forma genérica quedaron excluidos de `vitest.config.ts` con la nota
 * "los mocks vi.hoisted están incompletos: solo 1/3 tests pasa". Este archivo
 * evita ese patrón: en vez de mockear `@/db` de forma genérica, mockea a nivel
 * de los servicios de frontera (connect-service, family-customers-service) y
 * usa un mock de `db`/`tx` hecho a mano, acotado exactamente a las llamadas
 * que hacen `charge-collection-service.ts` y `charge-reconcile-service.ts`
 * sobre `charges`/`payment_attempts` (select/update/insert/execute), con
 * aserciones sobre los valores capturados en `.set()`/`.values()`.
 */

const {
  paymentIntentsCreate,
  refundsCreate,
  getConnectAccountMock,
  isConnectReadyMock,
  resolvePayerCustomerForAthleteMock,
  dbLike,
  state,
} = vi.hoisted(() => {
  const state = {
    chargeRow: null as any,
    updateSets: [] as any[],
    insertedAttempts: [] as any[],
    callOrder: [] as string[],
  };

  const selectChain: any = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(() => {
      state.callOrder.push("select");
      return Promise.resolve(state.chargeRow ? [state.chargeRow] : []);
    }),
  };

  const updateChain: any = {
    set: vi.fn((values: any) => {
      state.updateSets.push(values);
      return updateChain;
    }),
    where: vi.fn(() => Promise.resolve(undefined)),
  };

  const insertChain: any = {
    values: vi.fn((values: any) => {
      state.insertedAttempts.push(values);
      return Promise.resolve(undefined);
    }),
  };

  const dbLike: any = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
    execute: vi.fn(() => {
      state.callOrder.push("execute");
      return Promise.resolve(undefined);
    }),
  };

  return {
    paymentIntentsCreate: vi.fn(),
    refundsCreate: vi.fn(),
    getConnectAccountMock: vi.fn(),
    isConnectReadyMock: vi.fn(),
    resolvePayerCustomerForAthleteMock: vi.fn(),
    dbLike,
    state,
  };
});

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    paymentIntents: { create: paymentIntentsCreate },
    refunds: { create: refundsCreate },
  }),
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  getConnectAccount: (...args: any[]) => getConnectAccountMock(...args),
  isConnectReady: (...args: any[]) => isConnectReadyMock(...args),
}));

vi.mock("@/lib/stripe/family-customers-service", () => ({
  resolvePayerCustomerForAthlete: (...args: any[]) => resolvePayerCustomerForAthleteMock(...args),
}));

vi.mock("@/lib/db-transactions", () => ({
  withTransaction: async (cb: any) => cb(dbLike),
}));

vi.mock("@/db", () => ({ db: dbLike }));

vi.mock("@/db/schema", () => ({
  charges: { id: "charges.id" },
  paymentAttempts: { id: "payment_attempts.id" },
}));

import { collectCharge } from "@/lib/stripe/charge-collection-service";
import {
  reconcileChargeRefunded,
  reconcilePaymentIntentCanceled,
  reconcilePaymentIntentFailed,
  reconcilePaymentIntentSucceeded,
} from "@/lib/stripe/charge-reconcile-service";

const baseCharge = {
  id: "charge_1",
  tenantId: "tenant_1",
  academyId: "academy_1",
  athleteId: "athlete_1",
  amountCents: 5000,
  currency: "EUR",
  status: "pending",
  attemptCount: 0,
};

const readyAccount = {
  id: "stripe_account_row_1",
  stripeAccountId: "acct_123",
  chargesEnabled: true,
  onboardingStatus: "enabled",
};

const payerWithCard = {
  id: "family_customer_1",
  stripeCustomerId: "cus_1",
  defaultPaymentMethodId: "pm_1",
};

function resetState() {
  state.chargeRow = null;
  state.updateSets = [];
  state.insertedAttempts = [];
  state.callOrder = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  getConnectAccountMock.mockResolvedValue(readyAccount);
  isConnectReadyMock.mockReturnValue(true);
  resolvePayerCustomerForAthleteMock.mockResolvedValue(payerWithCard);
});

describe("collectCharge", () => {
  it("cobra con éxito y marca el cargo como pagado", async () => {
    state.chargeRow = { ...baseCharge };
    paymentIntentsCreate.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      latest_charge: "ch_1",
    });

    const result = await collectCharge("charge_1");

    expect(result).toEqual({ ok: true, status: "paid", paymentIntentId: "pi_1" });
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const [payload, opts] = paymentIntentsCreate.mock.calls[0];
    expect(payload).toMatchObject({ amount: 5000, currency: "eur", off_session: true, confirm: true });
    expect(opts).toMatchObject({ stripeAccount: "acct_123", idempotencyKey: "charge_collect_charge_1_1" });

    const lastUpdate = state.updateSets.at(-1);
    expect(lastUpdate).toMatchObject({
      status: "paid",
      paymentMethod: "card",
      stripePaymentIntentId: "pi_1",
      stripeChargeId: "ch_1",
      attemptCount: 1,
    });
    expect(lastUpdate.paidAt).toBeInstanceOf(Date);

    expect(state.insertedAttempts[0]).toMatchObject({
      chargeId: "charge_1",
      status: "succeeded",
      amountCents: 5000,
    });
  });

  it("marca el cargo como failed y devuelve requires_action si el banco pide SCA", async () => {
    state.chargeRow = { ...baseCharge };
    paymentIntentsCreate.mockRejectedValue({
      code: "authentication_required",
      message: "This payment requires authentication.",
      payment_intent: { id: "pi_2" },
    });

    const result = await collectCharge("charge_1");

    expect(result).toEqual({ ok: false, status: "requires_action", paymentIntentId: "pi_2" });
    const lastUpdate = state.updateSets.at(-1);
    expect(lastUpdate).toMatchObject({ status: "failed", attemptCount: 1, stripePaymentIntentId: "pi_2" });
    expect(state.insertedAttempts[0]).toMatchObject({ status: "requires_action" });
  });

  it("marca el cargo como failed cuando la tarjeta es rechazada", async () => {
    state.chargeRow = { ...baseCharge };
    paymentIntentsCreate.mockRejectedValue({
      code: "card_declined",
      message: "Your card was declined.",
      payment_intent: { id: "pi_3" },
    });

    const result = await collectCharge("charge_1");

    expect(result).toEqual({
      ok: false,
      status: "failed",
      reason: "card_declined",
      paymentIntentId: "pi_3",
    });
    expect(state.updateSets.at(-1)).toMatchObject({ status: "failed" });
    expect(state.insertedAttempts[0]).toMatchObject({ status: "failed", errorCode: "card_declined" });
  });

  it("no cobra si la familia no tiene tarjeta guardada", async () => {
    state.chargeRow = { ...baseCharge };
    resolvePayerCustomerForAthleteMock.mockResolvedValue({ ...payerWithCard, defaultPaymentMethodId: null });

    const result = await collectCharge("charge_1");

    expect(result).toEqual({ ok: false, status: "skipped", reason: "NO_SAVED_CARD" });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(state.updateSets).toHaveLength(0);
    expect(state.insertedAttempts).toHaveLength(0);
  });

  it("no cobra dos veces un cargo ya pagado (protección contra doble cobro)", async () => {
    state.chargeRow = { ...baseCharge, status: "paid" };

    const result = await collectCharge("charge_1");

    expect(result).toEqual({ ok: false, status: "skipped", reason: "NOT_COLLECTIBLE:paid" });
    expect(getConnectAccountMock).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(state.updateSets).toHaveLength(0);
  });

  it("pide el advisory lock antes de leer el cargo en cada intento concurrente", async () => {
    // Limitación conocida: este mock no serializa de verdad (no hay Postgres
    // real). Solo verificamos que el código PIDE el lock antes de leer el
    // cargo en cada invocación — la exclusión mutua real depende de
    // pg_advisory_xact_lock en Supabase y queda fuera de alcance aquí.
    state.chargeRow = { ...baseCharge };
    paymentIntentsCreate.mockResolvedValue({ id: "pi_4", status: "succeeded", latest_charge: "ch_4" });

    await Promise.all([collectCharge("charge_1"), collectCharge("charge_1")]);

    expect(dbLike.execute).toHaveBeenCalledTimes(2);
    // execute (lock) siempre debe preceder al select correspondiente.
    const executeIdx = state.callOrder.indexOf("execute");
    const firstSelectAfter = state.callOrder.indexOf("select", executeIdx);
    expect(executeIdx).toBeGreaterThanOrEqual(0);
    expect(firstSelectAfter).toBeGreaterThan(executeIdx);
  });
});

describe("charge-reconcile-service", () => {
  it("payment_intent.succeeded marca el cargo pendiente como pagado", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_2", status: "pending", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentSucceeded({
      id: "pi_7",
      metadata: { chargeId: "charge_2", academyId: "academy_1", tenantId: "tenant_1" },
      amount_received: 5000,
      currency: "eur",
      latest_charge: "ch_7",
    } as any, "acct_123");

    expect(state.updateSets.at(-1)).toMatchObject({
      status: "paid",
      paymentMethod: "card",
      stripePaymentIntentId: "pi_7",
      stripeChargeId: "ch_7",
    });
  });

  it("payment_intent.succeeded fuera de orden no pisa un cargo ya reembolsado", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_3", status: "refunded", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentSucceeded({
      id: "pi_8",
      metadata: { chargeId: "charge_3", academyId: "academy_1", tenantId: "tenant_1" },
      amount_received: 5000,
      currency: "eur",
    } as any, "acct_123");

    expect(state.updateSets).toHaveLength(0);
  });

  it("payment_intent.payment_failed no pisa un cargo ya pagado", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_4", status: "paid", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentFailed({
      id: "pi_9",
      metadata: { chargeId: "charge_4", academyId: "academy_1", tenantId: "tenant_1" },
    } as any, "acct_123");

    expect(state.updateSets).toHaveLength(0);
  });

  it("payment_intent.canceled devuelve el cargo a pendiente si seguía debiéndose", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_6", status: "failed", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentCanceled({
      id: "pi_11",
      metadata: { chargeId: "charge_6", academyId: "academy_1", tenantId: "tenant_1" },
    } as any, "acct_123");

    expect(state.updateSets.at(-1)).toMatchObject({ status: "pending" });
  });

  it("charge.refunded marca el cargo como reembolsado", async () => {
    state.chargeRow = { id: "charge_5", status: "paid", stripeAccountId: "acct_123" };

    await reconcileChargeRefunded({ id: "ch_10" } as any, "acct_123");

    expect(state.updateSets.at(-1)).toMatchObject({ status: "refunded" });
  });

  it("charge.refunded es idempotente si el cargo ya estaba reembolsado", async () => {
    state.chargeRow = { id: "charge_5", status: "refunded", stripeAccountId: "acct_123" };

    await reconcileChargeRefunded({ id: "ch_10" } as any, "acct_123");

    expect(state.updateSets).toHaveLength(0);
  });

  it("rechaza un evento firmado que pertenece a otra cuenta Connect", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_7", stripeAccountId: "acct_expected" };

    await expect(
      reconcilePaymentIntentFailed(
        {
          id: "pi_cross_account",
          metadata: { chargeId: "charge_7", academyId: "academy_1", tenantId: "tenant_1" },
        } as any,
        "acct_attacker"
      )
    ).rejects.toThrow("CONNECT_ACCOUNT_MISMATCH");
    expect(state.updateSets).toHaveLength(0);
  });

  it("rechaza metadata incompleta aunque el PaymentIntent exista", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_8", stripeAccountId: "acct_123" };

    await expect(
      reconcilePaymentIntentFailed(
        { id: "pi_missing_metadata", metadata: { chargeId: "charge_8" } } as any,
        "acct_123"
      )
    ).rejects.toThrow("CONNECT_METADATA_MISMATCH");
    expect(state.updateSets).toHaveLength(0);
  });
});
