import { beforeEach, describe, expect, it, vi } from "vitest";

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
      return Promise.resolve();
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
<<<<<<< HEAD
=======
vi.mock("@/db", () => ({ db: tx }));
>>>>>>> origin/main
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ refunds: { create: state.refundCreate } }),
}));
vi.mock("@/lib/audit-log", () => ({ createAuditLog: state.audit }));
<<<<<<< HEAD

import { refundCharge } from "@/lib/stripe/refund-service";
=======
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { refundCharge } from "@/lib/stripe/refund-service";
import { reconcileChargeRefunded } from "@/lib/stripe/charge-reconcile-service";
>>>>>>> origin/main

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
    state.selectResults = [[charge], [{ refundedCents: 0 }], []];
    state.inserts = [];
    state.updates = [];
    state.refundCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });
    state.audit.mockResolvedValue(undefined);
  });

  it("serializa, usa la cuenta conectada y registra un reembolso total una sola vez", async () => {
    const result = await refundCharge({ chargeId: "charge_1", actorUserId: "user_1" });
    expect(result).toEqual({ ok: true, refundId: "re_1" });
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, payment_intent: "pi_1" }),
      expect.objectContaining({ stripeAccount: "acct_1", idempotencyKey: "refund_charge_1_0_5000" })
    );
    expect(state.inserts).toHaveLength(1);
    expect(state.updates.at(-1)).toMatchObject({ status: "refunded" });
  });

  it("registra un reembolso parcial con idempotencia por importe y conserva el cargo pagado", async () => {
    const result = await refundCharge({
      chargeId: "charge_1",
      amountCents: 1500,
      reason: "customer_request",
      actorUserId: "user_1",
    });

    expect(result).toEqual({ ok: true, refundId: "re_1" });
    expect(state.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, payment_intent: "pi_1" }),
      expect.objectContaining({
        stripeAccount: "acct_1",
        idempotencyKey: "refund_charge_1_0_1500",
      })
    );
    expect(state.inserts).toEqual([
      expect.objectContaining({
        chargeId: "charge_1",
        stripeRefundId: "re_1",
        amountCents: 1500,
        reason: "customer_request",
        status: "succeeded",
      }),
    ]);
    expect(state.updates).toHaveLength(0);
  });

  it("no duplica el ledger si Stripe devuelve el mismo refund al reintentar", async () => {
    state.selectResults = [[charge], [{ refundedCents: 0 }], [{ id: "existing" }]];
    const result = await refundCharge({ chargeId: "charge_1", actorUserId: "user_1" });
    expect(result).toEqual({ ok: true, refundId: "re_1" });
    expect(state.inserts).toHaveLength(0);
  });

  it("rechaza importes que superan el saldo restante", async () => {
    state.selectResults = [[charge], [{ refundedCents: 4000 }]];
    const result = await refundCharge({
      chargeId: "charge_1",
      amountCents: 1500,
      actorUserId: "user_1",
    });
    expect(result).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    expect(state.refundCreate).not.toHaveBeenCalled();
  });
<<<<<<< HEAD
=======

  it("registra un reembolso parcial sin marcar el cargo como reembolsado", async () => {
    const result = await refundCharge({
      chargeId: "charge_1",
      amountCents: 1500,
      actorUserId: "user_1",
    });

    expect(result).toEqual({ ok: true, refundId: "re_1" });
    expect(state.refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1500, payment_intent: "pi_1" }),
      expect.objectContaining({
        stripeAccount: "acct_1",
        idempotencyKey: "refund_charge_1_0_1500",
      })
    );
    expect(state.inserts).toEqual([
      expect.objectContaining({
        tenantId: "tenant_1",
        academyId: "academy_1",
        chargeId: "charge_1",
        stripeRefundId: "re_1",
        stripePaymentIntentId: "pi_1",
        amountCents: 1500,
        currency: "eur",
        status: "succeeded",
      }),
    ]);
    expect(state.updates).toHaveLength(0);
  });

  it("acumula dos parciales y marca el cargo como reembolsado al completar el total", async () => {
    await refundCharge({
      chargeId: "charge_1",
      amountCents: 1500,
      actorUserId: "user_1",
    });
    expect(state.refundCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: 1500, payment_intent: "pi_1" }),
      expect.objectContaining({
        stripeAccount: "acct_1",
        idempotencyKey: "refund_charge_1_0_1500",
      })
    );
    expect(state.updates).toHaveLength(0);

    state.selectResults = [[charge], [{ refundedCents: 1500 }], []];
    state.refundCreate.mockResolvedValueOnce({ id: "re_2", status: "succeeded" });
    const result = await refundCharge({
      chargeId: "charge_1",
      amountCents: 3500,
      actorUserId: "user_1",
    });

    expect(result).toEqual({ ok: true, refundId: "re_2" });
    expect(state.refundCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 3500, payment_intent: "pi_1" }),
      expect.objectContaining({
        stripeAccount: "acct_1",
        idempotencyKey: "refund_charge_1_1500_3500",
      })
    );
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts.at(-1)).toMatchObject({
      chargeId: "charge_1",
      stripeRefundId: "re_2",
      amountCents: 3500,
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "refunded" });
  });

  it("es idempotente si el cargo ya estaba marcado como reembolsado", async () => {
    state.selectResults = [[{ ...charge, status: "refunded" }]];

    const result = await refundCharge({
      chargeId: "charge_1",
      actorUserId: "user_1",
    });

    expect(result).toEqual({ ok: false, reason: "NOT_REFUNDABLE:refunded" });
    expect(state.refundCreate).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rechaza importes cero o negativos", async () => {
    const zeroResult = await refundCharge({
      chargeId: "charge_1",
      amountCents: 0,
      actorUserId: "user_1",
    });

    state.selectResults = [[charge], [{ refundedCents: 0 }]];
    const negativeResult = await refundCharge({
      chargeId: "charge_1",
      amountCents: -100,
      actorUserId: "user_1",
    });

    expect(zeroResult).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    expect(negativeResult).toEqual({ ok: false, reason: "INVALID_AMOUNT" });
    expect(state.refundCreate).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });
});

describe("reconciliación charge.refunded tras reembolso parcial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectResults = [];
    state.inserts = [];
    state.updates = [];
  });

  it("marca como reembolsado un cargo que todavía figura como pagado", async () => {
    state.selectResults = [[{ id: "charge_1", status: "paid", stripeAccountId: "acct_1" }]];

    await reconcileChargeRefunded({ id: "ch_1" } as never, "acct_1");

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "refunded" });
  });

  it("es idempotente si el cargo ya estaba marcado como reembolsado", async () => {
    state.selectResults = [[{ id: "charge_1", status: "refunded", stripeAccountId: "acct_1" }]];

    await reconcileChargeRefunded({ id: "ch_1" } as never, "acct_1");

    expect(state.updates).toHaveLength(0);
  });

  it("rechaza el evento de una cuenta Connect ajena", async () => {
    state.selectResults = [[{ id: "charge_1", status: "paid", stripeAccountId: "acct_1" }]];

    await expect(
      reconcileChargeRefunded({ id: "ch_1" } as never, "acct_attacker")
    ).rejects.toThrow("CONNECT_ACCOUNT_MISMATCH");
    expect(state.updates).toHaveLength(0);
  });
>>>>>>> origin/main
});
