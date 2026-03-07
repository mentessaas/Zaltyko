import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ============================================
// MOCKS GLOBALES CON VI.HOISTED
// ============================================

const { mockUserData } = vi.hoisted(() => {
    const mockUserData = {
        id: "user-123",
        tenant_id: "tenant-123",
        current_plan: "free",
    };
    return { mockUserData };
});

// Mocks globales de db - configurables por test
let mockDbSelectResult: any[] = [];
let mockDbUpdateResult: any[] = [];

const { mockDb, resetMockDb, setMockDbResult } = vi.hoisted(() => {
    function resetMockDb() {
        mockDbSelectResult = [];
        mockDbUpdateResult = [];
    }

    function setMockDbResult(selectResult: any[], updateResult: any[] = []) {
        mockDbSelectResult = selectResult;
        mockDbUpdateResult = updateResult;
    }

    const mockDb = {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    leftJoin: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                            limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                        })),
                        orderBy: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                        limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                    })),
                    innerJoin: vi.fn(() => ({
                        where: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                        })),
                    })),
                    orderBy: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                    limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                })),
                leftJoin: vi.fn(() => ({
                    where: vi.fn(() => ({
                        orderBy: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                        limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                    })),
                })),
            })),
            innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn(() => Promise.resolve(mockDbSelectResult)),
                })),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                returning: vi.fn(() => Promise.resolve([])),
            })),
        })),
        update: vi.fn(() => ({
            set: vi.fn(() => ({
                where: vi.fn(() => Promise.resolve(mockDbUpdateResult)),
            })),
        })),
        delete: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([])),
        })),
    };

    return { mockDb, resetMockDb, setMockDbResult };
});

// ============================================
// TESTS
// ============================================

describe("API Billing Upgrades & Downgrades", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        resetMockDb();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Plan Upgrades", () => {
        it("debe permitir upgrade de Free a Pro", async () => {
            // Hay una suscripción existente - el test espera una subscripción
            const mockSubscription = {
                id: "sub-123",
                userId: mockUserData.id,
                planId: "plan-free",
                planCode: "free",
                currentPeriodEnd: new Date(),
            };
            setMockDbResult([mockSubscription], [{ id: "sub-123" }]);

            vi.mock("@/db", () => ({
                db: {
                    select: vi.fn(() => ({
                        from: vi.fn(() => ({
                            where: vi.fn(() => ({
                                leftJoin: vi.fn(() => ({
                                    where: vi.fn(() => ({
                                        limit: vi.fn(() => Promise.resolve([mockSubscription])),
                                    })),
                                    limit: vi.fn(() => Promise.resolve([mockSubscription])),
                                })),
                                limit: vi.fn(() => Promise.resolve([mockSubscription])),
                            })),
                            leftJoin: vi.fn(() => ({
                                where: vi.fn(() => ({
                                    limit: vi.fn(() => Promise.resolve([mockSubscription])),
                                })),
                            })),
                        })),
                    })),
                    insert: vi.fn(() => ({
                        values: vi.fn(() => ({
                            returning: vi.fn(() => Promise.resolve([{ id: "sub-new" }])),
                        })),
                    })),
                    update: vi.fn(() => ({
                        set: vi.fn(() => ({
                            where: vi.fn(() => Promise.resolve([{ id: "sub-123" }])),
                        })),
                    })),
                },
            }));

            vi.mock("stripe", () => ({
                default: vi.fn(() => ({
                    subscriptions: {
                        create: vi.fn().mockResolvedValue({ id: "sub_123", status: "active" }),
                    },
                })),
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            vi.mock("@/lib/billing/proration", () => ({
                calculateProration: vi.fn().mockReturnValue({
                    amount: 1500,
                    description: "Prorated charge",
                }),
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({ targetPlan: "pro" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it("debe rechazar upgrade sin target plan", async () => {
            setMockDbResult([], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/upgrade/route");
            const request = new NextRequest("http://localhost/api/billing/upgrade", {
                method: "POST",
                body: JSON.stringify({}),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(400);
        });
    });

    describe("Plan Downgrades", () => {
        it("debe permitir downgrade de Pro a Free", async () => {
            const mockSubscription = { id: "sub-123", userId: mockUserData.id, planId: "plan-pro", status: "active" };
            setMockDbResult([mockSubscription], [{ id: "sub-123" }]);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({ targetPlan: "free" }),
            });

            const response = await POST(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it("debe rechazar downgrade sin target plan", async () => {
            setMockDbResult([], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({}),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(400);
        });

        it("debe rechazar downgrade si no hay suscripción activa", async () => {
            setMockDbResult([], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/downgrade/route");
            const request = new NextRequest("http://localhost/api/billing/downgrade", {
                method: "POST",
                body: JSON.stringify({ targetPlan: "free" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(404);
        });

        it("debe permitir cancelar downgrade programado", async () => {
            const mockSubscription = {
                id: "sub-123",
                userId: mockUserData.id,
                planId: "plan-pro",
                status: "active",
                cancelAtPeriodEnd: true,
            };
            setMockDbResult([mockSubscription], [{ id: "sub-123" }]);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
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
            const mockSubscription = { id: "sub-123", userId: mockUserData.id, planId: "plan-pro", status: "active" };
            setMockDbResult([mockSubscription], [{ id: "sub-123" }]);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
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

        it("debe rechazar cancelación si no hay suscripción", async () => {
            setMockDbResult([], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/cancel/route");
            const request = new NextRequest("http://localhost/api/billing/cancel", {
                method: "POST",
                body: JSON.stringify({ reason: "Testing" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(404);
        });
    });

    describe("Payment Method Updates", () => {
        it("debe permitir actualizar método de pago", async () => {
            const mockSubscription = { id: "sub-123", userId: mockUserData.id, stripeCustomerId: "cus_123" };
            setMockDbResult([mockSubscription], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
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

        it("debe rechazar sin método de pago", async () => {
            setMockDbResult([], []);

            vi.mock("@/db", () => ({
                db: mockDb,
            }));

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, userId: mockUserData.id, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/billing/payment-method/route");
            const request = new NextRequest("http://localhost/api/billing/payment-method", {
                method: "POST",
                body: JSON.stringify({}),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(400);
        });
    });
});
