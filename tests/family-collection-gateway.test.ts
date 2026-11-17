import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: mocks.getStripeClient,
}));

import {
  collectionAttemptSearchQuery,
  createStripeCollectionGateway,
  familyCollectionConfirmIdempotencyKey,
  familyCollectionCreateIdempotencyKey,
  isIdempotencyConflict,
} from "@/modules/family-collection/infrastructure/stripe-collection-gateway";

/**
 * Cobro automático de cuotas (Fase 3): adaptador Stripe del cobro en la
 * cuenta conectada de la academia, con un cliente simulado. Nunca llama a
 * Stripe; solo datos sintéticos.
 */

const connectedAccount = "acct_synthetic_001";
const organizationId = "10000000-0000-4000-8000-000000000001";
const invoiceId = "20000000-0000-4000-8000-000000000002";
const attemptId = "30000000-0000-4000-8000-000000000003";
const customerId = "cus_synthetic_001";
const paymentMethodId = "pm_synthetic_001";
const mandateId = "mandate_synthetic_001";
const paymentIntentId = "pi_synthetic_001";
const description = "Cuota noviembre 2026";

function fakeStripe() {
  const fns = {
    create: vi.fn(),
    confirm: vi.fn(),
    retrieve: vi.fn(),
    search: vi.fn(),
    cancel: vi.fn(),
  };
  const client = { paymentIntents: { ...fns } } as unknown as Stripe;
  return { client, ...fns };
}

function paymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentIntentId,
    object: "payment_intent",
    amount: 4500,
    amount_received: 0,
    currency: "eur",
    status: "requires_confirmation",
    customer: customerId,
    payment_method: paymentMethodId,
    payment_method_types: ["card"],
    description,
    last_payment_error: null,
    metadata: {
      zaltyko_organization_id: organizationId,
      zaltyko_invoice_id: invoiceId,
      zaltyko_collection_attempt_id: attemptId,
    },
    ...overrides,
  };
}

/** Error de tarjeta con la forma del SDK (por propiedades). */
function cardError(overrides: Record<string, unknown> = {}) {
  return {
    type: "StripeCardError",
    rawType: "card_error",
    code: "card_declined",
    decline_code: "insufficient_funds",
    message: "Mensaje sintético del banco",
    payment_intent: paymentIntent({
      status: "requires_payment_method",
      last_payment_error: {
        type: "card_error",
        code: "card_declined",
        decline_code: "insufficient_funds",
        message: "Mensaje sintético del banco",
        payment_method: {
          id: paymentMethodId,
          billing_details: { email: "familia@example.com", name: "Titular Sintético" },
          card: { last4: "4242" },
        },
      },
    }),
    ...overrides,
  };
}

/** Ningún parámetro enviado a Stripe lleva correo, nombre ni datos de contacto. */
function expectNoPersonalData(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ["email", "receipt_email", "name", "phone", "address", "shipping"]) {
    expect(serialized).not.toContain(`"${forbidden}"`);
  }
  expect(serialized).not.toContain("@");
}

/** Nada del banco ni de la tarjeta sale del adaptador. */
function expectNoLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const leaked of ["Mensaje sintético", "@", "Titular", "4242", "last4", "billing_details"]) {
    expect(serialized).not.toContain(leaked);
  }
}

beforeEach(() => {
  mocks.getStripeClient.mockReset();
});

describe("claves de idempotencia y consulta de búsqueda", () => {
  it("creación y confirmación: estables por factura e intento, distintas entre sí", () => {
    expect(familyCollectionCreateIdempotencyKey(invoiceId, 1)).toBe(
      `zaltyko-family-collection:${invoiceId}:1:create`
    );
    expect(familyCollectionConfirmIdempotencyKey(invoiceId, 2)).toBe(
      `zaltyko-family-collection:${invoiceId}:2:confirm`
    );
    expect(familyCollectionCreateIdempotencyKey(invoiceId, 1)).not.toBe(
      familyCollectionCreateIdempotencyKey(invoiceId, 2)
    );
  });

  it("los 4 intentos de una tarjeta (el primero y 3 reintentos) tienen claves propias", () => {
    const keys = [1, 2, 3, 4].flatMap((attemptNumber) => [
      familyCollectionCreateIdempotencyKey(invoiceId, attemptNumber),
      familyCollectionConfirmIdempotencyKey(invoiceId, attemptNumber),
    ]);
    expect(new Set(keys).size).toBe(8);
    expect(familyCollectionCreateIdempotencyKey(invoiceId, 4)).toBe(`zaltyko-family-collection:${invoiceId}:4:create`);
    expect(familyCollectionConfirmIdempotencyKey(invoiceId, 4)).toBe(`zaltyko-family-collection:${invoiceId}:4:confirm`);
  });

  it("la búsqueda por intento usa el campo de metadata del intento", () => {
    expect(collectionAttemptSearchQuery(attemptId)).toBe(
      `metadata['zaltyko_collection_attempt_id']:'${attemptId}'`
    );
  });

  it.each([
    ["con comilla", `${attemptId}' OR status:'succeeded`],
    ["vacío", ""],
    ["no uuid", "intento-1"],
    ["uuid con relleno", ` ${attemptId}`],
  ])("rechaza un id de intento %s antes de montar la consulta", (_label, value) => {
    expect(() => collectionAttemptSearchQuery(value)).toThrow("FAMILY_COLLECTION_INVALID_ATTEMPT_ID");
  });
});

describe("isIdempotencyConflict", () => {
  it("reconoce el error de idempotencia por tipo, por tipo crudo y en la clase real", () => {
    expect(isIdempotencyConflict({ type: "StripeIdempotencyError" })).toBe(true);
    expect(isIdempotencyConflict({ rawType: "idempotency_error" })).toBe(true);
    expect(
      isIdempotencyConflict(
        new Stripe.errors.StripeIdempotencyError({ type: "idempotency_error", message: "sintético" })
      )
    ).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(isIdempotencyConflict(cardError())).toBe(false);
    expect(isIdempotencyConflict({ type: "StripeAPIError", rawType: "api_error" })).toBe(false);
    expect(isIdempotencyConflict(new Error("idempotency_error"))).toBe(false);
    expect(isIdempotencyConflict(null)).toBe(false);
    expect(isIdempotencyConflict("idempotency_error")).toBe(false);
  });
});

describe("createStripeCollectionGateway", () => {
  it("sin cliente inyectado usa el de la aplicación al llamar, no al crear", async () => {
    const stripe = fakeStripe();
    stripe.retrieve.mockResolvedValue(paymentIntent());
    mocks.getStripeClient.mockReturnValue(stripe.client);

    const gateway = createStripeCollectionGateway();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();

    await gateway.retrievePayment({ connectedAccount, paymentIntentId });
    expect(mocks.getStripeClient).toHaveBeenCalledTimes(1);
  });

  describe("createPayment", () => {
    it.each<["card" | "sepa_debit"]>([["card"], ["sepa_debit"]])(
      "crea el cobro %s sin confirmar, en euros y en la cuenta de la academia",
      async (kind) => {
        const stripe = fakeStripe();
        stripe.create.mockResolvedValue(paymentIntent({ payment_method_types: [kind] }));
        const gateway = createStripeCollectionGateway(stripe.client);

        const snapshot = await gateway.createPayment({
          connectedAccount,
          attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
          amountCents: 4500,
          currency: "EUR",
          customer: customerId,
          paymentMethod: paymentMethodId,
          kind,
          organizationId,
          description,
        });

        expect(snapshot).toEqual({
          id: paymentIntentId,
          status: "requires_confirmation",
          lastErrorCode: null,
          lastDeclineCode: null,
          amountReceivedCents: 0,
          currency: "EUR",
        });
        expect(stripe.create).toHaveBeenCalledTimes(1);
        const [params, options] = stripe.create.mock.calls[0];
        expect(params).toEqual({
          amount: 4500,
          currency: "eur",
          customer: customerId,
          payment_method: paymentMethodId,
          payment_method_types: [kind],
          confirm: false,
          description,
          metadata: {
            zaltyko_organization_id: organizationId,
            zaltyko_invoice_id: invoiceId,
            zaltyko_collection_attempt_id: attemptId,
          },
        });
        expect(options).toEqual({
          stripeAccount: connectedAccount,
          idempotencyKey: `zaltyko-family-collection:${invoiceId}:1:create`,
        });
        expectNoPersonalData(params);
        const serialized = JSON.stringify(params);
        for (const forbidden of ["application_fee", "on_behalf_of", "receipt_email", "transfer_data"]) {
          expect(serialized).not.toContain(forbidden);
        }
        // Stripe solo los admite al confirmar: van en confirmPayment.
        expect(params).not.toHaveProperty("off_session");
        expect(params).not.toHaveProperty("mandate");
      }
    );

    it("el segundo intento usa su propia clave", async () => {
      const stripe = fakeStripe();
      stripe.create.mockResolvedValue(paymentIntent());
      const gateway = createStripeCollectionGateway(stripe.client);

      await gateway.createPayment({
        connectedAccount,
        attempt: { id: attemptId, invoiceId, attemptNumber: 2 },
        amountCents: 4500,
        currency: "EUR",
        customer: customerId,
        paymentMethod: paymentMethodId,
        kind: "card",
        organizationId,
        description,
      });

      expect(stripe.create.mock.calls[0][1]).toEqual({
        stripeAccount: connectedAccount,
        idempotencyKey: `zaltyko-family-collection:${invoiceId}:2:create`,
      });
    });

    it.each([[0], [-100], [12.5], [Number.NaN]])(
      "no llama a Stripe con un importe no válido (%s)",
      async (amountCents) => {
        const stripe = fakeStripe();
        const gateway = createStripeCollectionGateway(stripe.client);

        await expect(
          gateway.createPayment({
            connectedAccount,
            attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
            amountCents,
            currency: "EUR",
            customer: customerId,
            paymentMethod: paymentMethodId,
            kind: "card",
            organizationId,
            description,
          })
        ).rejects.toThrow("FAMILY_COLLECTION_INVALID_AMOUNT");
        expect(stripe.create).not.toHaveBeenCalled();
      }
    );

    it.each([["eur"], ["USD"], [""]])(
      "no llama a Stripe con una moneda que no es EUR (%s)",
      async (currency) => {
        const stripe = fakeStripe();
        const gateway = createStripeCollectionGateway(stripe.client);

        await expect(
          gateway.createPayment({
            connectedAccount,
            attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
            amountCents: 4500,
            currency,
            customer: customerId,
            paymentMethod: paymentMethodId,
            kind: "card",
            organizationId,
            description,
          })
        ).rejects.toThrow("FAMILY_COLLECTION_UNSUPPORTED_CURRENCY");
        expect(stripe.create).not.toHaveBeenCalled();
      }
    );

    it.each([["no-es-uuid"], [`${attemptId}' OR status:'succeeded`], [""]])(
      "no llama a Stripe con un id de intento que no es un uuid (%s)",
      async (id) => {
        const stripe = fakeStripe();
        const gateway = createStripeCollectionGateway(stripe.client);

        await expect(
          gateway.createPayment({
            connectedAccount,
            attempt: { id, invoiceId, attemptNumber: 1 },
            amountCents: 4500,
            currency: "EUR",
            customer: customerId,
            paymentMethod: paymentMethodId,
            kind: "card",
            organizationId,
            description,
          })
        ).rejects.toThrow("FAMILY_COLLECTION_INVALID_ATTEMPT_ID");
        expect(stripe.create).not.toHaveBeenCalled();
      }
    );

    it("un cobro devuelto sin id es un error, nunca un snapshot vacío", async () => {
      const stripe = fakeStripe();
      stripe.create.mockResolvedValue(paymentIntent({ id: "" }));
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(
        gateway.createPayment({
          connectedAccount,
          attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
          amountCents: 4500,
          currency: "EUR",
          customer: customerId,
          paymentMethod: paymentMethodId,
          kind: "card",
          organizationId,
          description,
        })
      ).rejects.toThrow("FAMILY_COLLECTION_INVALID_PAYMENT_INTENT");
    });

    it("propaga el error de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.create.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(
        gateway.createPayment({
          connectedAccount,
          attempt: { id: attemptId, invoiceId, attemptNumber: 1 },
          amountCents: 4500,
          currency: "EUR",
          customer: customerId,
          paymentMethod: paymentMethodId,
          kind: "card",
          organizationId,
          description,
        })
      ).rejects.toThrow("stripe caído");
    });
  });

  describe("confirmPayment", () => {
    it("confirma la tarjeta fuera de sesión con la clave de confirmación del intento", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockResolvedValue(paymentIntent({ status: "succeeded", amount_received: 4500 }));
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({
        id: paymentIntentId,
        status: "succeeded",
        lastErrorCode: null,
        lastDeclineCode: null,
        amountReceivedCents: 4500,
        currency: "EUR",
      });
      expect(stripe.confirm).toHaveBeenCalledWith(
        paymentIntentId,
        { off_session: true },
        {
          stripeAccount: connectedAccount,
          idempotencyKey: `zaltyko-family-collection:${invoiceId}:1:confirm`,
        }
      );
    });

    it("con domiciliación envía la orden SEPA y devuelve el cobro en curso", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockResolvedValue(
        paymentIntent({ status: "processing", payment_method_types: ["sepa_debit"] })
      );
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: mandateId,
      });

      expect(result).toEqual({
        id: paymentIntentId,
        status: "processing",
        lastErrorCode: null,
        lastDeclineCode: null,
        amountReceivedCents: 0,
        currency: "EUR",
      });
      expect(stripe.confirm).toHaveBeenCalledWith(
        paymentIntentId,
        { off_session: true, mandate: mandateId },
        {
          stripeAccount: connectedAccount,
          idempotencyKey: `zaltyko-family-collection:${invoiceId}:1:confirm`,
        }
      );
    });

    it("un rechazo de la tarjeta vuelve como error de cobro con solo códigos, sin lanzar", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue(cardError());
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({
        type: "card_error",
        code: "card_declined",
        declineCode: "insufficient_funds",
        paymentIntent: {
          id: paymentIntentId,
          status: "requires_payment_method",
          lastErrorCode: "card_declined",
          lastDeclineCode: "insufficient_funds",
          amountReceivedCents: 0,
          currency: "EUR",
        },
      });
      expectNoLeak(result);
    });

    it("con la clase real del SDK también devuelve el error de cobro", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue(
        new Stripe.errors.StripeCardError({
          type: "card_error",
          code: "card_declined",
          decline_code: "generic_decline",
          message: "Mensaje sintético del banco",
        })
      );
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({
        type: "card_error",
        code: "card_declined",
        declineCode: "generic_decline",
        paymentIntent: null,
      });
    });

    it("si el banco pide autenticación vuelve como error de cobro", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue({
        type: "StripeCardError",
        rawType: "card_error",
        code: "authentication_required",
        decline_code: "authentication_required",
        message: "Mensaje sintético del banco",
        payment_intent: paymentIntent({
          status: "requires_payment_method",
          last_payment_error: { code: "authentication_required", decline_code: "authentication_required" },
        }),
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({
        type: "card_error",
        code: "authentication_required",
        declineCode: "authentication_required",
        paymentIntent: {
          id: paymentIntentId,
          status: "requires_payment_method",
          lastErrorCode: "authentication_required",
          lastDeclineCode: "authentication_required",
          amountReceivedCents: 0,
          currency: "EUR",
        },
      });
    });

    it("authentication_required sin tipo de tarjeta también vuelve como error de cobro", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue({ code: "authentication_required" });
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({
        type: null,
        code: "authentication_required",
        declineCode: null,
        paymentIntent: null,
      });
    });

    it("decline_code vacío o códigos con forma extraña quedan en null", async () => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue({
        type: "StripeCardError",
        rawType: "card_error",
        code: "Mensaje con espacios",
        decline_code: "",
        payment_intent: { id: "", status: "requires_payment_method" },
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      const result = await gateway.confirmPayment({
        connectedAccount,
        paymentIntentId,
        attempt: { invoiceId, attemptNumber: 1 },
        mandate: null,
      });

      expect(result).toEqual({ type: "card_error", code: null, declineCode: null, paymentIntent: null });
    });

    it.each([
      ["red", { type: "StripeConnectionError", message: "sin red" }],
      ["API", { type: "StripeAPIError", rawType: "api_error", message: "fallo" }],
      ["límite", { type: "StripeRateLimitError", rawType: "rate_limit_error", code: "rate_limit" }],
      ["idempotencia", { type: "StripeIdempotencyError", rawType: "idempotency_error" }],
      [
        "estado inesperado",
        { type: "StripeInvalidRequestError", rawType: "invalid_request_error", code: "payment_intent_unexpected_state" },
      ],
    ])("lanza el error de %s para que lo traduzca el dominio", async (_label, error) => {
      const stripe = fakeStripe();
      stripe.confirm.mockRejectedValue(error);
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(
        gateway.confirmPayment({
          connectedAccount,
          paymentIntentId,
          attempt: { invoiceId, attemptNumber: 1 },
          mandate: null,
        })
      ).rejects.toBe(error);
    });
  });

  describe("retrievePayment", () => {
    it("lee el cobro en la cuenta de la academia y devuelve solo id, estado y códigos", async () => {
      const stripe = fakeStripe();
      stripe.retrieve.mockResolvedValue(
        paymentIntent({
          status: "requires_payment_method",
          last_payment_error: {
            type: "card_error",
            code: "card_declined",
            decline_code: "lost_card",
            message: "Mensaje sintético del banco",
            payment_method: { billing_details: { email: "familia@example.com", name: "Titular Sintético" } },
          },
        })
      );
      const gateway = createStripeCollectionGateway(stripe.client);

      const snapshot = await gateway.retrievePayment({ connectedAccount, paymentIntentId });

      expect(stripe.retrieve).toHaveBeenCalledWith(paymentIntentId, {}, { stripeAccount: connectedAccount });
      expect(snapshot).toEqual({
        id: paymentIntentId,
        status: "requires_payment_method",
        lastErrorCode: "card_declined",
        lastDeclineCode: "lost_card",
        amountReceivedCents: 0,
        currency: "EUR",
      });
      expectNoLeak(snapshot);
    });

    it("propaga el error de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.retrieve.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.retrievePayment({ connectedAccount, paymentIntentId })).rejects.toThrow(
        "stripe caído"
      );
    });
  });

  describe("findPaymentByAttempt", () => {
    it("busca en la cuenta de la academia por el id del intento", async () => {
      const stripe = fakeStripe();
      stripe.search.mockResolvedValue({
        object: "search_result",
        data: [paymentIntent({ status: "succeeded", amount_received: 4500 })],
        has_more: false,
        next_page: null,
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      const snapshot = await gateway.findPaymentByAttempt({ connectedAccount, attemptId });

      expect(stripe.search).toHaveBeenCalledWith(
        { query: `metadata['zaltyko_collection_attempt_id']:'${attemptId}'` },
        { stripeAccount: connectedAccount }
      );
      expect(snapshot).toEqual({
        id: paymentIntentId,
        status: "succeeded",
        lastErrorCode: null,
        lastDeclineCode: null,
        amountReceivedCents: 4500,
        currency: "EUR",
      });
    });

    it("sin resultados devuelve null", async () => {
      const stripe = fakeStripe();
      stripe.search.mockResolvedValue({ object: "search_result", data: [], has_more: false, next_page: null });
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.findPaymentByAttempt({ connectedAccount, attemptId })).resolves.toBeNull();
    });

    it("ignora resultados cuya metadata no es la del intento", async () => {
      const stripe = fakeStripe();
      stripe.search.mockResolvedValue({
        object: "search_result",
        data: [paymentIntent({ metadata: { zaltyko_collection_attempt_id: organizationId } })],
        has_more: false,
        next_page: null,
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.findPaymentByAttempt({ connectedAccount, attemptId })).resolves.toBeNull();
    });

    it("con dos cobros para el mismo intento lanza en lugar de elegir uno", async () => {
      const stripe = fakeStripe();
      stripe.search.mockResolvedValue({
        object: "search_result",
        data: [paymentIntent(), paymentIntent({ id: "pi_synthetic_002", status: "succeeded" })],
        has_more: false,
        next_page: null,
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.findPaymentByAttempt({ connectedAccount, attemptId })).rejects.toThrow(
        "FAMILY_COLLECTION_MULTIPLE_PAYMENTS_FOR_ATTEMPT"
      );
    });

    it("no llama a Stripe con un id de intento que no es uuid", async () => {
      const stripe = fakeStripe();
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(
        gateway.findPaymentByAttempt({ connectedAccount, attemptId: "x' OR status:'succeeded" })
      ).rejects.toThrow("FAMILY_COLLECTION_INVALID_ATTEMPT_ID");
      expect(stripe.search).not.toHaveBeenCalled();
    });
  });

  describe("cancelPayment", () => {
    it("cancela el cobro en la cuenta de la academia", async () => {
      const stripe = fakeStripe();
      stripe.cancel.mockResolvedValue(paymentIntent({ status: "canceled" }));
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.cancelPayment({ connectedAccount, paymentIntentId })).resolves.toBe("canceled");
      expect(stripe.cancel).toHaveBeenCalledWith(paymentIntentId, {}, { stripeAccount: connectedAccount });
    });

    it("si Stripe ya no deja cancelarlo devuelve not_cancelable", async () => {
      const stripe = fakeStripe();
      stripe.cancel.mockRejectedValue({
        type: "StripeInvalidRequestError",
        rawType: "invalid_request_error",
        code: "payment_intent_unexpected_state",
      });
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.cancelPayment({ connectedAccount, paymentIntentId })).resolves.toBe(
        "not_cancelable"
      );
    });

    it("propaga otros errores de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.cancel.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeCollectionGateway(stripe.client);

      await expect(gateway.cancelPayment({ connectedAccount, paymentIntentId })).rejects.toThrow(
        "stripe caído"
      );
    });
  });
});
