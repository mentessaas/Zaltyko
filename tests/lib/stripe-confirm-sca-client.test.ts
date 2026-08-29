import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobertura del helper de cliente `confirmScaChallenge`. La pieza crítica
 * que valida QA-ZAL-408:
 *
 *   1. Cuando `details.paymentMethodId` está presente, `confirmCardPayment`
 *      se llama con `{ payment_method }` para que el reto 3DS se abra (Stripe
 *      limpia el PM del PI cuando off-session lanza `authentication_required`,
 *      sin re-attach da `payment_intent_unexpected_state`).
 *   2. Si Stripe responde `payment_intent_unexpected_state` en el primer
 *      intento, reintentamos con el PM explícitamente.
 *   3. Si Stripe confirma `succeeded`, devolvemos `ok: true`.
 */

const mocks = vi.hoisted(() => ({
  loadStripe: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: (...args: unknown[]) => mocks.loadStripe(...args),
}));

let confirmScaChallenge: typeof import("@/lib/stripe/confirm-sca-client").confirmScaChallenge;
let parseScaRecoveryDetails: typeof import("@/lib/stripe/confirm-sca-client").parseScaRecoveryDetails;

const baseDetails = {
  paymentIntentId: "pi_1",
  clientSecret: "pi_1_secret",
  stripeAccountId: "acct_1",
  publishableKey: "pk_test_123",
  paymentMethodId: "pm_1",
};

beforeEach(async () => {
  vi.clearAllMocks();
  if (!confirmScaChallenge) {
    const mod = await import("@/lib/stripe/confirm-sca-client");
    confirmScaChallenge = mod.confirmScaChallenge;
    parseScaRecoveryDetails = mod.parseScaRecoveryDetails;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("confirmScaChallenge — propagacion de paymentMethodId", () => {
  it("pasa payment_method al confirmar para que el reto 3DS se abra", async () => {
    const confirmCardPayment = vi.fn().mockResolvedValue({
      error: null,
      paymentIntent: { status: "succeeded" },
    });
    mocks.loadStripe.mockResolvedValue({ confirmCardPayment });

    const result = await confirmScaChallenge(baseDetails);

    expect(result).toEqual({ ok: true });
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
    // Primer (y único) intento: con payment_method para abrir el reto.
    expect(confirmCardPayment).toHaveBeenCalledWith(baseDetails.clientSecret, {
      payment_method: "pm_1",
    });
  });

  it("reintenta con payment_method si Stripe responde payment_intent_unexpected_state", async () => {
    const confirmCardPayment = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: "payment_intent_unexpected_state", message: "missing a payment method" },
        paymentIntent: null,
      })
      .mockResolvedValueOnce({
        error: null,
        paymentIntent: { status: "succeeded" },
      });
    mocks.loadStripe.mockResolvedValue({ confirmCardPayment });

    const result = await confirmScaChallenge(baseDetails);

    expect(result).toEqual({ ok: true });
    expect(confirmCardPayment).toHaveBeenCalledTimes(2);
    expect(confirmCardPayment).toHaveBeenNthCalledWith(1, baseDetails.clientSecret, {
      payment_method: "pm_1",
    });
    expect(confirmCardPayment).toHaveBeenNthCalledWith(2, baseDetails.clientSecret, {
      payment_method: "pm_1",
    });
  });

  it("sin paymentMethodId, confirma sin adjuntar PM (compatibilidad hacia atrás)", async () => {
    const confirmCardPayment = vi.fn().mockResolvedValue({
      error: null,
      paymentIntent: { status: "succeeded" },
    });
    mocks.loadStripe.mockResolvedValue({ confirmCardPayment });

    const { paymentMethodId: _ignored, ...legacyDetails } = baseDetails;
    void _ignored;

    const result = await confirmScaChallenge(legacyDetails);

    expect(result).toEqual({ ok: true });
    expect(confirmCardPayment).toHaveBeenCalledWith(baseDetails.clientSecret, {});
  });

  it("devuelve ok:false con el mensaje de Stripe si el reto falla tras reintento", async () => {
    const confirmCardPayment = vi.fn().mockResolvedValue({
      error: { code: "payment_intent_unexpected_state", message: "missing a payment method" },
      paymentIntent: null,
    });
    mocks.loadStripe.mockResolvedValue({ confirmCardPayment });

    const result = await confirmScaChallenge(baseDetails);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("missing a payment method");
    }
    expect(confirmCardPayment).toHaveBeenCalledTimes(2);
  });

  it("carga Stripe sobre la cuenta conectada de la academia", async () => {
    const confirmCardPayment = vi.fn().mockResolvedValue({
      error: null,
      paymentIntent: { status: "processing" },
    });
    mocks.loadStripe.mockResolvedValue({ confirmCardPayment });

    await confirmScaChallenge(baseDetails);

    expect(mocks.loadStripe).toHaveBeenCalledWith("pk_test_123", {
      stripeAccount: "acct_1",
    });
  });
});

describe("parseScaRecoveryDetails", () => {
  it("acepta el payload completo con paymentMethodId", () => {
    const parsed = parseScaRecoveryDetails({
      paymentIntentId: "pi_x",
      clientSecret: "pi_x_secret",
      stripeAccountId: "acct_x",
      publishableKey: "pk_x",
      paymentMethodId: "pm_x",
    });
    expect(parsed?.paymentMethodId).toBe("pm_x");
  });

  it("sigue aceptando payload sin paymentMethodId (compatibilidad)", () => {
    const parsed = parseScaRecoveryDetails({
      paymentIntentId: "pi_y",
      clientSecret: "pi_y_secret",
      stripeAccountId: "acct_y",
      publishableKey: "pk_y",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.paymentMethodId).toBeUndefined();
  });

  it("rechaza payload sin campos requeridos", () => {
    expect(parseScaRecoveryDetails(null)).toBeNull();
    expect(parseScaRecoveryDetails({ paymentIntentId: "pi" })).toBeNull();
  });
});
