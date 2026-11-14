import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

/**
 * Webhook SaaS con dependencias aisladas: la base de datos es una cola de
 * resultados por consulta (`limit`/`returning`) y Stripe devuelve objetos
 * sintéticos. Comprueba cuándo se dispara el correo de confirmación de la
 * contratación, no la lógica de concesión (cubierta en otras suites).
 */
const mocks = vi.hoisted(() => {
  const state = {
    limitQueue: [] as unknown[][],
    returningQueue: [] as unknown[][],
    committed: false,
  };
  function chain(): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "for",
      "orderBy",
      "set",
      "values",
      "onConflictDoNothing",
      "onConflictDoUpdate",
    ]) {
      query[method] = () => query;
    }
    query.limit = async () => state.limitQueue.shift() ?? [];
    query.returning = async () =>
      state.returningQueue.shift() ?? [{ id: "row-synthetic", fencingVersion: 1 }];
    // Updates awaited without returning().
    query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject);
    return query;
  }
  const client = {
    select: () => chain(),
    insert: () => chain(),
    update: () => chain(),
  };
  return {
    state,
    client,
    transaction: vi.fn(),
    invoice: vi.fn(),
    subscription: vi.fn(),
    send: vi.fn(),
    grant: vi.fn(),
    lock: vi.fn(),
    error: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: { ...mocks.client, transaction: mocks.transaction },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error },
}));
vi.mock("@/lib/email/email-service", () => ({ sendEmailWithLogging: vi.fn() }));
vi.mock("@/modules/saas-billing/application/entitlement-service", () => ({
  grantOrganizationEntitlement: mocks.grant,
  lockOrganizationForSaasMutation: mocks.lock,
}));
vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  createSaasStripeClient: () => ({
    invoices: { retrieve: mocks.invoice },
    subscriptions: { retrieve: mocks.subscription },
  }),
}));
vi.mock(
  "@/modules/saas-billing/application/contract-confirmation-email",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/modules/saas-billing/application/contract-confirmation-email")
    >();
    return { ...actual, sendSaasContractConfirmationEmail: mocks.send };
  }
);

import { processSaasBillingWebhook } from "@/modules/saas-billing/application/webhook-service";
import type { SaasStripeConfig } from "@/modules/saas-billing/application/saas-billing-config";

const organizationId = "10000000-0000-4000-8000-000000000001";
const operationId = "30000000-0000-4000-8000-000000000003";
const memberId = "20000000-0000-4000-8000-000000000002";
const customerRowId = "40000000-0000-4000-8000-000000000004";

const config = {
  environment: "test",
  secretKey: "sk_test_synthetic",
  webhookSecret: "whsec_synthetic",
  providerAccountReference: "acct_synthetic",
  portalEnabled: true,
  prices: {
    starter: { month: "price_starter_month", year: "price_starter_year" },
    growth: { month: "price_growth_month", year: "price_growth_year" },
  },
} as SaasStripeConfig;

const metadata = {
  zaltyko_saas: "true",
  organization_saas_checkout_operation_id: operationId,
  organization_id: organizationId,
  plan_code: "starter",
  billing_interval: "month",
  provider_account_reference: "acct_synthetic",
  environment: "test",
  immediate_start_consent: "desistimiento-14d-v1",
};

const price = {
  id: "price_starter_month",
  active: true,
  livemode: false,
  currency: "eur",
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
  unit_amount: 1900,
};

const periodStart = Math.floor(Date.now() / 1000) - 60;
const periodEnd = periodStart + 30 * 24 * 60 * 60;

function paidInvoice(billingReason = "subscription_create") {
  return {
    id: "in_synthetic",
    object: "invoice",
    status: "paid",
    currency: "eur",
    livemode: false,
    customer: "cus_synthetic",
    customer_email: "facturacion@example.invalid",
    billing_reason: billingReason,
    subtotal: 1900,
    total_excluding_tax: 1900,
    total: 2299,
    metadata: {},
    parent: {
      subscription_details: { subscription: "sub_synthetic", metadata },
    },
    lines: {
      data: [{ price: { id: price.id }, period: { start: periodStart, end: periodEnd } }],
    },
  };
}

const subscription = {
  id: "sub_synthetic",
  customer: "cus_synthetic",
  livemode: false,
  status: "active",
  metadata,
  cancel_at_period_end: false,
  canceled_at: null,
  items: { data: [{ quantity: 1, price }] },
};

const event = {
  id: "evt_synthetic_invoice_paid",
  object: "event",
  type: "invoice.paid",
  created: periodStart + 5,
  livemode: false,
  data: { object: { id: "in_synthetic", object: "invoice" } },
} as unknown as Parameters<typeof processSaasBillingWebhook>[0]["event"];
const rawBody = JSON.stringify(event);

const operationRow = {
  id: operationId,
  organizationId,
  customerId: customerRowId,
  requestedByMemberId: memberId,
  planCode: "starter",
  billingInterval: "month",
  status: "completed",
  checkoutSessionReference: "cs_synthetic",
  sessionExpiresAt: new Date(),
};

/** Resultados de `limit()` en el orden en que processPaidInvoice consulta. */
function queueFirstPurchase() {
  mocks.state.limitQueue.push(
    [{ id: "row-synthetic" }], // lease activo del evento
    [{ id: customerRowId, organizationId }], // customer listo
    [], // suscripción existente por referencia
    [operationRow], // operación de Checkout
    [operationRow], // operación bloqueada
    [], // suscripción actual de la organización
    [{ trialId: null }] // entitlement actual
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.limitQueue.length = 0;
  mocks.state.returningQueue.length = 0;
  mocks.state.committed = false;
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn(mocks.client);
    mocks.state.committed = true;
    return result;
  });
  mocks.invoice.mockReset().mockResolvedValue(paidInvoice());
  mocks.subscription.mockReset().mockResolvedValue(subscription);
  mocks.send.mockReset().mockResolvedValue("sent");
  mocks.grant.mockReset().mockResolvedValue(undefined);
  mocks.lock.mockReset().mockResolvedValue(undefined);
});

describe("confirmación de la contratación desde el webhook SaaS", () => {
  it("el primer invoice.paid confirma la contratación una vez, después del commit", async () => {
    queueFirstPurchase();
    let committedBeforeSend: boolean | null = null;
    mocks.send.mockImplementation(async () => {
      committedBeforeSend = mocks.state.committed;
      return "sent";
    });

    await expect(
      processSaasBillingWebhook({ event, rawBody, config })
    ).resolves.toEqual({ duplicate: false, ignored: false, quarantined: false });

    expect(mocks.grant).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(committedBeforeSend).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "test",
        organizationId,
        requestedByMemberId: memberId,
        planCode: "starter",
        billingInterval: "month",
        subscriptionReference: "sub_synthetic",
        invoiceReference: "in_synthetic",
        baseCents: 1900,
        taxCents: 399,
        totalCents: 2299,
        periodStartedAt: new Date(periodStart * 1000),
        periodEndsAt: new Date(periodEnd * 1000),
        immediateStartConsentAccepted: true,
      })
    );
  });

  it("una reentrega de Stripe del evento ya procesado no envía otro correo", async () => {
    const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
    mocks.state.returningQueue.push([]); // conflicto: el evento ya existe
    mocks.state.limitQueue.push([
      {
        id: "row-synthetic",
        payloadSha256,
        status: "processed",
        reconciliationDecisionId: null,
      },
    ]);

    await expect(
      processSaasBillingWebhook({ event, rawBody, config })
    ).resolves.toEqual({ duplicate: true, ignored: false, quarantined: false });

    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("un fallo del correo no hace fallar el webhook", async () => {
    queueFirstPurchase();
    mocks.send.mockRejectedValue(new Error("BREVO_API_ERROR:500"));

    await expect(
      processSaasBillingWebhook({ event, rawBody, config })
    ).resolves.toEqual({ duplicate: false, ignored: false, quarantined: false });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith(
      "saas_billing.contract_confirmation_failed",
      expect.any(Error),
      expect.objectContaining({ eventId: "evt_synthetic_invoice_paid", organizationId })
    );
  });

  it("las renovaciones conceden el periodo pero no repiten la confirmación", async () => {
    queueFirstPurchase();
    mocks.invoice.mockResolvedValue(paidInvoice("subscription_cycle"));

    await expect(
      processSaasBillingWebhook({ event, rawBody, config })
    ).resolves.toEqual({ duplicate: false, ignored: false, quarantined: false });

    expect(mocks.grant).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("si la transacción falla no se envía nada", async () => {
    queueFirstPurchase();
    mocks.grant.mockRejectedValue(new Error("grant failed"));

    await expect(
      processSaasBillingWebhook({ event, rawBody, config })
    ).rejects.toThrow("grant failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
