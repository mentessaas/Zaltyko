import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

/**
 * Tarea 2b (Fase 4, ADR-0028): el webhook antiguo de cuentas conectadas
 * (`/api/stripe/connect/webhook`) deja de guardar el evento entero en
 * `billing_events.payload`; solo guarda un resumen sin datos de quien paga.
 * El webhook de la suscripción de la plataforma sigue igual (evento entero).
 *
 * Se usa el `recordBillingEvent` real con una base simulada en memoria, para
 * ver exactamente lo que llegaría a la fila: tanto al crearla como al
 * reclamarla en un reintento (regla C7).
 */

interface BillingEventRow {
  id: string;
  stripeEventId: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
  payload: unknown;
  [key: string]: unknown;
}

type Values = Record<string, unknown>;

const { dbState, dbClient } = vi.hoisted(() => {
  const dbState = {
    rows: new Map<string, BillingEventRow>(),
    // La base simulada atiende un evento cada vez: el SELECT y los UPDATE
    // actúan sobre la fila del último evento insertado.
    currentEventId: null as string | null,
    inserts: [] as Values[],
    updates: [] as Values[],
  };

  const currentRow = () =>
    dbState.currentEventId ? dbState.rows.get(dbState.currentEventId) : undefined;

  const applyUpdate = (values: Values) => {
    const { attemptCount, ...rest } = values;
    // El SQL de `attempt_count + 1` lleva referencias circulares a la tabla:
    // se apunta como texto para poder serializar lo escrito.
    dbState.updates.push(
      attemptCount === undefined ? rest : { ...rest, attemptCount: "attempt_count + 1" }
    );
    const row = currentRow();
    if (!row) return [];
    Object.assign(row, rest);
    // `attemptCount` llega como `attempt_count + 1` en SQL.
    if (attemptCount !== undefined) row.attemptCount += 1;
    return [{ id: row.id }];
  };

  const dbClient = {
    insert: () => ({
      values: (values: Values) => {
        dbState.inserts.push(values);
        const stripeEventId = values.stripeEventId as string;
        dbState.currentEventId = stripeEventId;
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (dbState.rows.has(stripeEventId)) return [];
              const row: BillingEventRow = {
                id: `be_${dbState.rows.size + 1}`,
                stripeEventId,
                status: values.status as string,
                attemptCount: values.attemptCount as number,
                lastAttemptAt: (values.lastAttemptAt as Date | undefined) ?? null,
                payload: values.payload,
              };
              dbState.rows.set(stripeEventId, row);
              return [{ id: row.id }];
            },
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const row = currentRow();
            return row
              ? [{ id: row.id, status: row.status, lastAttemptAt: row.lastAttemptAt }]
              : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Values) => ({
        where: () => ({
          // Reclamación con compare-and-swap (`.returning(...)`).
          returning: async () => applyUpdate(values),
          // `updateBillingEventStatus` espera el `.where(...)` directamente.
          then: (resolve: (value: undefined) => void, reject: (reason: unknown) => void) => {
            try {
              applyUpdate(values);
              resolve(undefined);
            } catch (error) {
              reject(error);
            }
          },
        }),
      }),
    }),
  };

  return { dbState, dbClient };
});

const mocks = vi.hoisted(() => ({
  syncConnectAccountFromStripe: vi.fn(),
  succeeded: vi.fn(),
  failed: vi.fn(),
  canceled: vi.fn(),
  refunded: vi.fn(),
  handleSubscriptionEvent: vi.fn(),
  handleInvoiceEvent: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbClient }));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({ webhooks: { constructEvent: vi.fn() } }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/stripe/connect-service", () => ({
  syncConnectAccountFromStripe: mocks.syncConnectAccountFromStripe,
}));

vi.mock("@/lib/stripe/charge-reconcile-service", async () => {
  const context = await vi.importActual<typeof import("@/lib/stripe/connect-event-context")>(
    "@/lib/stripe/connect-event-context"
  );
  return {
    ConnectEventRejectedError: context.ConnectEventRejectedError,
    reconcilePaymentIntentSucceeded: mocks.succeeded,
    reconcilePaymentIntentFailed: mocks.failed,
    reconcilePaymentIntentCanceled: mocks.canceled,
    reconcileChargeRefunded: mocks.refunded,
  };
});

vi.mock("@/lib/stripe/subscription-service", () => ({
  handleSubscriptionEvent: mocks.handleSubscriptionEvent,
}));

vi.mock("@/lib/stripe/invoice-service", () => ({
  handleInvoiceEvent: mocks.handleInvoiceEvent,
}));

vi.mock("@/modules/saas-billing/application/saas-billing-config", () => ({
  getSaasStripeConfig: vi.fn(() => null),
  getSaasStripeWebhookVerificationConfig: vi.fn(() => null),
}));

vi.mock("@/modules/saas-billing/application/webhook-service", () => ({
  hasSaasBillingWebhookMarker: vi.fn(() => false),
  processSaasBillingWebhook: vi.fn(),
}));

import { minimalBillingEventPayload } from "@/lib/stripe/billing-events-service";
import { processConnectEvent } from "@/lib/stripe/connect-webhook-handler";
import { processWebhookEvent } from "@/lib/stripe/webhook-handler";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const ACCOUNT_ID = "acct_minimal_academy";
const CREATED = 1_792_417_200;

// Datos de quien paga que nunca deben acabar en la fila.
const PAYER_DATA = [
  "Ana Pérez García",
  "familia.perez@example.com",
  "+34600111222",
  "Calle Mayor 12",
  "28013",
  "Madrid",
  "9871",
];

const ADDRESS = {
  line1: "Calle Mayor 12",
  postal_code: "28013",
  city: "Madrid",
  country: "ES",
};

function paymentIntentWithPayerData() {
  return {
    id: "pi_minimal_payload",
    object: "payment_intent",
    amount: 4500,
    currency: "eur",
    status: "succeeded",
    receipt_email: "familia.perez@example.com",
    shipping: { name: "Ana Pérez García", phone: "+34600111222", address: ADDRESS },
    metadata: { guardian_name: "Ana Pérez García" },
    latest_charge: {
      id: "ch_minimal_payload",
      object: "charge",
      billing_details: {
        name: "Ana Pérez García",
        email: "familia.perez@example.com",
        phone: "+34600111222",
        address: ADDRESS,
      },
      payment_method_details: { card: { brand: "visa", last4: "9871" } },
    },
  };
}

function connectEvent(id: string, type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-08-26.dahlia",
    type,
    account: ACCOUNT_ID,
    livemode: false,
    created: CREATED,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

function expectedMinimal(id: string, type: string, objectId: string, objectKind: string) {
  return {
    id,
    type,
    account: ACCOUNT_ID,
    livemode: false,
    created: CREATED,
    data: { object: { id: objectId, object: objectKind } },
  };
}

/** Todo lo que la base simulada recibió o guarda, como texto. */
function everythingWritten() {
  return JSON.stringify({
    rows: [...dbState.rows.values()],
    inserts: dbState.inserts,
    updates: dbState.updates,
  });
}

function seedRow(stripeEventId: string, status: string, lastAttemptAt: Date) {
  dbState.rows.set(stripeEventId, {
    id: "be_seeded",
    stripeEventId,
    status,
    attemptCount: 1,
    lastAttemptAt,
    payload: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  dbState.rows.clear();
  dbState.currentEventId = null;
  dbState.inserts.length = 0;
  dbState.updates.length = 0;
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.syncConnectAccountFromStripe.mockResolvedValue(undefined);
  mocks.succeeded.mockResolvedValue(undefined);
  mocks.handleSubscriptionEvent.mockResolvedValue({
    academyId: null,
    tenantId: null,
    userId: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Webhook antiguo de cuentas conectadas: billing_events.payload mínimo", () => {
  it("evento de cuenta conectada → billing_events.payload solo con id, type, account, livemode, created y data.object.{id,object}", async () => {
    const account = {
      id: ACCOUNT_ID,
      object: "account",
      email: "familia.perez@example.com",
      business_profile: { name: "Ana Pérez García", support_phone: "+34600111222" },
      company: { address: ADDRESS },
    };
    const event = connectEvent("evt_minimal_account", "account.updated", account);

    await expect(processConnectEvent(event)).resolves.toEqual({
      duplicate: false,
      rejected: false,
    });

    // El procesamiento sigue recibiendo el objeto entero de Stripe.
    expect(mocks.syncConnectAccountFromStripe).toHaveBeenCalledWith(account);

    const expected = expectedMinimal("evt_minimal_account", "account.updated", ACCOUNT_ID, "account");
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].payload).toEqual(expected);
    expect(Object.keys(dbState.inserts[0].payload as object).sort()).toEqual(
      ["account", "created", "data", "id", "livemode", "type"]
    );
    expect(dbState.rows.get("evt_minimal_account")?.payload).toEqual(expected);
    expect(dbState.rows.get("evt_minimal_account")?.status).toBe("processed");
    // Las demás columnas no cambian.
    expect(dbState.inserts[0]).toMatchObject({
      stripeEventId: "evt_minimal_account",
      type: "account.updated",
      stripeObjectId: ACCOUNT_ID,
      livemode: false,
      stripeCreatedAt: new Date(CREATED * 1000),
    });
    for (const value of PAYER_DATA) {
      expect(everythingWritten()).not.toContain(value);
    }
  });

  it("payment_intent.succeeded con billing_details → ningún nombre, correo ni dirección en la fila", async () => {
    const paymentIntent = paymentIntentWithPayerData();
    const event = connectEvent("evt_minimal_pi", "payment_intent.succeeded", paymentIntent);

    await expect(processConnectEvent(event)).resolves.toEqual({
      duplicate: false,
      rejected: false,
    });

    expect(mocks.succeeded).toHaveBeenCalledWith(paymentIntent, ACCOUNT_ID, false);
    expect(dbState.rows.get("evt_minimal_pi")?.payload).toEqual(
      expectedMinimal("evt_minimal_pi", "payment_intent.succeeded", "pi_minimal_payload", "payment_intent")
    );
    const written = everythingWritten();
    for (const value of PAYER_DATA) {
      expect(written).not.toContain(value);
    }
    expect(written).not.toContain("billing_details");
    expect(written).not.toContain("receipt_email");
  });

  it("reintento de un evento conectado → sigue mínimo (también en la reclamación)", async () => {
    // Fila de un intento anterior que falló: se reclama con UPDATE, no INSERT.
    seedRow("evt_minimal_retry", "error", new Date(NOW.getTime() - 10 * 60 * 1000));
    const event = connectEvent(
      "evt_minimal_retry",
      "payment_intent.succeeded",
      paymentIntentWithPayerData()
    );

    await expect(processConnectEvent(event)).resolves.toEqual({
      duplicate: false,
      rejected: false,
    });

    const expected = expectedMinimal(
      "evt_minimal_retry",
      "payment_intent.succeeded",
      "pi_minimal_payload",
      "payment_intent"
    );
    // Primera escritura tras el INSERT ignorado: la reclamación.
    expect(dbState.updates[0]).toMatchObject({ status: "processing", payload: expected });
    const row = dbState.rows.get("evt_minimal_retry");
    expect(row?.payload).toEqual(expected);
    expect(row?.attemptCount).toBe(2);
    expect(row?.status).toBe("processed");
    expect(mocks.succeeded).toHaveBeenCalledTimes(1);
    const written = everythingWritten();
    for (const value of PAYER_DATA) {
      expect(written).not.toContain(value);
    }
  });

  it("evento sin cuenta ni objeto reconocible → resumen con null, nunca el evento", () => {
    const event = {
      id: "evt_minimal_bare",
      object: "event",
      type: "account.updated",
      livemode: false,
      created: CREATED,
      data: { object: { email: "familia.perez@example.com" } },
    } as unknown as Stripe.Event;

    expect(minimalBillingEventPayload(event)).toEqual({
      id: "evt_minimal_bare",
      type: "account.updated",
      account: null,
      livemode: false,
      created: CREATED,
      data: { object: { id: null, object: null } },
    });
  });

  it("webhook de la plataforma (suscripción) sigue guardando el evento completo", async () => {
    const event = {
      id: "evt_platform_full",
      object: "event",
      type: "customer.subscription.updated",
      livemode: false,
      created: CREATED,
      data: {
        object: {
          id: "sub_platform_full",
          object: "subscription",
          customer: "cus_platform_full",
          metadata: { academyId: "academy-platform" },
        },
      },
    } as unknown as Stripe.Event;

    await expect(processWebhookEvent(event)).resolves.toMatchObject({ duplicate: false });

    expect(mocks.handleSubscriptionEvent).toHaveBeenCalledTimes(1);
    expect(dbState.inserts).toHaveLength(1);
    expect(dbState.inserts[0].payload).toBe(event);
    expect(dbState.rows.get("evt_platform_full")?.payload).toBe(event);
  });

  it("webhook de la plataforma: el reintento también guarda el evento completo", async () => {
    seedRow("evt_platform_retry", "error", new Date(NOW.getTime() - 10 * 60 * 1000));
    const event = {
      id: "evt_platform_retry",
      object: "event",
      type: "customer.subscription.updated",
      livemode: false,
      created: CREATED,
      data: { object: { id: "sub_platform_retry", object: "subscription" } },
    } as unknown as Stripe.Event;

    await expect(processWebhookEvent(event)).resolves.toMatchObject({ duplicate: false });

    expect(dbState.updates[0]).toMatchObject({ status: "processing" });
    expect(dbState.updates[0].payload).toBe(event);
    expect(dbState.rows.get("evt_platform_retry")?.payload).toBe(event);
  });

  it("idempotencia del webhook antiguo igual que antes", async () => {
    const event = connectEvent(
      "evt_minimal_idempotent",
      "payment_intent.succeeded",
      paymentIntentWithPayerData()
    );

    // Primera entrega: se procesa y queda `processed`.
    await expect(processConnectEvent(event)).resolves.toEqual({
      duplicate: false,
      rejected: false,
    });
    expect(dbState.rows.get("evt_minimal_idempotent")?.status).toBe("processed");
    const updatesAfterFirst = dbState.updates.length;

    // Reenvío del mismo evento: duplicado, sin volver a procesar ni a escribir.
    await expect(processConnectEvent(event)).resolves.toEqual({
      duplicate: true,
      rejected: false,
    });
    expect(mocks.succeeded).toHaveBeenCalledTimes(1);
    expect(dbState.updates).toHaveLength(updatesAfterFirst);
    expect(dbState.rows.size).toBe(1);

    // Evento que otro proceso tiene en curso (dentro del plazo): duplicado.
    seedRow("evt_minimal_in_flight", "processing", new Date(NOW.getTime() - 60 * 1000));
    const inFlight = connectEvent(
      "evt_minimal_in_flight",
      "payment_intent.succeeded",
      paymentIntentWithPayerData()
    );
    await expect(processConnectEvent(inFlight)).resolves.toEqual({
      duplicate: true,
      rejected: false,
    });
    expect(mocks.succeeded).toHaveBeenCalledTimes(1);
    expect(dbState.rows.get("evt_minimal_in_flight")?.payload).toBeNull();
  });
});
