import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Verifica que el motor de cobro familiar falla cerrado en modo manual-only y
 * prueba la reconciliación de eventos Stripe de test con DB mockeada.
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
  sendChargePaymentFailedNotificationMock,
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
    where: vi.fn(() => updateChain),
    returning: vi.fn(() => {
      // El WHERE de reconcilePaymentIntentFailed excluye estados
      // terminales buenos (paid/refunded). Devolvemos `[]` cuando el
      // cargo observado esta en uno de esos estados para emular que el
      // UPDATE no aplico la transicion y el caller no debe notificar.
      const status = state.chargeRow?.status;
      if (status === "paid" || status === "refunded") {
        return Promise.resolve([]);
      }
      return Promise.resolve([{ id: state.chargeRow?.id ?? "row" }]);
    }),
  };

  const insertChain: any = {
    values: vi.fn((values: any) => {
      state.insertedAttempts.push(values);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        then: (resolve: (value: undefined) => void) => Promise.resolve(undefined).then(resolve),
      };
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
    sendChargePaymentFailedNotificationMock: vi.fn(),
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

vi.mock("@/lib/stripe/notification-service", () => ({
  sendChargePaymentFailedNotification: (...args: any[]) =>
    sendChargePaymentFailedNotificationMock(...args),
}));

vi.mock("@/lib/db-transactions", () => ({
  withTransaction: async (cb: any) => cb(dbLike),
}));

vi.mock("@/db", () => ({ db: dbLike }));

// Keep the schema contract complete as services evolve (receipt/ledger
// reconciliation now touches more tables than the original test did).
vi.mock("@/db/schema", async (importOriginal) => {
  return await importOriginal<typeof import("@/db/schema")>();
});

import { collectCharge, collectDueChargesForAcademy } from "@/lib/stripe/charge-collection-service";
import { FamilyAutomaticCollectionDisabledError } from "@/lib/stripe/family-automatic-collection-disabled";
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
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_reconcile";
  getConnectAccountMock.mockResolvedValue(readyAccount);
  isConnectReadyMock.mockReturnValue(true);
  resolvePayerCustomerForAthleteMock.mockResolvedValue(payerWithCard);
  sendChargePaymentFailedNotificationMock.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

describe("collectCharge", () => {
  it("rechaza el cobro familiar antes de leer o mutar datos y sin llamar a Stripe", async () => {
    await expect(collectCharge("charge_1")).rejects.toBeInstanceOf(
      FamilyAutomaticCollectionDisabledError
    );
    expect(dbLike.select).not.toHaveBeenCalled();
    expect(dbLike.execute).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(getConnectAccountMock).not.toHaveBeenCalled();
    expect(isConnectReadyMock).not.toHaveBeenCalled();
    expect(resolvePayerCustomerForAthleteMock).not.toHaveBeenCalled();
    expect(state.updateSets).toHaveLength(0);
    expect(state.insertedAttempts).toHaveLength(0);
  });

  it("rechaza también el procesamiento por lotes antes de consultar cargos", async () => {
    await expect(
      collectDueChargesForAcademy({ academyId: "academy_1", onlyDue: true })
    ).rejects.toBeInstanceOf(FamilyAutomaticCollectionDisabledError);
    expect(dbLike.select).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe("charge-reconcile-service", () => {
  it("payment_intent.succeeded marca el cargo pendiente como pagado", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_2", status: "pending", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentSucceeded({
      id: "pi_7",
      livemode: false,
      metadata: { chargeId: "charge_2", academyId: "academy_1", tenantId: "tenant_1" },
      amount_received: 5000,
      currency: "eur",
      latest_charge: "ch_7",
    } as any, "acct_123", false);

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
      livemode: false,
      metadata: { chargeId: "charge_3", academyId: "academy_1", tenantId: "tenant_1" },
      amount_received: 5000,
      currency: "eur",
    } as any, "acct_123", false);

    expect(state.updateSets).toHaveLength(0);
  });

  it("payment_intent.payment_failed no pisa un cargo ya pagado (transicion atomica, RETURNING vacio)", async () => {
    // Bajo el WHERE excluyente, el UPDATE se intenta pero RETURNING
    // devuelve `[]`: el cargo sigue siendo `paid` en la DB y no se
    // emite la notificacion. Esto cierra el TOCTOU entre el SELECT
    // inicial y el UPDATE.
    state.chargeRow = { ...baseCharge, id: "charge_4", status: "paid", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentFailed({
      id: "pi_9",
      livemode: false,
      metadata: { chargeId: "charge_4", academyId: "academy_1", tenantId: "tenant_1" },
    } as any, "acct_123", false);

    expect(state.updateSets).toHaveLength(1);
    expect(state.updateSets.at(-1)).toMatchObject({ status: "failed" });
    expect(sendChargePaymentFailedNotificationMock).not.toHaveBeenCalled();
  });

  it("payment_intent.payment_failed no pisa un cargo ya reembolsado", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_4b", status: "refunded", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentFailed({
      id: "pi_9b",
      livemode: false,
      metadata: { chargeId: "charge_4b", academyId: "academy_1", tenantId: "tenant_1" },
    } as any, "acct_123", false);

    expect(state.updateSets).toHaveLength(1);
    expect(state.updateSets.at(-1)).toMatchObject({ status: "failed" });
    expect(sendChargePaymentFailedNotificationMock).not.toHaveBeenCalled();
  });

  it("payment_intent.canceled devuelve el cargo a pendiente si seguía debiéndose", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_6", status: "failed", stripeAccountId: "acct_123" };

    await reconcilePaymentIntentCanceled({
      id: "pi_11",
      livemode: false,
      metadata: { chargeId: "charge_6", academyId: "academy_1", tenantId: "tenant_1" },
    } as any, "acct_123", false);

    expect(state.updateSets.at(-1)).toMatchObject({ status: "pending" });
  });

  it("charge.refunded marca el cargo como reembolsado", async () => {
    state.chargeRow = {
      id: "charge_5",
      status: "paid",
      stripeAccountId: "acct_123",
      tenantId: "tenant_1",
      academyId: "academy_1",
      currency: "eur",
    };

    await reconcileChargeRefunded(
      { id: "ch_10", amount: 5000, amount_refunded: 5000, currency: "eur", livemode: false } as any,
      "acct_123",
      false
    );

    expect(state.updateSets.at(-1)).toMatchObject({ status: "refunded" });
  });

  it("charge.refunded es idempotente si el cargo ya estaba reembolsado", async () => {
    state.chargeRow = {
      id: "charge_5",
      status: "refunded",
      stripeAccountId: "acct_123",
      tenantId: "tenant_1",
      academyId: "academy_1",
      currency: "eur",
    };

    await reconcileChargeRefunded(
      { id: "ch_10", amount: 5000, amount_refunded: 5000, currency: "eur", livemode: false } as any,
      "acct_123",
      false
    );

    expect(state.updateSets).toHaveLength(0);
  });

  it("rechaza un evento firmado que pertenece a otra cuenta Connect", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_7", stripeAccountId: "acct_expected" };

    await expect(
      reconcilePaymentIntentFailed(
        {
          id: "pi_cross_account",
          livemode: false,
          metadata: { chargeId: "charge_7", academyId: "academy_1", tenantId: "tenant_1" },
        } as any,
        "acct_attacker",
        false
      )
    ).rejects.toThrow("CONNECT_ACCOUNT_MISMATCH");
    expect(state.updateSets).toHaveLength(0);
  });

  it("rechaza metadata incompleta aunque el PaymentIntent exista", async () => {
    state.chargeRow = { ...baseCharge, id: "charge_8", stripeAccountId: "acct_123" };

    await expect(
      reconcilePaymentIntentFailed(
        { id: "pi_missing_metadata", livemode: false, metadata: { chargeId: "charge_8" } } as any,
        "acct_123",
        false
      )
    ).rejects.toThrow("CONNECT_METADATA_MISMATCH");
    expect(state.updateSets).toHaveLength(0);
  });
});
