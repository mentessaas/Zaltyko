import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  recordBillingEvent: vi.fn(),
  updateBillingEventStatus: vi.fn(),
  syncConnectAccountFromStripe: vi.fn(),
  succeeded: vi.fn(),
  failed: vi.fn(),
  canceled: vi.fn(),
  refunded: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));

vi.mock("@/lib/stripe/billing-events-service", () => ({
  recordBillingEvent: mocks.recordBillingEvent,
  updateBillingEventStatus: mocks.updateBillingEventStatus,
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  syncConnectAccountFromStripe: mocks.syncConnectAccountFromStripe,
}));

vi.mock("@/lib/stripe/charge-reconcile-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/charge-reconcile-service")>();
  return {
    ...actual,
    reconcilePaymentIntentSucceeded: mocks.succeeded,
    reconcilePaymentIntentFailed: mocks.failed,
    reconcilePaymentIntentCanceled: mocks.canceled,
    reconcileChargeRefunded: mocks.refunded,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  handleConnectWebhook,
  processConnectEvent,
} from "@/lib/stripe/connect-webhook-handler";

describe("Stripe Connect webhook hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
    mocks.recordBillingEvent.mockResolvedValue({ id: "event-row", shouldProcess: true });
    mocks.updateBillingEventStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  });

  it("falla cerrado si falta el secreto", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const response = await handleConnectWebhook(new Request("http://localhost/webhook", { method: "POST" }));
    expect(response.status).toBe(500);
  });

  it("rechaza firma ausente e inválida sobre el body raw", async () => {
    const missing = await handleConnectWebhook(
      new Request("http://localhost/webhook", { method: "POST", body: "raw-body" })
    );
    expect(missing.status).toBe(400);

    mocks.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const invalid = await handleConnectWebhook(
      new Request("http://localhost/webhook", {
        method: "POST",
        body: "raw-body",
        headers: { "stripe-signature": "t=1,v1=bad" },
      })
    );
    expect(invalid.status).toBe(400);
    expect(mocks.constructEvent).toHaveBeenCalledWith(
      "raw-body",
      "t=1,v1=bad",
      "whsec_connect_test",
      300
    );
  });

  it("descarta un evento duplicado sin reprocesarlo", async () => {
    mocks.recordBillingEvent.mockResolvedValue({ id: "event-row", shouldProcess: false });
    const result = await processConnectEvent({ id: "evt_dup", type: "payment_intent.succeeded" } as never);
    expect(result).toEqual({ duplicate: true, rejected: false });
    expect(mocks.succeeded).not.toHaveBeenCalled();
  });

  it("pasa event.account al reconciliador de pagos", async () => {
    const paymentIntent = { id: "pi_1" };
    await processConnectEvent({
      id: "evt_ok",
      type: "payment_intent.succeeded",
      account: "acct_academy",
      data: { object: paymentIntent },
    } as never);

    expect(mocks.succeeded).toHaveBeenCalledWith(paymentIntent, "acct_academy");
    expect(mocks.updateBillingEventStatus).toHaveBeenCalledWith(
      "event-row",
      expect.objectContaining({ status: "processed" })
    );
  });

  it("marca como rechazado un account.updated de otra cuenta y no lo reintenta", async () => {
    const result = await processConnectEvent({
      id: "evt_cross",
      type: "account.updated",
      account: "acct_other",
      data: { object: { id: "acct_expected" } },
    } as never);

    expect(result).toEqual({ duplicate: false, rejected: true });
    expect(mocks.syncConnectAccountFromStripe).not.toHaveBeenCalled();
    expect(mocks.updateBillingEventStatus).toHaveBeenCalledWith(
      "event-row",
      expect.objectContaining({ status: "processed", errorMessage: "CONNECT_ACCOUNT_MISMATCH" })
    );
  });

  it("devuelve error reintentable ante un fallo temporal de DB", async () => {
    mocks.syncConnectAccountFromStripe.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(
      processConnectEvent({
        id: "evt_db",
        type: "account.updated",
        account: "acct_1",
        data: { object: { id: "acct_1" } },
      } as never)
    ).rejects.toThrow("db unavailable");
    expect(mocks.updateBillingEventStatus).toHaveBeenCalledWith(
      "event-row",
      expect.objectContaining({ status: "error" })
    );
  });
});
