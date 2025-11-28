import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

describe("API Stripe Webhooks Complete", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Webhook Signature Validation", () => {
        it("debe rechazar webhook sin firma válida", async () => {
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
            const data = await response.json();
            expect(data.error).toContain("signature");
        });

        it("debe aceptar webhook con firma válida", async () => {
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.subscription.created",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                                status: "active",
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

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
            let updatedSubscription: any = null;

            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.subscription.created",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                                status: "active",
                                current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
                                items: {
                                    data: [{
                                        price: {
                                            id: "price_pro",
                                            metadata: { plan_code: "pro" },
                                        },
                                    }],
                                },
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn((data) => {
                            updatedSubscription = data;
                            return chain;
                        });
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/stripe/webhook/route");
            const request = new NextRequest("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: JSON.stringify({ type: "customer.subscription.created" }),
                headers: {
                    "stripe-signature": "valid-signature",
                },
            });

            await POST(request);

            expect(updatedSubscription).toBeDefined();
            expect(updatedSubscription.subscription_id).toBe("sub_123");
            expect(updatedSubscription.plan).toBe("pro");
        });

        it("debe manejar customer.subscription.updated", async () => {
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.subscription.updated",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                                status: "active",
                                cancel_at_period_end: true,
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

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
            let downgradedToFree = false;

            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.subscription.deleted",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn((data) => {
                            if (data.plan === "free") {
                                downgradedToFree = true;
                            }
                            return chain;
                        });
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/stripe/webhook/route");
            const request = new NextRequest("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: JSON.stringify({ type: "customer.subscription.deleted" }),
                headers: {
                    "stripe-signature": "valid-signature",
                },
            });

            await POST(request);

            expect(downgradedToFree).toBe(true);
        });
    });

    describe("Payment Events", () => {
        it("debe manejar invoice.payment_succeeded", async () => {
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "invoice.payment_succeeded",
                        data: {
                            object: {
                                id: "in_123",
                                customer: "cus_123",
                                amount_paid: 2900,
                                status: "paid",
                                subscription: "sub_123",
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    insert: vi.fn(() => {
                        const chain: any = {};
                        chain.values = vi.fn(() => chain);
                        chain.returning = vi.fn(() => [{ id: "invoice-123" }]);
                        return chain;
                    }),
                },
            }));

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
            let notificationSent = false;

            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "invoice.payment_failed",
                        data: {
                            object: {
                                id: "in_123",
                                customer: "cus_123",
                                amount_due: 2900,
                                attempt_count: 1,
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/notifications", () => ({
                sendPaymentFailedNotification: vi.fn(() => {
                    notificationSent = true;
                    return Promise.resolve();
                }),
            }));

            const { POST } = await import("@/app/api/stripe/webhook/route");
            const request = new NextRequest("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: JSON.stringify({ type: "invoice.payment_failed" }),
                headers: {
                    "stripe-signature": "valid-signature",
                },
            });

            await POST(request);

            expect(notificationSent).toBe(true);
        });
    });

    describe("Customer Events", () => {
        it("debe manejar customer.created", async () => {
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
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
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

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
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.updated",
                        data: {
                            object: {
                                id: "cus_123",
                                email: "newemail@example.com",
                                invoice_settings: {
                                    default_payment_method: "pm_new",
                                },
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

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

    describe("Idempotency", () => {
        it("debe manejar webhooks duplicados correctamente", async () => {
            let processCount = 0;

            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        id: "evt_123",
                        type: "customer.subscription.created",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                                status: "active",
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => {
                            // Primera vez: no existe, segunda vez: ya existe
                            return processCount === 0 ? [] : [{ id: "evt_123" }];
                        });
                        return chain;
                    }),
                    insert: vi.fn(() => {
                        processCount++;
                        const chain: any = {};
                        chain.values = vi.fn(() => chain);
                        chain.returning = vi.fn(() => [{ id: "evt_123" }]);
                        return chain;
                    }),
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/stripe/webhook/route");

            // Primer webhook
            const request1 = new NextRequest("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: JSON.stringify({ type: "customer.subscription.created" }),
                headers: {
                    "stripe-signature": "valid-signature",
                },
            });

            await POST(request1);

            // Webhook duplicado
            const request2 = new NextRequest("http://localhost/api/stripe/webhook", {
                method: "POST",
                body: JSON.stringify({ type: "customer.subscription.created" }),
                headers: {
                    "stripe-signature": "valid-signature",
                },
            });

            await POST(request2);

            // Solo debe procesarse una vez
            expect(processCount).toBe(1);
        });
    });

    describe("Error Handling", () => {
        it("debe manejar errores de base de datos gracefully", async () => {
            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "customer.subscription.created",
                        data: {
                            object: {
                                id: "sub_123",
                                customer: "cus_123",
                            },
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        throw new Error("Database connection failed");
                    }),
                },
            }));

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
            let loggedEvent: string | null = null;

            const mockStripe = {
                webhooks: {
                    constructEvent: vi.fn().mockReturnValue({
                        type: "unknown.event.type",
                        data: {
                            object: {},
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/logger", () => ({
                logger: {
                    warn: vi.fn((msg: string) => {
                        loggedEvent = msg;
                    }),
                },
            }));

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
            expect(loggedEvent).toContain("Unhandled");
        });
    });
});
