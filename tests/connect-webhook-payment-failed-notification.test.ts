import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// IDs consistentes para que las aserciones sobre argumentos del notification
// service no dependan de magia literal en cada test.
const TENANT_ID = "00000000-0000-0000-0000-0000000000a1";
const ACADEMY_ID = "00000000-0000-0000-0000-0000000000a2";
const ATHLETE_ID = "00000000-0000-0000-0000-0000000000a3";
const CHARGE_ID = "00000000-0000-0000-0000-0000000000a4";
const STRIPE_ACCOUNT_ID = "acct_test_123";
const PAYMENT_INTENT_ID = "pi_test_failed_123";
const EVENT_ID = "evt_test_failed_456";

const mocks = vi.hoisted(() => {
  const chargeQueue: unknown[][] = [];
  return {
    chargeQueue,
    // No se mockea aqui: la implementacion la controlan los tests via
    // `mockImplementation` (sin .once) y el handler `setupWebhookMocks`
    // los resetea y vuelve a configurar antes de cada test.
    pushCharge(row: unknown) {
      chargeQueue.push([row]);
    },
    pushNoCharge() {
      chargeQueue.push([]);
    },
    resetChargeQueue() {
      chargeQueue.length = 0;
    },
  };
});

// Helper que centraliza la configuracion de los mocks para que cada test
// arranque con un estado limpio y predecible, sin depender de
// `vi.clearAllMocks()` (cuyo comportamiento con `mockImplementationOnce` no
// es estable).
const mockConstructEvent = vi.fn();
const mockRecordBillingEvent = vi.fn();
const mockUpdateBillingEventStatus = vi.fn();
const mockSendChargePaymentFailedNotification = vi.fn();
const mockSyncConnectAccountFromStripe = vi.fn();

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

vi.mock("@/lib/stripe/billing-events-service", () => ({
  recordBillingEvent: mockRecordBillingEvent,
  updateBillingEventStatus: mockUpdateBillingEventStatus,
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  syncConnectAccountFromStripe: mockSyncConnectAccountFromStripe,
}));

vi.mock("@/lib/stripe/notification-service", () => ({
  sendChargePaymentFailedNotification: mockSendChargePaymentFailedNotification,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    apiError: vi.fn(),
  },
}));

vi.mock("@/db", () => {
  const buildSelectChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "leftJoin",
      "rightJoin",
      "where",
      "orderBy",
      "groupBy",
      "offset",
      "set",
      "values",
      "returning",
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    chain.limit = vi.fn(() => {
      const next = mocks.chargeQueue.length ? mocks.chargeQueue.shift() : [];
      return Promise.resolve(next);
    });
    return chain;
  };

  const buildUpdateChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "leftJoin",
      "rightJoin",
      "where",
      "orderBy",
      "groupBy",
      "offset",
      "set",
      "values",
      "limit",
      "returning",
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    return chain;
  };

  const buildInsertChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "leftJoin",
      "rightJoin",
      "where",
      "orderBy",
      "groupBy",
      "offset",
      "set",
      "values",
      "limit",
      "returning",
      "onConflictDoNothing",
      "onConflictDoUpdate",
    ]) {
      chain[method] = vi.fn(() => chain);
    }
    return chain;
  };

  return {
    db: {
      select: vi.fn(() => buildSelectChain()),
      update: vi.fn(() => buildUpdateChain()),
      insert: vi.fn(() => buildInsertChain()),
    },
  };
});

function makeChargeRow(overrides: Partial<{
  id: string;
  tenantId: string;
  academyId: string;
  athleteId: string;
  amountCents: number;
  currency: string;
  status: string;
  stripeAccountId: string | null;
}> = {}) {
  return {
    id: CHARGE_ID,
    tenantId: TENANT_ID,
    academyId: ACADEMY_ID,
    athleteId: ATHLETE_ID,
    amountCents: 5000,
    currency: "eur",
    status: "pending",
    stripeAccountId: STRIPE_ACCOUNT_ID,
    ...overrides,
  };
}

function buildPaymentIntentFailedEvent(opts: {
  paymentIntentId?: string;
  metadata?: Record<string, string>;
  declineCode?: string | null;
  errorCode?: string | null;
} = {}): Stripe.Event {
  // Distinguimos `undefined` (no provisto) de `null` (explícitamente null):
  // la rama `??` solo dispara cuando el valor es nullish, asi que `null`
  // para `declineCode` debe propagarse como null en el payload.
  const declineCode =
    opts.declineCode === undefined ? "generic_decline" : opts.declineCode;
  const errorCode = opts.errorCode === undefined ? "card_declined" : opts.errorCode;
  return {
    id: EVENT_ID,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.payment_failed",
    account: STRIPE_ACCOUNT_ID,
    data: {
      object: {
        id: opts.paymentIntentId ?? PAYMENT_INTENT_ID,
        object: "payment_intent",
        amount: 5000,
        currency: "eur",
        status: "requires_payment_method",
        last_payment_error: {
          code: errorCode,
          decline_code: declineCode,
          message: "Your card was declined.",
        },
        metadata: {
          chargeId: CHARGE_ID,
          academyId: ACADEMY_ID,
          tenantId: TENANT_ID,
          ...opts.metadata,
        },
      } as unknown as Stripe.PaymentIntent,
    },
  } as unknown as Stripe.Event;
}

process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_test_connect";

const importWebhook = () => import("@/app/api/stripe/connect/webhook/route");

beforeAll(async () => {
  // Pre-importamos el route para que el primer test no pague el coste de
  // transformar/compilar el modulo bajo el timeout por defecto.
  await importWebhook();
}, 60_000);

beforeEach(() => {
  // Reset explicito por mock: evita depender de `vi.clearAllMocks()` (tambien
  // llamada desde `tests/setup.ts`), cuyo manejo de `mockImplementationOnce`
  // puede filtrar estado entre tests.
  mockConstructEvent.mockReset();
  mockRecordBillingEvent.mockReset();
  mockUpdateBillingEventStatus.mockReset();
  mockSendChargePaymentFailedNotification.mockReset();
  mockSyncConnectAccountFromStripe.mockReset();
  // Defaults estables para cada test.
  mockRecordBillingEvent.mockResolvedValue({
    id: "billing-event-1",
    shouldProcess: true,
    previousStatus: null,
  });
  mockUpdateBillingEventStatus.mockResolvedValue(undefined);
  mockSendChargePaymentFailedNotification.mockResolvedValue(true);
  mockConstructEvent.mockImplementation(() => buildPaymentIntentFailedEvent());
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_test_connect";
  mocks.resetChargeQueue();
});

async function postWebhook(
  body: string,
  options: { signature?: string | null } = {}
): Promise<Response> {
  const { POST } = await importWebhook();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // Por defecto usamos una firma no vacia; los tests que quieren probar el
  // camino "falta firma" pasan `signature: null` explicitamente.
  if (options.signature !== null) {
    headers["stripe-signature"] = options.signature ?? "valid-signature";
  }
  return POST(
    new Request("http://localhost/api/stripe/connect/webhook", {
      method: "POST",
      body,
      headers,
    })
  );
}

describe("POST /api/stripe/connect/webhook — payment_intent.payment_failed", () => {
  it("responde 200 y notifica al tutor cuando el cargo existe y coincide con la cuenta Connect", async () => {
    mocks.pushCharge(makeChargeRow());

    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      duplicate: false,
      rejected: false,
    });

    expect(mockRecordBillingEvent).toHaveBeenCalledTimes(1);
    expect(mockSendChargePaymentFailedNotification).toHaveBeenCalledTimes(1);
    expect(mockSendChargePaymentFailedNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: CHARGE_ID,
        tenantId: TENANT_ID,
        academyId: ACADEMY_ID,
        athleteId: ATHLETE_ID,
        amountCents: 5000,
        currency: "eur",
        paymentIntentId: PAYMENT_INTENT_ID,
        // failureReason prioriza `decline_code` sobre `code` (regla del proveedor).
        failureReason: "generic_decline",
      })
    );
    expect(mockUpdateBillingEventStatus).toHaveBeenCalledWith(
      "billing-event-1",
      expect.objectContaining({ status: "processed" })
    );
  });

  it("no notifica al tutor cuando no hay cargo asociado al PaymentIntent", async () => {
    // Cola vacia: no hay cargo que coincida.
    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
    // Sigue marcando el evento como procesado para no reintentar en bucle.
    expect(mockUpdateBillingEventStatus).toHaveBeenCalledWith(
      "billing-event-1",
      expect.objectContaining({ status: "processed" })
    );
  });

  it("no notifica al tutor si el cargo ya esta pagado (carrera contra PI tardio)", async () => {
    mocks.pushCharge(makeChargeRow({ status: "paid" }));

    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
  });

  it("no notifica al tutor si el cargo ya esta reembolsado", async () => {
    mocks.pushCharge(makeChargeRow({ status: "refunded" }));

    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
  });

  it("usa `code` del last_payment_error como fallback cuando decline_code es null", async () => {
    // El webhook reconciliador prioriza `decline_code` sobre `code`; pasamos
    // `decline_code: null` para asegurar que cae al `code` (`insufficient_funds`).
    mockConstructEvent.mockImplementation(() =>
      buildPaymentIntentFailedEvent({ declineCode: null, errorCode: "insufficient_funds" })
    );
    mocks.pushCharge(makeChargeRow());

    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    expect(mockSendChargePaymentFailedNotification).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: "insufficient_funds" })
    );
  });


  it("devuelve 400 SIGNATURE_VERIFICATION_FAILED cuando la firma no es valida", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload.");
    });

    const response = await postWebhook("{}", { signature: "invalid-signature" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "SIGNATURE_VERIFICATION_FAILED",
    });
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
    expect(mockRecordBillingEvent).not.toHaveBeenCalled();
  });

  it("devuelve 400 SIGNATURE_VERIFICATION_FAILED cuando falta la cabecera stripe-signature", async () => {
    const response = await postWebhook("{}", { signature: null });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "SIGNATURE_VERIFICATION_FAILED",
    });
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
  });

  it("es idempotente: si billing_events dice que ya se proceso, no vuelve a notificar", async () => {
    mocks.pushCharge(makeChargeRow());
    mockRecordBillingEvent.mockResolvedValueOnce({
      id: "billing-event-1",
      shouldProcess: false,
      previousStatus: "processed",
    });

    const response = await postWebhook(JSON.stringify({ type: "payment_intent.payment_failed" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      duplicate: true,
      rejected: false,
    });
    expect(mockSendChargePaymentFailedNotification).not.toHaveBeenCalled();
  });
});
