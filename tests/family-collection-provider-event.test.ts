/**
 * Cobro automático de cuotas (Fase 4): eventos de Stripe de las cuentas
 * conectadas. Reparto por tipo (`routeProviderEvent`), verificación de la
 * firma con el SDK real de Stripe (sin red: solo HMAC) y orquestación de
 * `handleFamilyCollectionEvent` con el almacenamiento, la cuenta y el buzón
 * simulados. El buzón real lo prueba tests/family-collection-events-pg.test.ts.
 * Sin reloj: la hora del sistema se fija en cada test que la necesita.
 */
import Stripe from "stripe";

import { handleFamilyCollectionEvent } from "@/modules/family-collection/application/family-collection-events";
import { isFamilyCollectionEventsStorageAvailable } from "@/modules/family-collection/application/storage";
import {
  FAMILY_COLLECTION_EVENT_TYPES,
  providerEventErrorCode,
  providerEventPayload,
  routeProviderEvent,
  type ConnectedAccountEvent,
} from "@/modules/family-collection/domain/provider-event";
import {
  claimProviderEvent,
  finishProviderEvent,
  providerEventPayloadSha256,
} from "@/modules/family-collection/infrastructure/provider-event-inbox";
import { parseConnectedAccountEvent } from "@/modules/family-collection/infrastructure/stripe-event-gateway";
import { isFamilyPaymentMethodsStorageAvailable } from "@/modules/family-payment-methods/application/storage";
import { isConnectOnboardingStorageAvailable } from "@/modules/payments-connect/application/storage";
import {
  findConnectAccountByReference,
  type StoredConnectAccount,
} from "@/modules/payments-connect/infrastructure/connect-account-store";

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(() => {
      throw new Error("Este test no debe tocar la base");
    }),
  },
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionEventsStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/family-payment-methods/application/storage", () => ({
  isFamilyPaymentMethodsStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/payments-connect/application/storage", () => ({
  isConnectOnboardingStorageAvailable: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/connect-account-store", () => ({
  findConnectAccountByReference: vi.fn(),
}));
vi.mock("@/modules/family-collection/infrastructure/provider-event-inbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/infrastructure/provider-event-inbox")>()),
  claimProviderEvent: vi.fn(),
  finishProviderEvent: vi.fn(),
}));

// Valores sintéticos de prueba, no son secretos reales.
const SECRET = "whsec_synthetic_payments_value";
const OTHER_SECRET = "whsec_synthetic_other_value";
const ACCOUNT = "acct_1SyntheticAcademy01";
/** Segundos Unix fijos de la firma (20-11-2026 10:00 UTC). */
const SIGNED_AT = 1_795_168_800;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const INBOX_ID = "22222222-2222-4222-8222-222222222222";

const signer = new Stripe("sk_test_synthetic_signer");

function stripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1SyntheticEvent0001",
    object: "event",
    api_version: "2026-08-26.dahlia",
    type: "payment_intent.succeeded",
    account: ACCOUNT,
    livemode: false,
    created: SIGNED_AT - 5,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "pi_3SyntheticIntent0001",
        object: "payment_intent",
        amount: 4500,
        currency: "eur",
        receipt_email: "familia.prueba@example.invalid",
        shipping: { name: "Ana Prueba" },
        metadata: { zaltyko_collection_attempt_id: "33333333-3333-4333-8333-333333333333" },
      },
    },
    ...overrides,
  };
}

function sign(payload: string, secret = SECRET, timestamp = SIGNED_AT) {
  return signer.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

function connectedEvent(overrides: Partial<ConnectedAccountEvent> = {}): ConnectedAccountEvent {
  return {
    eventId: "evt_1SyntheticEvent0001",
    type: "payment_intent.succeeded",
    accountId: ACCOUNT,
    livemode: false,
    created: SIGNED_AT - 5,
    objectId: "pi_3SyntheticIntent0001",
    objectType: "payment_intent",
    ...overrides,
  };
}

const ACCOUNT_ROW: StoredConnectAccount = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId: ORGANIZATION_ID,
  environment: "test",
  providerAccountReference: ACCOUNT,
  status: "active",
  cardPaymentsCapabilityStatus: "active",
  sepaDebitPaymentsCapabilityStatus: "active",
  requirementsState: "none",
  revision: 1,
  lastSyncedAt: null,
};

describe("routeProviderEvent", () => {
  const cases: Array<[type: string, objectType: string, objectId: string, route: Record<string, string>]> = [
    ["payment_intent.processing", "payment_intent", "pi_1A", { kind: "payment_intent", paymentIntentId: "pi_1A" }],
    ["payment_intent.succeeded", "payment_intent", "pi_1B", { kind: "payment_intent", paymentIntentId: "pi_1B" }],
    ["payment_intent.payment_failed", "payment_intent", "pi_1C", { kind: "payment_intent", paymentIntentId: "pi_1C" }],
    ["payment_intent.requires_action", "payment_intent", "pi_1D", { kind: "payment_intent", paymentIntentId: "pi_1D" }],
    ["payment_intent.canceled", "payment_intent", "pi_1E", { kind: "payment_intent", paymentIntentId: "pi_1E" }],
    ["charge.refunded", "charge", "ch_1F", { kind: "charge", chargeId: "ch_1F" }],
    ["charge.refunded", "charge", "py_1G", { kind: "charge", chargeId: "py_1G" }],
    ["refund.created", "refund", "re_1H", { kind: "refund", refundId: "re_1H" }],
    ["refund.updated", "refund", "pyr_1I", { kind: "refund", refundId: "pyr_1I" }],
    ["refund.failed", "refund", "re_1J", { kind: "refund", refundId: "re_1J" }],
    ["charge.dispute.created", "dispute", "dp_1K", { kind: "dispute", disputeId: "dp_1K" }],
    ["charge.dispute.updated", "dispute", "du_1L", { kind: "dispute", disputeId: "du_1L" }],
    ["charge.dispute.closed", "dispute", "dp_1M", { kind: "dispute", disputeId: "dp_1M" }],
    ["charge.dispute.funds_withdrawn", "dispute", "dp_1N", { kind: "dispute", disputeId: "dp_1N" }],
    ["charge.dispute.funds_reinstated", "dispute", "dp_1O", { kind: "dispute", disputeId: "dp_1O" }],
    ["mandate.updated", "mandate", "mandate_1P", { kind: "mandate", mandateId: "mandate_1P" }],
    ["payment_method.detached", "payment_method", "pm_1Q", { kind: "payment_method", paymentMethodId: "pm_1Q" }],
    ["setup_intent.succeeded", "setup_intent", "seti_1R", { kind: "setup_intent", setupIntentId: "seti_1R" }],
  ];

  it("cada tipo de la lista va a su ruta; la lista tiene exactamente esos 17 tipos", () => {
    for (const [type, objectType, objectId, route] of cases) {
      expect(routeProviderEvent(connectedEvent({ type, objectType, objectId })), type).toEqual(route);
    }
    expect([...FAMILY_COLLECTION_EVENT_TYPES].sort()).toEqual([...new Set(cases.map(([type]) => type))].sort());
    expect(FAMILY_COLLECTION_EVENT_TYPES.size).toBe(17);
  });

  it("prefijo u objeto inesperado → ignored (object); tipo fuera de la lista → ignored (type)", () => {
    const object = { kind: "ignored", reason: "object" };
    // Prefijo de otro objeto para el tipo.
    expect(routeProviderEvent(connectedEvent({ objectId: "ch_1A" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ type: "refund.created", objectType: "refund", objectId: "py_1A" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ type: "charge.refunded", objectType: "charge", objectId: "pyr_1A" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ type: "charge.dispute.created", objectType: "dispute", objectId: "re_1A" }))).toEqual(object);
    // Sin id, con caracteres raros o solo el prefijo.
    expect(routeProviderEvent(connectedEvent({ objectId: null }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ objectId: "pi_" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ objectId: "pi_1A' or 1=1" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ objectId: `pi_${"a".repeat(251)}` }))).toEqual(object);
    // Objeto de otro tipo aunque el id cuadre.
    expect(routeProviderEvent(connectedEvent({ objectType: "charge" }))).toEqual(object);
    expect(routeProviderEvent(connectedEvent({ objectType: null }))).toEqual(object);

    const type = { kind: "ignored", reason: "type" };
    expect(routeProviderEvent(connectedEvent({ type: "customer.created", objectType: "customer", objectId: "cus_1A" }))).toEqual(type);
    expect(routeProviderEvent(connectedEvent({ type: "payment_intent.created" }))).toEqual(type);
    expect(routeProviderEvent(connectedEvent({ type: "" }))).toEqual(type);
  });
});

describe("parseConnectedAccountEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(SIGNED_AT * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifica la firma con el secreto propio y solo devuelve ids, tipo, cuenta, livemode y fecha", () => {
    const body = JSON.stringify(stripeEvent());
    const event = parseConnectedAccountEvent(body, sign(body), SECRET);

    expect(event).toEqual({
      eventId: "evt_1SyntheticEvent0001",
      type: "payment_intent.succeeded",
      accountId: ACCOUNT,
      livemode: false,
      created: SIGNED_AT - 5,
      objectId: "pi_3SyntheticIntent0001",
      objectType: "payment_intent",
    });
    // Nada del resto del cuerpo sale de la función.
    const serialized = JSON.stringify(event);
    for (const value of ["familia.prueba", "Ana Prueba", "4500", "zaltyko_collection_attempt_id", "eur"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("firma de otro secreto, cuerpo cambiado o firma caducada → lanza", () => {
    const body = JSON.stringify(stripeEvent());
    expect(() => parseConnectedAccountEvent(body, sign(body, OTHER_SECRET), SECRET)).toThrow();
    expect(() => parseConnectedAccountEvent(body.replace("4500", "1"), sign(body), SECRET)).toThrow();
    // Tolerancia de 300 s: firmado hace 301 s ya no vale; hace 299 s, sí.
    expect(() => parseConnectedAccountEvent(body, sign(body, SECRET, SIGNED_AT - 301), SECRET)).toThrow();
    expect(parseConnectedAccountEvent(body, sign(body, SECRET, SIGNED_AT - 299), SECRET).eventId).toBe(
      "evt_1SyntheticEvent0001"
    );
  });

  it("falla cerrado: livemode que no es false exacto cuenta como Live; cuenta que no es acct_ → null", () => {
    for (const livemode of [true, "false", null, undefined]) {
      const body = JSON.stringify(stripeEvent({ livemode }));
      expect(parseConnectedAccountEvent(body, sign(body), SECRET).livemode, String(livemode)).toBe(true);
    }
    for (const account of [undefined, null, "", "cus_1A", 42]) {
      const body = JSON.stringify(stripeEvent({ account }));
      expect(parseConnectedAccountEvent(body, sign(body), SECRET).accountId, String(account)).toBeNull();
    }
    const body = JSON.stringify(stripeEvent({ data: { object: null } }));
    expect(parseConnectedAccountEvent(body, sign(body), SECRET)).toMatchObject({ objectId: null, objectType: null });
  });

  it("un cuerpo firmado sin id de evento → lanza", () => {
    const body = JSON.stringify(stripeEvent({ id: undefined }));
    expect(() => parseConnectedAccountEvent(body, sign(body), SECRET)).toThrow("FAMILY_COLLECTION_MALFORMED_EVENT");
  });
});

describe("contenido del buzón y código de error", () => {
  it("el buzón guarda solo type, account, objectType, objectId y created, con una huella estable", () => {
    const payload = providerEventPayload(connectedEvent());
    expect(Object.keys(payload).sort()).toEqual(["account", "created", "objectId", "objectType", "type"]);
    expect(payload).toEqual({
      type: "payment_intent.succeeded",
      account: ACCOUNT,
      objectType: "payment_intent",
      objectId: "pi_3SyntheticIntent0001",
      created: SIGNED_AT - 5,
    });
    const sha = providerEventPayloadSha256(payload);
    expect(sha).toMatch(/^[a-f0-9]{64}$/);
    expect(providerEventPayloadSha256(providerEventPayload(connectedEvent()))).toBe(sha);
    expect(providerEventPayloadSha256(providerEventPayload(connectedEvent({ objectId: "pi_3Other" })))).not.toBe(sha);
  });

  it("solo el código, nunca el mensaje", () => {
    const stripeError = Object.assign(new Error("La tarjeta de Ana Prueba fue rechazada"), {
      type: "StripeCardError",
      code: "card_declined",
    });
    expect(providerEventErrorCode(stripeError)).toBe("card_declined");
    expect(providerEventErrorCode(new Error("LATE_SUCCESS_SIBLING_IN_FLIGHT"))).toBe("LATE_SUCCESS_SIBLING_IN_FLIGHT");
    expect(providerEventErrorCode(new TypeError("datos de Ana Prueba"))).toBe("TypeError");
    expect(providerEventErrorCode("texto suelto")).toBe("unknown");
  });
});

describe("handleFamilyCollectionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
    vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValue(true);
    vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValue(true);
    vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValue(true);
    vi.mocked(findConnectAccountByReference).mockResolvedValue(ACCOUNT_ROW);
    vi.mocked(claimProviderEvent).mockResolvedValue({ claim: "process", inboxId: INBOX_ID });
    vi.mocked(finishProviderEvent).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function expectNothingClaimed() {
    expect(claimProviderEvent).not.toHaveBeenCalled();
    expect(finishProviderEvent).not.toHaveBeenCalled();
  }

  it("bandera apagada, clave live o base de producción → ignored sin mirar la base", async () => {
    for (const [name, value] of [
      ["ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "false"],
      ["ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "TRUE"],
      ["STRIPE_SECRET_KEY", "sk_live_synthetic"],
      ["DATABASE_URL_POOL", "postgresql://postgres.jegxfahsvugilbthbked:placeholder@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"],
    ] as const) {
      vi.stubEnv(name, value);
      expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW }), name).toBe("ignored");
      vi.unstubAllEnvs();
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
    }
    expect(isFamilyCollectionEventsStorageAvailable).not.toHaveBeenCalled();
    expect(findConnectAccountByReference).not.toHaveBeenCalled();
    expectNothingClaimed();
  });

  it("evento livemode, sin cuenta, de otro tipo o con objeto inesperado → ignored sin mirar la base", async () => {
    for (const event of [
      connectedEvent({ livemode: true }),
      connectedEvent({ accountId: null }),
      connectedEvent({ type: "customer.created" }),
      connectedEvent({ objectId: "ch_1A" }),
    ]) {
      expect(await handleFamilyCollectionEvent(event, { now: NOW })).toBe("ignored");
    }
    expect(isFamilyCollectionEventsStorageAvailable).not.toHaveBeenCalled();
    expectNothingClaimed();
  });

  it("almacenamiento que no es el de las Fases 1–4 → ignored sin buzón", async () => {
    for (const missing of [
      // Forma "phase3" (o "none") del cobro: sin la Fase 4.
      () => vi.mocked(isFamilyCollectionEventsStorageAvailable).mockResolvedValueOnce(false),
      () => vi.mocked(isFamilyPaymentMethodsStorageAvailable).mockResolvedValueOnce(false),
      () => vi.mocked(isConnectOnboardingStorageAvailable).mockResolvedValueOnce(false),
    ]) {
      missing();
      expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW })).toBe("ignored");
    }
    expect(findConnectAccountByReference).not.toHaveBeenCalled();
    expectNothingClaimed();
  });

  it("cuenta acct_ desconocida o de otro entorno → ignored sin buzón; se busca solo en test", async () => {
    vi.mocked(findConnectAccountByReference).mockResolvedValueOnce(null);
    expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW })).toBe("ignored");
    vi.mocked(findConnectAccountByReference).mockResolvedValueOnce({ ...ACCOUNT_ROW, environment: "live" });
    expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW })).toBe("ignored");
    expect(findConnectAccountByReference).toHaveBeenCalledWith(expect.anything(), "test", ACCOUNT);
    expectNothingClaimed();
  });

  it("duplicate (ya procesado) → no llama a ningún manejador", async () => {
    const paymentIntent = vi.fn();
    vi.mocked(claimProviderEvent).mockResolvedValueOnce({ claim: "duplicate", inboxId: INBOX_ID });

    expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW, handlers: { paymentIntent } })).toBe("duplicate");
    expect(paymentIntent).not.toHaveBeenCalled();
    expect(finishProviderEvent).not.toHaveBeenCalled();
  });

  it("en curso en otra entrega → in_progress, sin manejador ni cierre (la ruta responde 503)", async () => {
    const paymentIntent = vi.fn();
    vi.mocked(claimProviderEvent).mockResolvedValueOnce({ claim: "in_progress", inboxId: INBOX_ID });

    expect(await handleFamilyCollectionEvent(connectedEvent(), { now: NOW, handlers: { paymentIntent } })).toBe(
      "in_progress"
    );
    expect(paymentIntent).not.toHaveBeenCalled();
    expect(finishProviderEvent).not.toHaveBeenCalled();
  });

  it("process → manejador del objeto con academia, cuenta, id, hora, fila del buzón y evt_; cierra processed", async () => {
    const effectId = "55555555-5555-4555-8555-555555555555";
    const paymentIntent = vi.fn().mockResolvedValue({ effectType: "payment", effectId });
    const refund = vi.fn();

    expect(
      await handleFamilyCollectionEvent(connectedEvent(), { now: NOW, handlers: { paymentIntent, refund } })
    ).toBe("processed");

    expect(claimProviderEvent).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, event: connectedEvent(), now: NOW });
    expect(paymentIntent).toHaveBeenCalledTimes(1);
    expect(paymentIntent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      account: ACCOUNT_ROW,
      objectId: "pi_3SyntheticIntent0001",
      now: NOW,
      inboxId: INBOX_ID,
      eventId: "evt_1SyntheticEvent0001",
    });
    expect(refund).not.toHaveBeenCalled();
    expect(finishProviderEvent).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      status: "processed",
      effectType: "payment",
      effectId,
      errorCode: null,
      now: NOW,
    });
  });

  it("cada ruta llega a su manejador; sin manejador propio, el vacío (sin efecto)", async () => {
    const handlers = {
      paymentIntent: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      charge: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      refund: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      dispute: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      mandate: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      paymentMethod: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
      setupIntent: vi.fn().mockResolvedValue({ effectType: null, effectId: null }),
    };
    const routed: Array<[keyof typeof handlers, Partial<ConnectedAccountEvent>]> = [
      ["paymentIntent", { type: "payment_intent.requires_action" }],
      ["charge", { type: "charge.refunded", objectType: "charge", objectId: "py_1A" }],
      ["refund", { type: "refund.updated", objectType: "refund", objectId: "pyr_1A" }],
      ["dispute", { type: "charge.dispute.closed", objectType: "dispute", objectId: "dp_1A" }],
      ["mandate", { type: "mandate.updated", objectType: "mandate", objectId: "mandate_1A" }],
      ["paymentMethod", { type: "payment_method.detached", objectType: "payment_method", objectId: "pm_1A" }],
      ["setupIntent", { type: "setup_intent.succeeded", objectType: "setup_intent", objectId: "seti_1A" }],
    ];
    for (const [key, overrides] of routed) {
      expect(await handleFamilyCollectionEvent(connectedEvent(overrides), { now: NOW, handlers })).toBe("processed");
      expect(handlers[key], key).toHaveBeenCalledTimes(1);
      expect(handlers[key]).toHaveBeenCalledWith(expect.objectContaining({ objectId: overrides.objectId ?? "pi_3SyntheticIntent0001" }));
    }

    // Sin manejador propio, el vacío. (Los cobros ya tienen el suyo por
    // defecto desde la Tarea 3: lo prueban tests/family-collection-events*.)
    vi.mocked(finishProviderEvent).mockClear();
    expect(
      await handleFamilyCollectionEvent(
        connectedEvent({ type: "mandate.updated", objectType: "mandate", objectId: "mandate_1A" }),
        { now: NOW }
      )
    ).toBe("processed");
    expect(finishProviderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processed", effectType: null, effectId: null })
    );
  });

  it("manejador que lanza → fila failed con solo el código y el error sigue hacia la ruta", async () => {
    const failure = Object.assign(new Error("La tarjeta de Ana Prueba fue rechazada"), {
      type: "StripeCardError",
      code: "card_declined",
    });
    const paymentIntent = vi.fn().mockRejectedValue(failure);

    await expect(handleFamilyCollectionEvent(connectedEvent(), { now: NOW, handlers: { paymentIntent } })).rejects.toBe(failure);
    expect(finishProviderEvent).toHaveBeenCalledTimes(1);
    expect(finishProviderEvent).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      status: "failed",
      effectType: null,
      effectId: null,
      errorCode: "card_declined",
      now: NOW,
    });
    expect(JSON.stringify(vi.mocked(finishProviderEvent).mock.calls)).not.toContain("Ana Prueba");
  });

  it("si tampoco se puede marcar failed, el error original sigue hacia la ruta", async () => {
    const failure = new Error("LATE_SUCCESS_SIBLING_IN_FLIGHT");
    vi.mocked(finishProviderEvent).mockRejectedValueOnce(new Error("conexión perdida"));

    await expect(
      handleFamilyCollectionEvent(connectedEvent(), { now: NOW, handlers: { paymentIntent: vi.fn().mockRejectedValue(failure) } })
    ).rejects.toBe(failure);
  });
});
