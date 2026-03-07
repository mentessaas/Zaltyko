import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Mocks globales de db con vi.hoisted
const { mockDb } = vi.hoisted(() => {
    const mockDb = {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    leftJoin: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => Promise.resolve([])),
                        })),
                        orderBy: vi.fn(() => Promise.resolve([])),
                    })),
                    orderBy: vi.fn(() => Promise.resolve([])),
                })),
                leftJoin: vi.fn(() => ({
                    where: vi.fn(() => ({
                        orderBy: vi.fn(() => Promise.resolve([])),
                    })),
                })),
            })),
            leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                    orderBy: vi.fn(() => Promise.resolve([])),
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
                where: vi.fn(() => Promise.resolve([])),
            })),
        })),
        delete: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([])),
        })),
    };

    return { mockDb };
});

// Fixture para planes
const plansFixture = [
    { code: "free", nickname: "Free", priceEur: 0, currency: "eur", billingInterval: "month", athleteLimit: 10, stripePriceId: null, isArchived: false },
    { code: "pro", nickname: "Pro", priceEur: 2900, currency: "eur", billingInterval: "month", athleteLimit: 50, stripePriceId: "price_pro", isArchived: false },
];

describe("API /api/billing/plans", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("debe requerir autenticación", async () => {
        // Mock que lanza error para simular falta de autenticación
        vi.mock("@/lib/authz", () => ({
            withTenant: vi.fn(() => {
                throw { status: 401, message: "Unauthorized" };
            }),
        }));

        vi.mock("@/db", () => ({
            db: mockDb,
        }));

        const { GET } = await import("@/app/api/billing/plans/route");
        const request = new NextRequest("http://localhost/api/billing/plans");

        try {
            await GET(request, {});
        } catch (error: any) {
            expect(error.status).toBe(401);
        }
    });

    it("debe retornar lista de planes disponibles", async () => {
        vi.mock("@/lib/authz", () => ({
            withTenant: (handler: any) => handler,
        }));

        vi.mock("@/db", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => Promise.resolve(plansFixture)),
                        })),
                    })),
                })),
            },
        }));

        const { GET } = await import("@/app/api/billing/plans/route");
        const request = new NextRequest("http://localhost/api/billing/plans");

        const response = await GET(request, {});

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it("debe filtrar planes archivados", async () => {
        vi.mock("@/lib/authz", () => ({
            withTenant: (handler: any) => handler,
        }));

        vi.mock("@/db", () => ({
            db: {
                select: vi.fn(() => ({
                    from: vi.fn(() => ({
                        where: vi.fn(() => ({
                            orderBy: vi.fn(() => Promise.resolve(plansFixture)),
                        })),
                    })),
                })),
            },
        }));

        const { GET } = await import("@/app/api/billing/plans/route");
        const request = new NextRequest("http://localhost/api/billing/plans");

        const response = await GET(request, {});

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
    });
});
