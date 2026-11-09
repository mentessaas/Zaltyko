import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  execute: vi.fn(),
  refundCreate: vi.fn(),
  audit: vi.fn(),
}));

const tx = vi.hoisted(() => {
  const next = () => Promise.resolve(state.selectResults.shift() ?? []);
  const select = vi.fn(() => {
    const chain: any = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(next);
    chain.then = (resolve: (value: unknown[]) => void, reject: (error: unknown) => void) =>
      next().then(resolve, reject);
    return chain;
  });
  const insert = vi.fn(() => ({
    values: vi.fn((value) => {
      state.inserts.push(value);
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        then: (resolve: (value: undefined) => void) => Promise.resolve(undefined).then(resolve),
      };
    }),
  }));
  const update = vi.fn(() => ({
    set: vi.fn((value) => {
      state.updates.push(value);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  }));
  return { select, insert, update, execute: state.execute };
});

vi.mock("@/lib/db-transactions", () => ({
  withTransaction: (callback: (value: typeof tx) => unknown) => callback(tx),
}));
vi.mock("@/db", () => ({ db: tx }));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ refunds: { create: state.refundCreate } }),
}));
vi.mock("@/lib/audit-log", () => ({ createAuditLog: state.audit }));

import { refundCharge } from "@/lib/stripe/refund-service";
import { FamilyAutomaticCollectionDisabledError } from "@/lib/stripe/family-automatic-collection-disabled";
import { reconcileChargeRefunded } from "@/lib/stripe/charge-reconcile-service";

const charge = {
  id: "charge_1",
  tenantId: "tenant_1",
  academyId: "academy_1",
  amountCents: 5000,
  currency: "eur",
  status: "paid",
  stripePaymentIntentId: "pi_1",
  stripeAccountId: "acct_1",
};

describe("refundCharge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_unit_refund";
    state.selectResults = [[charge], [{ refundedCents: 0 }], []];
    state.inserts = [];
    state.updates = [];
    state.refundCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });
    state.audit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("desactiva reembolsos antes de abrir transacción, consultar o llamar a Stripe", async () => {
    await expect(refundCharge({ chargeId: "charge_1", actorUserId: "user_1" })).rejects.toBeInstanceOf(
      FamilyAutomaticCollectionDisabledError
    );
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();
    expect(state.refundCreate).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe("reconciliación charge.refunded tras reembolso parcial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_unit_refund";
    state.selectResults = [];
    state.inserts = [];
    state.updates = [];
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("marca como reembolsado un cargo que todavía figura como pagado", async () => {
    state.selectResults = [[{ id: "charge_1", status: "paid", stripeAccountId: "acct_1" }]];

    await reconcileChargeRefunded(
      { id: "ch_1", amount: 5000, amount_refunded: 5000, currency: "eur", livemode: false } as never,
      "acct_1",
      false
    );

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "refunded" });
  });

  it("es idempotente si el cargo ya estaba marcado como reembolsado", async () => {
    state.selectResults = [[{ id: "charge_1", status: "refunded", stripeAccountId: "acct_1" }]];

    await reconcileChargeRefunded(
      { id: "ch_1", amount: 5000, amount_refunded: 5000, currency: "eur", livemode: false } as never,
      "acct_1",
      false
    );

    expect(state.updates).toHaveLength(0);
  });

  it("rechaza el evento de una cuenta Connect ajena", async () => {
    state.selectResults = [[{ id: "charge_1", status: "paid", stripeAccountId: "acct_1" }]];

    await expect(
      reconcileChargeRefunded(
        { id: "ch_1", amount: 5000, amount_refunded: 5000, currency: "eur", livemode: false } as never,
        "acct_attacker",
        false
      )
    ).rejects.toThrow("CONNECT_ACCOUNT_MISMATCH");
    expect(state.updates).toHaveLength(0);
  });
});
