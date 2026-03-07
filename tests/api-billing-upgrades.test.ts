import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API Billing Upgrades & Downgrades", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Plan Upgrades", () => {
        it("debe permitir upgrade de Free a Pro", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "free",
            };

            const mockStripe = {
                subscriptions: {
                    create: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        status: "active",
                        current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000,
                    }),
                },
                customers: {
                    retrieve: vi.fn().mockResolvedValue({
                        id: "cus_123",
                        email: "test@example.com",
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123", plan: "pro" }]));
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "pro", payment_method: "pm_123" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subscription).toBeDefined();
            expect(data.subscription.status).toBe("active");
        });

        it("debe calcular prorrateo correctamente en upgrade", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "pro",
                subscription_end: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 días restantes
            };

            const mockStripe = {
                subscriptions: {
                    update: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        status: "active",
                        proration_amount: 1500, // $15 de crédito
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "premium" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.proration_amount).toBeDefined();
            expect(data.proration_amount).toBeGreaterThan(0);
        });

        it("debe rechazar upgrade sin método de pago", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "free",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "pro" }), // Sin payment_method
            });

            const response = await POST(request, {});

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain("payment");
        });

        it("debe actualizar límites del tenant después de upgrade", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "free",
            };

            let updatedLimits: any = null;

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn((limits) => {
                            updatedLimits = limits;
                            return chain;
                        });
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

            const mockStripe = {
                subscriptions: {
                    create: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        status: "active",
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "pro", payment_method: "pm_123" }),
            });

            await POST(request, {});

            expect(updatedLimits).toBeDefined();
            expect(updatedLimits.max_athletes).toBeGreaterThan(50); // Free tiene 50, Pro tiene más
        });
    });

    describe("Plan Downgrades", () => {
        it("debe permitir downgrade de Pro a Free", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "pro",
            };

            const mockStripe = {
                subscriptions: {
                    update: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        cancel_at_period_end: true,
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "free" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.scheduled_downgrade).toBe(true);
            expect(data.effective_date).toBeDefined();
        });

        it("debe advertir sobre pérdida de datos en downgrade", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "premium",
                athlete_count: 200, // Excede límite de Free (50)
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => [{ count: 200 }]);
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "free" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.warnings).toBeDefined();
            expect(data.warnings.length).toBeGreaterThan(0);
            expect(data.warnings.some((w: string) => w.includes("atletas"))).toBe(true);
        });

        it("debe programar downgrade para fin de período de facturación", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "pro",
                subscription_end: Date.now() + 20 * 24 * 60 * 60 * 1000, // 20 días
            };

            const mockStripe = {
                subscriptions: {
                    update: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        cancel_at_period_end: true,
                        current_period_end: mockUser.subscription_end / 1000,
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({ plan: "free" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.effective_date).toBeDefined();
            const effectiveDate = new Date(data.effective_date);
            const expectedDate = new Date(mockUser.subscription_end);
            expect(effectiveDate.getTime()).toBeCloseTo(expectedDate.getTime(), -5);
        });

        it("debe permitir cancelar downgrade programado", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "pro",
                scheduled_downgrade: "free",
            };

            const mockStripe = {
                subscriptions: {
                    update: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        cancel_at_period_end: false,
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { DELETE } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "DELETE",
            });

            const response = await DELETE(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.cancelled).toBe(true);
        });
    });

    describe("Subscription Cancellation", () => {
        it("debe permitir cancelar suscripción", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "pro",
            };

            const mockStripe = {
                subscriptions: {
                    cancel: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        status: "canceled",
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/cancel/route");
            const request = new NextRequest("http://localhost/api/billing/cancel", {
                method: "POST",
                body: JSON.stringify({ reason: "No longer needed" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.status).toBe("canceled");
        });

        it("debe revertir a plan Free después de cancelación", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                current_plan: "premium",
            };

            let updatedPlan: string | null = null;

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn((data) => {
                            updatedPlan = data.plan;
                            return chain;
                        });
                        chain.where = vi.fn(() => Promise.resolve([{ id: "tenant-123" }]));
                        return chain;
                    }),
                },
            }));

            const mockStripe = {
                subscriptions: {
                    cancel: vi.fn().mockResolvedValue({
                        id: "sub_123",
                        status: "canceled",
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            const { POST } = await import("@/app/api/billing/cancel/route");
            const request = new NextRequest("http://localhost/api/billing/cancel", {
                method: "POST",
                body: JSON.stringify({ reason: "Testing" }),
            });

            await POST(request, {});

            expect(updatedPlan).toBe("free");
        });
    });

    describe("Payment Method Updates", () => {
        it("debe permitir actualizar método de pago", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                stripe_customer_id: "cus_123",
            };

            const mockStripe = {
                paymentMethods: {
                    attach: vi.fn().mockResolvedValue({
                        id: "pm_new",
                    }),
                },
                customers: {
                    update: vi.fn().mockResolvedValue({
                        id: "cus_123",
                        invoice_settings: {
                            default_payment_method: "pm_new",
                        },
                    }),
                },
            };

            vi.mock("stripe", () => ({
                default: vi.fn(() => mockStripe),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/payment-method/route");
            const request = new NextRequest("http://localhost/api/billing/payment-method", {
                method: "POST",
                body: JSON.stringify({ payment_method: "pm_new" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.payment_method).toBe("pm_new");
        });
    });
});
