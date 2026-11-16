import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: mocks.getStripeClient,
}));

import {
  createStripeFamilyGateway,
  familyCustomerIdempotencyKey,
  familySetupIntentIdempotencyKey,
  isAlreadyDetachedError,
} from "@/modules/family-payment-methods/infrastructure/stripe-family-gateway";

/**
 * Pago automático de cuotas (cobro automático, Fase 2): adaptador Stripe en
 * la cuenta conectada de la academia, con un cliente simulado. Nunca llama a
 * Stripe; solo datos sintéticos.
 */

const connectedAccount = "acct_synthetic_001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const familyPayerId = "20000000-0000-4000-8000-000000000002";
const providerAccountRowId = "30000000-0000-4000-8000-000000000003";
const attemptId = "40000000-0000-4000-8000-000000000004";
const customerId = "cus_synthetic_001";
const setupIntentId = "seti_synthetic_001";
const paymentMethodId = "pm_synthetic_001";
const mandateId = "mandate_synthetic_001";

function fakeStripe() {
  const fns = {
    customersCreate: vi.fn(),
    setupIntentsCreate: vi.fn(),
    setupIntentsRetrieve: vi.fn(),
    paymentMethodsDetach: vi.fn(),
  };
  const client = {
    customers: { create: fns.customersCreate },
    setupIntents: { create: fns.setupIntentsCreate, retrieve: fns.setupIntentsRetrieve },
    paymentMethods: { detach: fns.paymentMethodsDetach },
  } as unknown as Stripe;
  return { client, ...fns };
}

function setupIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: setupIntentId,
    object: "setup_intent",
    client_secret: "seti_synthetic_001_secret_synthetic",
    status: "succeeded",
    usage: "off_session",
    payment_method_types: ["sepa_debit"],
    customer: customerId,
    payment_method: {
      id: paymentMethodId,
      object: "payment_method",
      type: "sepa_debit",
      // Campos que el adaptador nunca debe devolver.
      billing_details: { email: "familia@example.com", name: "Titular Sintético" },
      sepa_debit: { last4: "3000", bank_code: "37040044", country: "DE" },
    },
    mandate: mandateId,
    metadata: {
      zaltyko_organization_id: organizationId,
      zaltyko_family_payer_id: familyPayerId,
      zaltyko_setup_attempt_id: attemptId,
    },
    ...overrides,
  };
}

/** Ningún parámetro enviado a Stripe lleva correo, nombre ni datos de contacto. */
function expectNoPersonalData(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ["email", "name", "phone", "address", "description"]) {
    expect(serialized).not.toContain(`"${forbidden}"`);
  }
  expect(serialized).not.toContain("@");
}

beforeEach(() => {
  mocks.getStripeClient.mockReset();
});

describe("claves de idempotencia", () => {
  it("cliente: estable por cuenta conectada (fila local) y pagador", () => {
    expect(familyCustomerIdempotencyKey(providerAccountRowId, familyPayerId)).toBe(
      `zaltyko-family-customer:${providerAccountRowId}:${familyPayerId}`
    );
  });

  it("preparación: estable por intento", () => {
    expect(familySetupIntentIdempotencyKey(attemptId)).toBe(`zaltyko-family-setup:${attemptId}`);
  });
});

describe("createStripeFamilyGateway", () => {
  describe("createCustomer", () => {
    it("crea el cliente en la cuenta de la academia solo con ids en metadata", async () => {
      const stripe = fakeStripe();
      stripe.customersCreate.mockResolvedValue({ id: customerId, object: "customer" });
      const gateway = createStripeFamilyGateway(stripe.client);
      const idempotencyKey = familyCustomerIdempotencyKey(providerAccountRowId, familyPayerId);

      const result = await gateway.createCustomer({
        connectedAccount,
        organizationId,
        familyPayerId,
        idempotencyKey,
      });

      expect(result).toEqual({ id: customerId });
      expect(stripe.customersCreate).toHaveBeenCalledTimes(1);
      const [params, options] = stripe.customersCreate.mock.calls[0];
      expect(params).toEqual({
        metadata: {
          zaltyko_organization_id: organizationId,
          zaltyko_family_payer_id: familyPayerId,
        },
      });
      expect(options).toEqual({ stripeAccount: connectedAccount, idempotencyKey });
      expectNoPersonalData(params);
    });

    it("propaga el error de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.customersCreate.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.createCustomer({
          connectedAccount,
          organizationId,
          familyPayerId,
          idempotencyKey: "zaltyko-family-customer:x:y",
        })
      ).rejects.toThrow("stripe caído");
    });
  });

  describe("createSetupIntent", () => {
    it.each<["card" | "sepa_debit"]>([["card"], ["sepa_debit"]])(
      "prepara %s fuera de sesión en la cuenta de la academia con la clave del intento",
      async (kind) => {
        const stripe = fakeStripe();
        stripe.setupIntentsCreate.mockResolvedValue(setupIntent({ status: "requires_payment_method" }));
        const gateway = createStripeFamilyGateway(stripe.client);

        const result = await gateway.createSetupIntent({
          connectedAccount,
          customer: customerId,
          kind,
          organizationId,
          familyPayerId,
          attemptId,
        });

        expect(result).toEqual({
          id: setupIntentId,
          clientSecret: "seti_synthetic_001_secret_synthetic",
        });
        expect(stripe.setupIntentsCreate).toHaveBeenCalledTimes(1);
        const [params, options] = stripe.setupIntentsCreate.mock.calls[0];
        expect(params).toEqual({
          customer: customerId,
          payment_method_types: [kind],
          usage: "off_session",
          metadata: {
            zaltyko_organization_id: organizationId,
            zaltyko_family_payer_id: familyPayerId,
            zaltyko_setup_attempt_id: attemptId,
          },
        });
        expect(options).toEqual({
          stripeAccount: connectedAccount,
          idempotencyKey: `zaltyko-family-setup:${attemptId}`,
        });
        expectNoPersonalData(params);
        const serialized = JSON.stringify(params);
        expect(serialized).not.toContain("application_fee");
        expect(serialized).not.toContain("on_behalf_of");
      }
    );

    it("lanza si Stripe no devuelve el secreto del formulario", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsCreate.mockResolvedValue(setupIntent({ client_secret: null }));
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.createSetupIntent({
          connectedAccount,
          customer: customerId,
          kind: "card",
          organizationId,
          familyPayerId,
          attemptId,
        })
      ).rejects.toThrow("FAMILY_SETUP_INTENT_NO_CLIENT_SECRET");
    });
  });

  describe("retrieveSetupIntent", () => {
    it("expande solo el método y devuelve referencias opacas y su tipo", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockResolvedValue(setupIntent());
      const gateway = createStripeFamilyGateway(stripe.client);

      const snapshot = await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });

      expect(stripe.setupIntentsRetrieve).toHaveBeenCalledWith(
        setupIntentId,
        { expand: ["payment_method"] },
        { stripeAccount: connectedAccount }
      );
      expect(snapshot).toEqual({
        id: setupIntentId,
        status: "succeeded",
        customer: customerId,
        paymentMethod: paymentMethodId,
        paymentMethodType: "sepa_debit",
        mandate: mandateId,
        metadataAttemptId: attemptId,
      });
      // Nada del método salvo el tipo: ni dígitos, ni banco, ni titular, ni correo.
      const serialized = JSON.stringify(snapshot);
      for (const leaked of ["3000", "37040044", "Titular", "@", "billing_details", "last4"]) {
        expect(serialized).not.toContain(leaked);
      }
    });

    it("normaliza cliente y orden expandidos a su id", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockResolvedValue(
        setupIntent({
          customer: { id: customerId, object: "customer", email: "familia@example.com" },
          mandate: { id: mandateId, object: "mandate", type: "multi_use" },
        })
      );
      const gateway = createStripeFamilyGateway(stripe.client);

      const snapshot = await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });

      expect(snapshot.customer).toBe(customerId);
      expect(snapshot.mandate).toBe(mandateId);
      expect(JSON.stringify(snapshot)).not.toContain("@");
    });

    it("con el método sin expandir conserva el id y deja el tipo en null", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockResolvedValue(
        setupIntent({ payment_method: paymentMethodId, mandate: null })
      );
      const gateway = createStripeFamilyGateway(stripe.client);

      const snapshot = await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });

      expect(snapshot.paymentMethod).toBe(paymentMethodId);
      expect(snapshot.paymentMethodType).toBeNull();
      expect(snapshot.mandate).toBeNull();
    });

    it("sin método, sin cliente y sin metadata devuelve null en cada campo", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockResolvedValue(
        setupIntent({
          status: "requires_payment_method",
          customer: null,
          payment_method: null,
          mandate: null,
          metadata: {},
        })
      );
      const gateway = createStripeFamilyGateway(stripe.client);

      const snapshot = await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });

      expect(snapshot).toEqual({
        id: setupIntentId,
        status: "requires_payment_method",
        customer: null,
        paymentMethod: null,
        paymentMethodType: null,
        mandate: null,
        metadataAttemptId: null,
      });
    });

    it("metadata null también da metadataAttemptId null", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockResolvedValue(setupIntent({ metadata: null }));
      const gateway = createStripeFamilyGateway(stripe.client);

      const snapshot = await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });

      expect(snapshot.metadataAttemptId).toBeNull();
    });

    it("propaga el error de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.setupIntentsRetrieve.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.retrieveSetupIntent({ connectedAccount, setupIntentId })
      ).rejects.toThrow("stripe caído");
    });
  });

  describe("detachPaymentMethod", () => {
    it("desliga el método en la cuenta de la academia", async () => {
      const stripe = fakeStripe();
      stripe.paymentMethodsDetach.mockResolvedValue({ id: paymentMethodId, customer: null });
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.detachPaymentMethod({ connectedAccount, paymentMethod: paymentMethodId })
      ).resolves.toBeUndefined();

      expect(stripe.paymentMethodsDetach).toHaveBeenCalledWith(
        paymentMethodId,
        {},
        { stripeAccount: connectedAccount }
      );
    });

    it("no lanza si el método ya no existe (resource_missing)", async () => {
      const stripe = fakeStripe();
      stripe.paymentMethodsDetach.mockRejectedValue({
        type: "StripeInvalidRequestError",
        rawType: "invalid_request_error",
        code: "resource_missing",
        message: "No such PaymentMethod: 'pm_synthetic_001'",
      });
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.detachPaymentMethod({ connectedAccount, paymentMethod: paymentMethodId })
      ).resolves.toBeUndefined();
    });

    it("no lanza si el método ya estaba desligado", async () => {
      const stripe = fakeStripe();
      stripe.paymentMethodsDetach.mockRejectedValue({
        type: "StripeInvalidRequestError",
        rawType: "invalid_request_error",
        message:
          "The payment method you provided is not attached to a customer so detachment is impossible.",
      });
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.detachPaymentMethod({ connectedAccount, paymentMethod: paymentMethodId })
      ).resolves.toBeUndefined();
    });

    it.each<[string, unknown]>([
      ["un error de red", { type: "StripeConnectionError", message: "socket hang up" }],
      ["un error de permisos", { type: "StripePermissionError", code: "account_invalid" }],
      ["otro error de petición", { type: "StripeInvalidRequestError", code: "parameter_missing" }],
      ["un Error genérico", new Error("stripe caído")],
    ])("propaga %s", async (_label, error) => {
      const stripe = fakeStripe();
      stripe.paymentMethodsDetach.mockRejectedValue(error);
      const gateway = createStripeFamilyGateway(stripe.client);

      await expect(
        gateway.detachPaymentMethod({ connectedAccount, paymentMethod: paymentMethodId })
      ).rejects.toBe(error);
    });
  });

  it("sin cliente explícito usa getStripeClient solo al llamar", async () => {
    const stripe = fakeStripe();
    stripe.setupIntentsRetrieve.mockResolvedValue(setupIntent());
    mocks.getStripeClient.mockReturnValue(stripe.client);

    const gateway = createStripeFamilyGateway();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();

    await gateway.retrieveSetupIntent({ connectedAccount, setupIntentId });
    expect(mocks.getStripeClient).toHaveBeenCalled();
    expect(stripe.setupIntentsRetrieve).toHaveBeenCalledWith(
      setupIntentId,
      { expand: ["payment_method"] },
      { stripeAccount: connectedAccount }
    );
  });
});

describe("isAlreadyDetachedError", () => {
  it.each<[string, unknown, boolean]>([
    ["resource_missing", { code: "resource_missing" }, true],
    [
      "método no ligado",
      { rawType: "invalid_request_error", message: "PaymentMethod is not attached to a customer" },
      true,
    ],
    ["mensaje parecido pero de red", { type: "StripeConnectionError", message: "not attached to a customer" }, false],
    ["null", null, false],
    ["un texto", "resource_missing", false],
  ])("%s → %s", (_label, error, expected) => {
    expect(isAlreadyDetachedError(error)).toBe(expected);
  });
});
