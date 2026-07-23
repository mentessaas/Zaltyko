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
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ refunds: { create: state.refundCreate } }),
}));
vi.mock("@/lib/audit-log", () => ({ createAuditLog: state.audit }));

import { refundCharge } from "@/lib/stripe/refund-service";

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
});
