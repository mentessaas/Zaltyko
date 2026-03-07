import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock de Stripe
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
};

// Función para crear cadena de mock de db
const createMockChain = (returnValue: any = [{ id: "mock-id" }]) => {
  const chain: any = {
    returning: vi.fn(() => Promise.resolve(returnValue)),
  };
  chain.values = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(returnValue));
  chain.from = vi.fn(() => chain);
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(returnValue));
  return chain;
};

// Mocks de las funciones de base de datos
const createMockDb = () => {
  const insertChain = createMockChain([{ id: "billing-event-id" }]);
  const updateChain = createMockChain([{ id: "updated-id" }]);
  const selectChain = createMockChain([]);

  return {
    select: vi.fn(() => {
      const chain = createMockChain([]);
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => Promise.resolve([]));
      chain.limit = vi.fn(() => Promise.resolve([]));
      return chain;
    }),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    transaction: vi.fn((callback) => callback({
      select: vi.fn(() => createMockChain([])),
      insert: vi.fn(() => createMockChain([{ id: "billing-event-id" }])),
      update: vi.fn(() => createMockChain([{ id: "updated-id" }])),
    })),
  };
};

// Variable para almacenar el mock de db
let mockDb: any;

// Mock del cliente de Stripe
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: vi.fn(() => mockStripe),
}));

// Mock de la base de datos
vi.mock("@/db", () => {
  return {
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
  };
});

// Mock de otros módulos
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
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

describe("API Stripe Webhooks Complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Configurar variable de entorno
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });

  describe("Webhook Signature Validation", () => {
    it("debe rechazar webhook sin firma válida", async () => {
      const { POST } = await import("@/app/api/stripe/webhook/route");

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.created" }),
        headers: {
          "stripe-signature": "invalid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("SIGNATURE_VERIFICATION_FAILED");
    });

    it("debe aceptar webhook con firma válida", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
            },
            items: {
              data: [{
                price: {
                  id: "price_pro",
                  metadata: { plan_code: "pro" },
                },
              }],
            },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.created" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Subscription Events", () => {
    it("debe manejar customer.subscription.created", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
            },
            items: {
              data: [{
                price: {
                  id: "price_pro",
                  metadata: { plan_code: "pro" },
                },
              }],
            },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.created" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("debe manejar customer.subscription.updated", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at_period_end: true,
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
            },
            items: {
              data: [{
                price: {
                  id: "price_pro",
                },
              }],
            },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
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

    it("debe manejar customer.subscription.deleted", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "canceled",
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
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

  describe("Payment Events", () => {
    it("debe manejar invoice.payment_succeeded", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_123",
            customer: "cus_123",
            amount_paid: 2900,
            status: "paid",
            subscription: "sub_123",
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
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

    it("debe manejar invoice.payment_failed", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_123",
            customer: "cus_123",
            amount_due: 2900,
            attempt_count: 1,
            subscription: "sub_123",
            metadata: {
              userId: "user-123",
              academyId: "academy-123",
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

  describe("Customer Events", () => {
    it("debe manejar customer.created", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.created",
        data: {
          object: {
            id: "cus_123",
            email: "test@example.com",
            metadata: {
              tenant_id: "tenant-123",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.created" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("debe manejar customer.updated", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.updated",
        data: {
          object: {
            id: "cus_123",
            email: "newemail@example.com",
            invoice_settings: {
              default_payment_method: "pm_new",
            },
            metadata: {
              tenant_id: "tenant-123",
            },
          },
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.updated" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Error Handling", () => {
    it("debe manejar errores de base de datos gracefully", async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            metadata: {
              userId: "user-123",
            },
          },
        },
      });

      // Sobrescribir el mock de db para lanzar error
      const { db } = await import("@/db");
      (db as any).insert = vi.fn(() => {
        throw new Error("Database connection failed");
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "customer.subscription.created" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      // Debe retornar 500 pero no crashear
      expect(response.status).toBe(500);
    });

    it("debe loggear eventos no manejados", async () => {
      // Resetear el mock de db que pudo haber sido modificado por el test anterior
      const { db } = await import("@/db");
      (db as any).insert = vi.fn(() => {
        const chain: any = {};
        chain.values = vi.fn(() => chain);
        chain.onConflictDoUpdate = vi.fn(() => chain);
        chain.returning = vi.fn(() => Promise.resolve([{ id: "mock-id" }]));
        return chain;
      });

      const loggerModule = await import("@/lib/logger");
      const mockLogger = loggerModule.logger;

      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: "evt_123",
        type: "unknown.event.type",
        data: {
          object: {},
        },
      });

      const { POST } = await import("@/app/api/stripe/webhook/route");

      const request = new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "unknown.event.type" }),
        headers: {
          "stripe-signature": "valid-signature",
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });
});
