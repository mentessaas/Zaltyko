/**
 * Conectar Stripe (Fase 1): webhook de eventos thin v2 de las cuentas
 * conectadas. El adaptador de Stripe y el servicio se simulan: ninguna
 * llamada sale a Stripe ni a la base de datos.
 */
import { syncConnectAccountFromEvent } from "@/modules/payments-connect/application/connect-onboarding-service";
import { POST } from "@/app/api/stripe/connect/accounts-webhook/route";

const mocks = vi.hoisted(() => ({
  parseAccountEvent: vi.fn(),
}));

vi.mock("@/modules/payments-connect/application/connect-onboarding-service", () => ({
  syncConnectAccountFromEvent: vi.fn(),
}));
vi.mock("@/modules/payments-connect/infrastructure/stripe-connect-gateway", () => ({
  createStripeConnectGateway: () => ({ parseAccountEvent: mocks.parseAccountEvent }),
}));

// Valor sintético de prueba, no es un secreto real.
const SECRET = "whsec_synthetic_test_value";
const RAW_BODY = "{\"id\":\"evt_synthetic\",\"object\":\"v2.core.event\"}";
const ACCOUNT_ID = "acct_1Synthetic000001";

function webhookRequest(signature: string | null = "t=1,v1=synthetic") {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("https://zaltyko.test/api/stripe/connect/accounts-webhook", {
    method: "POST",
    headers,
    body: RAW_BODY,
  });
}

function accountEvent(type: string, accountId: string | null = ACCOUNT_ID) {
  return { eventId: "evt_synthetic_000001", type, accountId, livemode: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "true");
  vi.stubEnv("STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET", SECRET);
  vi.mocked(syncConnectAccountFromEvent).mockResolvedValue("synced");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/connect/accounts-webhook", () => {
  it("sin stripe-signature responde 400 sin verificar ni procesar", async () => {
    const response = await POST(webhookRequest(null));

    expect(response.status).toBe(400);
    expect(mocks.parseAccountEvent).not.toHaveBeenCalled();
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it("con firma inválida responde 400 sin procesar", async () => {
    mocks.parseAccountEvent.mockImplementation(() => {
      const error = new Error("No signatures found matching the expected signature");
      error.name = "StripeSignatureVerificationError";
      throw error;
    });

    const response = await POST(webhookRequest("t=1,v1=bad"));

    expect(response.status).toBe(400);
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it("verifica la firma sobre el cuerpo crudo con el secreto propio", async () => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent("v2.core.account[requirements].updated"));

    await POST(webhookRequest("t=1,v1=synthetic"));

    expect(mocks.parseAccountEvent).toHaveBeenCalledWith(RAW_BODY, "t=1,v1=synthetic", SECRET);
  });

  it("con la bandera apagada responde 200 { ignored: true } sin verificar ni procesar", async () => {
    vi.stubEnv("ZALTYKO_CONNECT_ONBOARDING_ENABLED", "false");

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(mocks.parseAccountEvent).not.toHaveBeenCalled();
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["la URL pública de Supabase", "NEXT_PUBLIC_SUPABASE_URL", "https://jegxfahsvugilbthbked.supabase.co"],
    [
      "la conexión del pooler",
      "DATABASE_URL_POOL",
      "postgresql://postgres.jegxfahsvugilbthbked:placeholder@aws-0-eu-north-1.pooler.supabase.com:6543/postgres",
    ],
  ])("R11: si %s apunta a producción responde 200 { ignored: true } sin verificar ni procesar", async (_label, name, value) => {
    vi.stubEnv(name, value);

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(mocks.parseAccountEvent).not.toHaveBeenCalled();
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it("sin STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET responde 503", async () => {
    vi.stubEnv("STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET", "");

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    expect(mocks.parseAccountEvent).not.toHaveBeenCalled();
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it("un tipo no tratado (v2.core.account_link.returned) se ignora con 200 sin llamar al servicio", async () => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent("v2.core.account_link.returned", null));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it("un tipo tratado sin cuenta relacionada se ignora sin llamar al servicio", async () => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent("v2.core.account[requirements].updated", null));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(syncConnectAccountFromEvent).not.toHaveBeenCalled();
  });

  it.each([
    "v2.core.account[requirements].updated",
    "v2.core.account[configuration.merchant].capability_status_updated",
    "v2.core.account.closed",
  ])("%s sincroniza la cuenta del related_object", async (type) => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent(type));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(syncConnectAccountFromEvent).toHaveBeenCalledTimes(1);
    expect(syncConnectAccountFromEvent).toHaveBeenCalledWith({
      eventId: "evt_synthetic_000001",
      accountId: ACCOUNT_ID,
      livemode: false,
    });
  });

  it("si el servicio ignora el evento (otra cuenta u otro entorno) responde 200 { ignored: true }", async () => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent("v2.core.account[requirements].updated"));
    vi.mocked(syncConnectAccountFromEvent).mockResolvedValue("ignored");

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
  });

  it("si el servicio lanza (Stripe o la base de datos) responde 500 para que Stripe reintente", async () => {
    mocks.parseAccountEvent.mockReturnValue(accountEvent("v2.core.account[requirements].updated"));
    vi.mocked(syncConnectAccountFromEvent).mockRejectedValue(new Error("detalle interno de la base de datos"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("detalle interno");
  });
});
