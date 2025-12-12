import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API Limits Validation", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Plan Limits - Free Tier", () => {
        const freeLimits = {
            max_athletes: 50,
            max_coaches: 2,
            max_classes: 5,
            max_storage_mb: 100,
        };

        it("debe rechazar creación de atleta cuando se excede límite Free", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
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
                        chain.where = vi.fn(() => [{ count: 50 }]); // Ya tiene 50 atletas
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain("límite");
            expect(data.limit).toBe(freeLimits.max_athletes);
            expect(data.upgrade_required).toBe(true);
        });

        it("debe permitir creación de atleta cuando no se excede límite", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
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
                        chain.where = vi.fn(() => [{ count: 30 }]); // Tiene 30 atletas
                        return chain;
                    }),
                    insert: vi.fn(() => {
                        const chain: any = {};
                        chain.values = vi.fn(() => chain);
                        chain.returning = vi.fn(() => [{ id: "athlete-new", name: "Nuevo Atleta" }]);
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(201);
        });

        it("debe rechazar creación de coach cuando se excede límite Free", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
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
                        chain.where = vi.fn(() => [{ count: 2 }]); // Ya tiene 2 coaches
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/coaches/route");
            const request = new NextRequest("http://localhost/api/coaches", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Coach", email: "coach@test.com" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.limit).toBe(freeLimits.max_coaches);
        });
    });

    describe("Plan Limits - Pro Tier", () => {
        const proLimits = {
            max_athletes: 200,
            max_coaches: 10,
            max_classes: 50,
            max_storage_mb: 1000,
        };

        it("debe permitir más atletas en plan Pro", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "pro",
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
                        chain.where = vi.fn(() => [{ count: 150 }]); // 150 atletas (permitido en Pro)
                        return chain;
                    }),
                    insert: vi.fn(() => {
                        const chain: any = {};
                        chain.values = vi.fn(() => chain);
                        chain.returning = vi.fn(() => [{ id: "athlete-new", name: "Nuevo Atleta" }]);
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(201);
        });

        it("debe rechazar cuando se excede límite Pro", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "pro",
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
                        chain.where = vi.fn(() => [{ count: 200 }]); // Ya en el límite
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.limit).toBe(proLimits.max_athletes);
            expect(data.current_plan).toBe("pro");
            expect(data.suggested_plan).toBe("premium");
        });
    });

    describe("Plan Limits - Premium Tier", () => {
        it("debe permitir recursos ilimitados en plan Premium", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "premium",
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
                        chain.where = vi.fn(() => [{ count: 1000 }]); // Muchos atletas
                        return chain;
                    }),
                    insert: vi.fn(() => {
                        const chain: any = {};
                        chain.values = vi.fn(() => chain);
                        chain.returning = vi.fn(() => [{ id: "athlete-new", name: "Nuevo Atleta" }]);
                        return chain;
                    }),
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(201);
        });
    });

    describe("Storage Limits", () => {
        it("debe rechazar subida de archivo cuando se excede límite de almacenamiento", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
                storage_used_mb: 95, // Ya usa 95MB de 100MB
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { POST } = await import("@/app/api/upload/route");
            const formData = new FormData();
            const file = new File(["x".repeat(10 * 1024 * 1024)], "large-file.pdf", { type: "application/pdf" }); // 10MB
            formData.append("file", file);

            const request = new NextRequest("http://localhost/api/upload", {
                method: "POST",
                body: formData,
            });

            const response = await POST(request, {});

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain("almacenamiento");
            expect(data.storage_limit_mb).toBe(100);
            expect(data.storage_used_mb).toBe(95);
        });

        it("debe permitir subida cuando hay espacio suficiente", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "pro",
                storage_used_mb: 500, // Usa 500MB de 1000MB
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            vi.mock("@/lib/storage", () => ({
                uploadFile: vi.fn().mockResolvedValue({
                    url: "https://storage.example.com/file.pdf",
                    size_mb: 5,
                }),
            }));

            const { POST } = await import("@/app/api/upload/route");
            const formData = new FormData();
            const file = new File(["x".repeat(5 * 1024 * 1024)], "file.pdf", { type: "application/pdf" }); // 5MB
            formData.append("file", file);

            const request = new NextRequest("http://localhost/api/upload", {
                method: "POST",
                body: formData,
            });

            const response = await POST(request, {});

            expect(response.status).toBe(200);
        });
    });

    describe("Feature Access Limits", () => {
        it("debe rechazar acceso a features premium en plan Free", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { GET } = await import("@/app/api/analytics/advanced/route");
            const request = new NextRequest("http://localhost/api/analytics/advanced");

            const response = await GET(request, {});

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain("premium");
            expect(data.required_plan).toBe("pro");
        });

        it("debe permitir acceso a features premium en plan Pro", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "pro",
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
                        chain.where = vi.fn(() => [{ analytics: "data" }]);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/analytics/advanced/route");
            const request = new NextRequest("http://localhost/api/analytics/advanced");

            const response = await GET(request, {});

            expect(response.status).toBe(200);
        });
    });

    describe("Rate Limiting by Plan", () => {
        it("debe aplicar rate limit más bajo para plan Free", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "free",
            };

            let requestCount = 0;

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    requestCount++;
                    if (requestCount > 30) { // Free: 30 req/min
                        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
                    }
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { GET } = await import("@/app/api/athletes/route");

            // Hacer 35 requests
            for (let i = 0; i < 35; i++) {
                const request = new NextRequest("http://localhost/api/athletes");
                const response = await GET(request, {});

                if (i < 30) {
                    expect(response.status).not.toBe(429);
                } else {
                    expect(response.status).toBe(429);
                }
            }
        });

        it("debe aplicar rate limit más alto para plan Premium", async () => {
            const mockUser = {
                id: "user-123",
                tenant_id: "tenant-123",
                plan: "premium",
            };

            let requestCount = 0;

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    requestCount++;
                    if (requestCount > 300) { // Premium: 300 req/min
                        return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 });
                    }
                    return handler(request, { ...context, user: mockUser, tenantId: "tenant-123" });
                },
            }));

            const { GET } = await import("@/app/api/athletes/route");

            // Hacer 100 requests (debería pasar sin problemas)
            for (let i = 0; i < 100; i++) {
                const request = new NextRequest("http://localhost/api/athletes");
                const response = await GET(request, {});
                expect(response.status).not.toBe(429);
            }
        });
    });
});
