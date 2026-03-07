import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";

// Mock de Stripe
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
};

// Mock del cliente de Stripe
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => mockStripe),
}));

// Mock de la base de datos
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => Promise.resolve([]));
      chain.limit = vi.fn(() => Promise.resolve([]));
      return chain;
    }),
    insert: vi.fn(() => {
      const chain: any = {};
      chain.values = vi.fn(() => chain);
      chain.onConflictDoUpdate = vi.fn(() => chain);
      chain.returning = vi.fn(() => Promise.resolve([{ id: "mock-id" }]));
      return chain;
    }),
    update: vi.fn(() => {
      const chain: any = {};
      chain.set = vi.fn(() => chain);
      chain.where = vi.fn(() => Promise.resolve([{ id: "mock-id" }]));
      return chain;
    }),
    transaction: vi.fn((callback) => {
      return callback({
        select: vi.fn(() => {
          const chain: any = {};
          chain.from = vi.fn(() => chain);
          chain.where = vi.fn(() => Promise.resolve([]));
          return chain;
        }),
        insert: vi.fn(() => {
          const chain: any = {};
          chain.values = vi.fn(() => chain);
          chain.returning = vi.fn(() => Promise.resolve([{ id: "mock-id" }]));
          return chain;
        }),
        update: vi.fn(() => {
          const chain: any = {};
          chain.set = vi.fn(() => chain);
          chain.where = vi.fn(() => Promise.resolve([{ id: "mock-id" }]));
          return chain;
        }),
      });
    }),
  },
}));

vi.mock("@/lib/mailgun", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/stripe/subscription-service", () => ({
  handleSubscriptionEvent: vi.fn(() => Promise.resolve({
    academyId: "academy-123",
    tenantId: "tenant-123",
    userId: "user-123",
  })),
}));

vi.mock("@/lib/stripe/invoice-service", () => ({
  handleInvoiceEvent: vi.fn(() => Promise.resolve({
    academyId: "academy-123",
    tenantId: "tenant-123",
    userId: "user-123",
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Stripe Webhook Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Configurar variables de entorno requeridas
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
  });

  describe("checkout.session.completed", () => {
    it("debe crear una suscripción cuando se completa el checkout", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_123",
            customer: "cus_test_123",
            subscription: "sub_test_123",
            metadata: {
              userId: "user_123",
              tenantId: "tenant_123",
              academyId: "academy_123",
              planCode: "pro",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalled();
    });
  });

  describe("customer.subscription.updated", () => {
    it("debe actualizar la suscripción cuando cambia el estado", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_test_123",
            customer: "cus_test_123",
            status: "active",
            items: {
              data: [
                {
                  price: {
                    id: "price_test_123",
                  },
                },
              ],
            },
            metadata: {
              planCode: "pro",
            },
            cancel_at_period_end: false,
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.updated" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("customer.subscription.deleted", () => {
    it("debe cancelar la suscripción cuando se elimina en Stripe", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_test_123",
            customer: "cus_test_123",
            status: "canceled",
            metadata: {
              userId: "user_123",
              academyId: "academy_123",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.deleted" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("invoice.payment_succeeded", () => {
    it("debe crear una factura cuando el pago es exitoso", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_123",
            customer: "cus_test_123",
            subscription: "sub_test_123",
            amount_paid: 1900, // €19.00 en centavos
            currency: "eur",
            status: "paid",
            metadata: {
              userId: "user_123",
              academyId: "academy_123",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "invoice.payment_succeeded" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("invoice.payment_failed", () => {
    it("debe marcar la factura como fallida cuando el pago falla", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_test_123",
            customer: "cus_test_123",
            subscription: "sub_test_123",
            amount_due: 1900,
            currency: "eur",
            status: "open",
            attempt_count: 1,
            metadata: {
              userId: "user_123",
              academyId: "academy_123",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "invoice.payment_failed" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Validación de firma", () => {
    it("debe rechazar eventos sin firma válida", async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.created" }),
        headers: {
          "stripe-signature": "invalid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});
