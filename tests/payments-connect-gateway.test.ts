import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: mocks.getStripeClient,
}));

import {
  connectAccountIdempotencyKey,
  createStripeConnectGateway,
  isStripeIdempotencyConflict,
} from "@/modules/payments-connect/infrastructure/stripe-connect-gateway";

/**
 * Conectar Stripe (cobro automático, Fase 1): adaptador Stripe v2 con un
 * cliente simulado. Nunca llama a Stripe; solo datos sintéticos.
 */

const organizationId = "10000000-0000-4000-8000-000000000001";
const accountId = "acct_synthetic_001";
const expectedInclude = ["configuration.merchant", "requirements", "identity"];

function fakeStripe() {
  const fns = {
    accountsCreate: vi.fn(),
    accountsRetrieve: vi.fn(),
    accountLinksCreate: vi.fn(),
    parseEventNotification: vi.fn(),
  };
  const client = {
    v2: {
      core: {
        accounts: { create: fns.accountsCreate, retrieve: fns.accountsRetrieve },
        accountLinks: { create: fns.accountLinksCreate },
      },
    },
    parseEventNotification: fns.parseEventNotification,
  } as unknown as Stripe;
  return { client, ...fns };
}

function v2Account(overrides: Record<string, unknown> = {}) {
  return {
    id: accountId,
    object: "v2.core.account",
    livemode: false,
    created: "2026-11-16T12:00:00.000Z",
    applied_configurations: ["merchant"],
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { status: "pending", status_details: [] },
          sepa_debit_payments: { status: "restricted", status_details: [] },
        },
      },
    },
    requirements: {
      entries: [
        {
          description: "identity.business_details.registered_name",
          awaiting_action_from: "user",
          minimum_deadline: { status: "currently_due" },
          errors: [],
          impact: {},
          requested_reasons: [],
        },
        {
          description: "identity.business_details.address",
          awaiting_action_from: "stripe",
          minimum_deadline: { status: "eventually_due" },
          errors: [],
          impact: {},
          requested_reasons: [],
        },
        {
          description: "identity.individual.dob",
          awaiting_action_from: "user",
          minimum_deadline: { status: "past_due" },
          errors: [],
          impact: {},
          requested_reasons: [],
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getStripeClient.mockReset();
});

describe("connectAccountIdempotencyKey", () => {
  it("es estable por academia y entorno", () => {
    expect(connectAccountIdempotencyKey(organizationId, "test")).toBe(
      `zaltyko-connect-account:test:${organizationId}`
    );
    expect(connectAccountIdempotencyKey(organizationId, "live")).toBe(
      `zaltyko-connect-account:live:${organizationId}`
    );
  });
});

describe("isStripeIdempotencyConflict", () => {
  it.each<[string, unknown]>([
    ["StripeIdempotencyError del SDK", { type: "StripeIdempotencyError", rawType: "idempotency_error" }],
    ["tipo crudo idempotency_error", { type: "idempotency_error" }],
    ["clave en uso por otra petición", { type: "StripeInvalidRequestError", code: "idempotency_key_in_use" }],
  ])("es true con %s", (_label, error) => {
    expect(isStripeIdempotencyConflict(error)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["un error de red", { type: "StripeConnectionError" }],
    ["otro error de petición", { type: "StripeInvalidRequestError", code: "parameter_missing" }],
    ["un Error sin propiedades de Stripe", new Error("caído")],
    ["null", null],
    ["un texto", "idempotency_error"],
  ])("es false con %s", (_label, error) => {
    expect(isStripeIdempotencyConflict(error)).toBe(false);
  });
});

describe("createStripeConnectGateway", () => {
  describe("createAccount", () => {
    it("crea la cuenta v2 con cargos directos, ES/EUR, tarjeta y domiciliación", async () => {
      const stripe = fakeStripe();
      stripe.accountsCreate.mockResolvedValue(v2Account());
      const gateway = createStripeConnectGateway(stripe.client);

      await gateway.createAccount({ organizationId, environment: "test" });

      expect(stripe.accountsCreate).toHaveBeenCalledTimes(1);
      const [params, options] = stripe.accountsCreate.mock.calls[0];
      // R8: solo academia y entorno; sin nombre ni correo que puedan cambiar
      // entre dos intentos con la misma clave de idempotencia.
      expect(params).not.toHaveProperty("display_name");
      expect(params).not.toHaveProperty("contact_email");
      expect(params).toEqual({
        dashboard: "full",
        identity: { country: "es" },
        defaults: {
          currency: "eur",
          locales: ["es-ES"],
          responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
              sepa_debit_payments: { requested: true },
            },
          },
        },
        metadata: {
          zaltyko_organization_id: organizationId,
          zaltyko_environment: "test",
        },
        include: expectedInclude,
      });
      expect(Object.keys(params.metadata).sort()).toEqual([
        "zaltyko_environment",
        "zaltyko_organization_id",
      ]);
      expect(options).toEqual({
        idempotencyKey: connectAccountIdempotencyKey(organizationId, "test"),
      });

      const serialized = JSON.stringify(params);
      expect(serialized).not.toContain("application_fee");
      expect(serialized).not.toContain("recipient");
    });

    it("devuelve la cuenta creada como snapshot", async () => {
      const stripe = fakeStripe();
      stripe.accountsCreate.mockResolvedValue(v2Account());
      const gateway = createStripeConnectGateway(stripe.client);

      const snapshot = await gateway.createAccount({ organizationId, environment: "test" });

      expect(snapshot.id).toBe(accountId);
      expect(snapshot.cardPaymentsStatus).toBe("pending");
      expect(snapshot.sepaDebitPaymentsStatus).toBe("restricted");
    });
  });

  describe("retrieveAccount", () => {
    it("pide el mismo include y convierte los requisitos en requirementEntries", async () => {
      const stripe = fakeStripe();
      stripe.accountsRetrieve.mockResolvedValue(v2Account());
      const gateway = createStripeConnectGateway(stripe.client);

      const snapshot = await gateway.retrieveAccount(accountId);

      expect(stripe.accountsRetrieve).toHaveBeenCalledWith(accountId, {
        include: expectedInclude,
      });
      expect(snapshot).toEqual({
        id: accountId,
        closed: false,
        cardPaymentsStatus: "pending",
        sepaDebitPaymentsStatus: "restricted",
        requirementEntries: [
          { deadlineStatus: "currently_due", awaitingActionFrom: "user" },
          { deadlineStatus: "eventually_due", awaitingActionFrom: "stripe" },
          { deadlineStatus: "past_due", awaitingActionFrom: "user" },
        ],
      });
    });

    it("sin configuración ni requisitos devuelve capacidades null y lista vacía", async () => {
      const stripe = fakeStripe();
      stripe.accountsRetrieve.mockResolvedValue(
        v2Account({ configuration: undefined, requirements: undefined })
      );
      const gateway = createStripeConnectGateway(stripe.client);

      const snapshot = await gateway.retrieveAccount(accountId);

      expect(snapshot).toEqual({
        id: accountId,
        closed: false,
        cardPaymentsStatus: null,
        sepaDebitPaymentsStatus: null,
        requirementEntries: [],
      });
    });

    it("refleja una cuenta cerrada", async () => {
      const stripe = fakeStripe();
      stripe.accountsRetrieve.mockResolvedValue(v2Account({ closed: true }));
      const gateway = createStripeConnectGateway(stripe.client);

      const snapshot = await gateway.retrieveAccount(accountId);

      expect(snapshot.closed).toBe(true);
    });

    it("propaga el error de Stripe", async () => {
      const stripe = fakeStripe();
      stripe.accountsRetrieve.mockRejectedValue(new Error("stripe caído"));
      const gateway = createStripeConnectGateway(stripe.client);

      await expect(gateway.retrieveAccount(accountId)).rejects.toThrow("stripe caído");
    });
  });

  describe("createOnboardingLink", () => {
    it("pide un enlace de alta de la configuración merchant con las dos URL", async () => {
      const stripe = fakeStripe();
      stripe.accountLinksCreate.mockResolvedValue({
        object: "v2.core.account_link",
        account: accountId,
        url: "https://connect.stripe.com/setup/synthetic",
      });
      const gateway = createStripeConnectGateway(stripe.client);

      const result = await gateway.createOnboardingLink({
        accountId,
        returnUrl: "https://staging.example.com/owner/settings?stripe=vuelta",
        refreshUrl: "https://staging.example.com/api/v1/owner/payments/connect/link",
      });

      expect(stripe.accountLinksCreate).toHaveBeenCalledWith({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant"],
            return_url: "https://staging.example.com/owner/settings?stripe=vuelta",
            refresh_url: "https://staging.example.com/api/v1/owner/payments/connect/link",
            collection_options: { fields: "eventually_due" },
          },
        },
      });
      expect(result).toEqual({ url: "https://connect.stripe.com/setup/synthetic" });
    });
  });

  describe("parseAccountEvent", () => {
    it("delega en parseEventNotification y devuelve la cuenta del related_object", () => {
      const stripe = fakeStripe();
      stripe.parseEventNotification.mockReturnValue({
        id: "evt_synthetic_001",
        object: "v2.core.event",
        type: "v2.core.account[requirements].updated",
        livemode: false,
        created: "2026-11-16T12:00:00.000Z",
        related_object: { id: accountId, type: "v2.core.account", url: "/v2/core/accounts/x" },
      });
      const gateway = createStripeConnectGateway(stripe.client);

      const parsed = gateway.parseAccountEvent("{\"raw\":true}", "t=1,v1=firma", "whsec_synthetic");

      expect(stripe.parseEventNotification).toHaveBeenCalledWith(
        "{\"raw\":true}",
        "t=1,v1=firma",
        "whsec_synthetic"
      );
      expect(parsed).toEqual({
        eventId: "evt_synthetic_001",
        type: "v2.core.account[requirements].updated",
        accountId,
        livemode: false,
      });
    });

    it("lee la cuenta en capability_status_updated y en account.closed", () => {
      const stripe = fakeStripe();
      const gateway = createStripeConnectGateway(stripe.client);

      for (const type of [
        "v2.core.account[configuration.merchant].capability_status_updated",
        "v2.core.account.closed",
      ]) {
        stripe.parseEventNotification.mockReturnValueOnce({
          id: "evt_synthetic_002",
          type,
          livemode: true,
          related_object: { id: accountId, type: "v2.core.account", url: "/v2/core/accounts/x" },
        });
        const parsed = gateway.parseAccountEvent("{}", "sig", "whsec_synthetic");
        expect(parsed.accountId).toBe(accountId);
        expect(parsed.livemode).toBe(true);
      }
    });

    it("devuelve accountId null si el evento no es de la cuenta", () => {
      const stripe = fakeStripe();
      const gateway = createStripeConnectGateway(stripe.client);

      stripe.parseEventNotification.mockReturnValueOnce({
        id: "evt_synthetic_003",
        type: "v2.core.account_link.returned",
        livemode: false,
      });
      expect(gateway.parseAccountEvent("{}", "sig", "whsec_synthetic").accountId).toBeNull();

      stripe.parseEventNotification.mockReturnValueOnce({
        id: "evt_synthetic_004",
        type: "v2.core.account_person.updated",
        livemode: false,
        related_object: { id: "person_synthetic", type: "v2.core.account_person", url: "/x" },
      });
      expect(gateway.parseAccountEvent("{}", "sig", "whsec_synthetic").accountId).toBeNull();

      stripe.parseEventNotification.mockReturnValueOnce({
        id: "evt_synthetic_005",
        type: "v2.core.account.updated",
        livemode: false,
        related_object: null,
      });
      expect(gateway.parseAccountEvent("{}", "sig", "whsec_synthetic").accountId).toBeNull();
    });

    it("propaga el error si la firma es inválida", () => {
      const stripe = fakeStripe();
      stripe.parseEventNotification.mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      });
      const gateway = createStripeConnectGateway(stripe.client);

      expect(() => gateway.parseAccountEvent("{}", "bad", "whsec_synthetic")).toThrow(
        "No signatures found"
      );
    });
  });

  it("sin cliente explícito usa getStripeClient solo al llamar", async () => {
    const stripe = fakeStripe();
    stripe.accountsRetrieve.mockResolvedValue(v2Account());
    mocks.getStripeClient.mockReturnValue(stripe.client);

    const gateway = createStripeConnectGateway();
    expect(mocks.getStripeClient).not.toHaveBeenCalled();

    await gateway.retrieveAccount(accountId);
    expect(mocks.getStripeClient).toHaveBeenCalled();
    expect(stripe.accountsRetrieve).toHaveBeenCalledWith(accountId, { include: expectedInclude });
  });
});
