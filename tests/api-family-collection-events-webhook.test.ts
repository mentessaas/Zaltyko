/**
 * Cobro automático de cuotas (Fase 4): ruta de eventos de Stripe de los cobros
 * a familias, POST /api/stripe/connect/payments-webhook. La firma se verifica
 * con el SDK real de Stripe (sin red: solo HMAC); el servicio que mira el
 * almacenamiento, la cuenta y el buzón se simula y la base no se toca. El
 * buzón real lo prueba tests/family-collection-events-pg.test.ts.
 * Sin reloj: la hora del sistema se fija en cada test.
 */
import Stripe from "stripe";

import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/stripe/client";
import { handleFamilyCollectionEvent } from "@/modules/family-collection/application/family-collection-events";
import { POST } from "@/app/api/stripe/connect/payments-webhook/route";

vi.mock("@/db", () => {
  const untouchable = () => {
    throw new Error("La ruta no debe tocar la base en estos tests");
  };
  return { db: { execute: vi.fn(untouchable), select: vi.fn(untouchable), transaction: vi.fn(untouchable) } };
});
// El cliente real (en tests, sin red: solo HMAC); un test lo hace fallar como sin clave.
vi.mock("@/lib/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/client")>();
  return { ...actual, getStripeClient: vi.fn(actual.getStripeClient) };
});
vi.mock("@/modules/family-collection/application/family-collection-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/family-collection/application/family-collection-events")>()),
  handleFamilyCollectionEvent: vi.fn(),
}));

// Valores sintéticos de prueba, no son secretos reales.
const SECRET = "whsec_synthetic_payments_value";
const ACCOUNTS_SECRET = "whsec_synthetic_accounts_value";
const LEGACY_CONNECT_SECRET = "whsec_synthetic_legacy_connect_value";
const ACCOUNT = "acct_1SyntheticAcademy01";
/** 20-11-2026 10:00 UTC, en segundos Unix. */
const SIGNED_AT = 1_795_168_800;

const signer = new Stripe("sk_test_synthetic_signer");

function stripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1SyntheticEvent0001",
    object: "event",
    type: "payment_intent.succeeded",
    account: ACCOUNT,
    livemode: false,
    created: SIGNED_AT - 5,
    data: {
      object: {
        id: "pi_3SyntheticIntent0001",
        object: "payment_intent",
        amount: 4500,
        receipt_email: "familia.prueba@example.invalid",
      },
    },
    ...overrides,
  };
}

function webhookRequest(body: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("https://zaltyko.test/api/stripe/connect/payments-webhook", {
    method: "POST",
    headers,
    body,
  });
}

function signedRequest(event: Record<string, unknown> = stripeEvent(), secret = SECRET) {
  const body = JSON.stringify(event);
  return webhookRequest(body, signer.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: SIGNED_AT }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(SIGNED_AT * 1000));
  vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET", ACCOUNTS_SECRET);
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", LEGACY_CONNECT_SECRET);
  vi.mocked(handleFamilyCollectionEvent).mockResolvedValue("processed");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function expectIgnored(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ignored: true });
}

describe("POST /api/stripe/connect/payments-webhook", () => {
  it("bandera apagada → 200 ignored sin verificar firma ni tocar la base", async () => {
    for (const value of ["false", "", "1", "TRUE"]) {
      vi.stubEnv("ZALTYKO_FAMILY_COLLECTION_EVENTS_ENABLED", value);
      // Firma inventada: si se verificara, sería un 400.
      const request = webhookRequest(JSON.stringify(stripeEvent()), "t=1,v1=bad");

      await expectIgnored(await POST(request));
      // Ni siquiera se lee el cuerpo.
      expect(request.bodyUsed).toBe(false);
    }
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["clave live de Stripe", "STRIPE_SECRET_KEY", "sk_live_synthetic"],
    ["clave restringida live", "STRIPE_SECRET_KEY", "rk_live_synthetic"],
    ["sin clave de Stripe reconocible", "STRIPE_SECRET_KEY", "otro"],
    ["URL pública de Supabase de producción", "NEXT_PUBLIC_SUPABASE_URL", "https://jegxfahsvugilbthbked.supabase.co"],
    [
      "pooler de la base de producción",
      "DATABASE_URL_POOL",
      "postgresql://postgres.jegxfahsvugilbthbked:placeholder@aws-0-eu-north-1.pooler.supabase.com:6543/postgres",
    ],
  ])("clave live o base de producción (%s) → 200 ignored", async (_label, name, value) => {
    vi.stubEnv(name, value);
    const request = signedRequest();

    await expectIgnored(await POST(request));
    expect(request.bodyUsed).toBe(false);
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
  });

  it("sin secreto → 503; sin firma o firma de otro secreto → 400", async () => {
    vi.stubEnv("STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET", "");
    const unconfigured = await POST(signedRequest());
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toEqual({ error: "WEBHOOK_NOT_CONFIGURED" });

    vi.stubEnv("STRIPE_CONNECT_PAYMENTS_WEBHOOK_SECRET", SECRET);
    const unsigned = await POST(webhookRequest(JSON.stringify(stripeEvent()), null));
    expect(unsigned.status).toBe(400);
    expect(await unsigned.json()).toEqual({ error: "SIGNATURE_VERIFICATION_FAILED" });

    // Firmado con el secreto del webhook de cuentas (Fase 1), con el del
    // webhook histórico o con uno cualquiera: solo vale el secreto propio.
    for (const secret of [ACCOUNTS_SECRET, LEGACY_CONNECT_SECRET, "whsec_synthetic_random_value"]) {
      const response = await POST(signedRequest(stripeEvent(), secret));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "SIGNATURE_VERIFICATION_FAILED" });
    }
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
  });

  it("revisión del coordinador (punto 3): sin cliente de Stripe (falta STRIPE_SECRET_KEY en el servidor) → 503 STRIPE_NOT_CONFIGURED, no 400, sin registrar la clave", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.mocked(getStripeClient).mockImplementationOnce(() => {
      throw new Error("STRIPE_SECRET_KEY debe estar definido para operaciones de suscripción");
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "STRIPE_NOT_CONFIGURED" });
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
    // No se confunde con una firma no válida.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), undefined, { stripeKeyConfigured: false });
    // Ni la clave, ni el secreto del webhook, ni el mensaje del error.
    const logged = JSON.stringify([errorSpy.mock.calls, warnSpy.mock.calls]);
    for (const value of ["sk_test_synthetic", SECRET, "debe estar definido"]) {
      expect(logged).not.toContain(value);
    }
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    // Con el cliente de vuelta, la misma entrega se procesa (Stripe la reenvía).
    const resent = await POST(signedRequest());
    expect(resent.status).toBe(200);
    expect(await resent.json()).toEqual({ received: true });
  });

  it("revisión del coordinador (punto 2): bandera encendida sin las tablas de las Fases 1–4 → 503 para que Stripe lo reenvíe (nunca 200)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.mocked(handleFamilyCollectionEvent).mockResolvedValueOnce("storage_unavailable");

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "EVENTS_STORAGE_UNAVAILABLE" });
    // Solo ids en el registro.
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), undefined, {
      eventId: "evt_1SyntheticEvent0001",
      eventType: "payment_intent.succeeded",
      accountId: ACCOUNT,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("familia.prueba");
    errorSpy.mockRestore();
  });

  it("evento livemode true → 200 ignored sin llegar al buzón", async () => {
    await expectIgnored(await POST(signedRequest(stripeEvent({ livemode: true }))));
    await expectIgnored(await POST(signedRequest(stripeEvent({ livemode: undefined }))));
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
  });

  it("tipo fuera de la lista, sin cuenta conectada u objeto inesperado → 200 ignored sin llegar al buzón", async () => {
    await expectIgnored(await POST(signedRequest(stripeEvent({ type: "customer.updated" }))));
    await expectIgnored(await POST(signedRequest(stripeEvent({ account: undefined }))));
    await expectIgnored(
      await POST(signedRequest(stripeEvent({ data: { object: { id: "ch_3Synthetic", object: "charge" } } })))
    );
    expect(handleFamilyCollectionEvent).not.toHaveBeenCalled();
  });

  it("evento válido → el servicio recibe solo ids, tipo, cuenta y fecha; 200 received", async () => {
    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ received: true });
    expect(handleFamilyCollectionEvent).toHaveBeenCalledTimes(1);
    expect(handleFamilyCollectionEvent).toHaveBeenCalledWith({
      eventId: "evt_1SyntheticEvent0001",
      type: "payment_intent.succeeded",
      accountId: ACCOUNT,
      livemode: false,
      created: SIGNED_AT - 5,
      objectId: "pi_3SyntheticIntent0001",
      objectType: "payment_intent",
    });
  });

  it("mismo evt_ dos veces: la segunda, ya procesado, responde 200 duplicate", async () => {
    vi.mocked(handleFamilyCollectionEvent).mockResolvedValueOnce("processed").mockResolvedValueOnce("duplicate");

    expect(await (await POST(signedRequest())).json()).toEqual({ received: true });
    const second = await POST(signedRequest());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
  });

  it("evento que otra entrega está procesando → 503 EVENT_IN_PROGRESS para que Stripe lo reenvíe", async () => {
    vi.mocked(handleFamilyCollectionEvent).mockResolvedValueOnce("in_progress");

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ error: "EVENT_IN_PROGRESS" });
  });

  it("cuenta acct_ desconocida o de otro entorno (el servicio la ignora) → 200 ignored", async () => {
    vi.mocked(handleFamilyCollectionEvent).mockResolvedValueOnce("ignored");

    await expectIgnored(await POST(signedRequest()));
  });

  it("manejador que lanza → 500 PROCESSING_FAILED sin detalles; en el registro solo ids y el código", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.mocked(handleFamilyCollectionEvent).mockRejectedValueOnce(
      Object.assign(new Error("La tarjeta de Ana Prueba fue rechazada"), { type: "StripeCardError", code: "card_declined" })
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "PROCESSING_FAILED" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), undefined, {
      eventId: "evt_1SyntheticEvent0001",
      eventType: "payment_intent.succeeded",
      accountId: ACCOUNT,
      errorName: "Error",
      errorCode: "card_declined",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("Ana Prueba");
    errorSpy.mockRestore();
  });
});
