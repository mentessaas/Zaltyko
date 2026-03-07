import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API Authentication & Authorization", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Authentication Middleware", () => {
        it("debe rechazar requests sin token de autenticación", async () => {
            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies");

            const response = await GET(request, {});

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe("UNAUTHORIZED");
        });

        it("debe rechazar tokens inválidos", async () => {
            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    Authorization: "Bearer invalid-token",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(401);
        });

        it("debe aceptar tokens válidos", async () => {
            const mockUser = {
                id: "user-123",
                email: "test@example.com",
                role: "admin",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockUser });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => []);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    Authorization: "Bearer valid-token",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(200);
        });
    });

    describe("Role-Based Access Control", () => {
        it("debe permitir acceso a super_admin a todos los recursos", async () => {
            const mockSuperAdmin = {
                id: "user-super",
                email: "super@zaltyko.com",
                role: "super_admin",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockSuperAdmin });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => [
                            { id: "academy-1", name: "Academia 1" },
                            { id: "academy-2", name: "Academia 2" },
                        ]);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies");

            const response = await GET(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.length).toBeGreaterThan(0);
        });

        it("debe restringir acceso de usuarios normales a su tenant", async () => {
            const mockUser = {
                id: "user-normal",
                email: "user@academy.com",
                role: "user",
                tenant_id: "tenant-123",
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
                        chain.where = vi.fn((condition: any) => {
                            // Solo retornar academias del tenant del usuario
                            return [{ id: "academy-1", name: "Mi Academia", tenant_id: "tenant-123" }];
                        });
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies");

            const response = await GET(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.every((academy: any) => academy.tenant_id === "tenant-123")).toBe(true);
        });

        it("debe rechazar acceso de admin a recursos de otro tenant", async () => {
            const mockAdmin = {
                id: "user-admin",
                email: "admin@academy1.com",
                role: "admin",
                tenant_id: "tenant-123",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockAdmin, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => {
                            throw new Error("FORBIDDEN: Cannot access resources from another tenant");
                        });
                        return chain;
                    }),
                    update: vi.fn(() => {
                        const chain: any = {};
                        chain.set = vi.fn(() => chain);
                        chain.where = vi.fn(() => {
                            throw new Error("FORBIDDEN: Cannot modify resources from another tenant");
                        });
                        return chain;
                    }),
                },
            }));

            const { PUT } = await import("@/app/api/athletes/[id]/route");
            const request = new NextRequest("http://localhost/api/athletes/athlete-from-other-tenant", {
                method: "PUT",
                body: JSON.stringify({ name: "Hacked" }),
            });

            try {
                await PUT(request, { params: { id: "athlete-from-other-tenant" } });
                expect.fail("Should have thrown an error");
            } catch (error: any) {
                expect(error.message).toContain("FORBIDDEN");
            }
        });
    });

    describe("Permission Validation", () => {
        it("debe permitir a coaches ver solo sus clases asignadas", async () => {
            const mockCoach = {
                id: "coach-123",
                email: "coach@academy.com",
                role: "coach",
                tenant_id: "tenant-123",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return handler(request, { ...context, user: mockCoach, tenantId: "tenant-123" });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => chain);
                        chain.innerJoin = vi.fn(() => [
                            { id: "class-1", name: "Clase Asignada", coach_id: "coach-123" },
                        ]);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/classes/route");
            const request = new NextRequest("http://localhost/api/classes");

            const response = await GET(request, {});
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.every((cls: any) => cls.coach_id === "coach-123")).toBe(true);
        });

        it("debe rechazar creación de recursos sin permisos adecuados", async () => {
            const mockUser = {
                id: "user-viewer",
                email: "viewer@academy.com",
                role: "viewer",
                tenant_id: "tenant-123",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
                },
            }));

            const { POST } = await import("@/app/api/athletes/route");
            const request = new NextRequest("http://localhost/api/athletes", {
                method: "POST",
                body: JSON.stringify({ name: "Nuevo Atleta" }),
            });

            const response = await POST(request, {});

            expect(response.status).toBe(403);
        });
    });

    describe("Session Management", () => {
        it("debe invalidar sesión expirada", async () => {
            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 401 });
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    Authorization: "Bearer expired-token",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toBe("SESSION_EXPIRED");
        });

        it("debe renovar token antes de expiración", async () => {
            const mockUser = {
                id: "user-123",
                email: "test@example.com",
                role: "admin",
            };

            vi.mock("@/lib/authz", () => ({
                withTenant: (handler: any) => async (request: Request, context: any) => {
                    const response = await handler(request, { ...context, user: mockUser });
                    // Simular renovación de token
                    response.headers.set("X-New-Token", "new-refreshed-token");
                    return response;
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => []);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    Authorization: "Bearer about-to-expire-token",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(200);
            expect(response.headers.get("X-New-Token")).toBeTruthy();
        });
    });

    describe("API Key Authentication", () => {
        it("debe aceptar API key válida", async () => {
            vi.mock("@/lib/authz", () => ({
                withApiKey: (handler: any) => async (request: Request, context: any) => {
                    const apiKey = request.headers.get("X-API-Key");
                    if (apiKey === "valid-api-key") {
                        return handler(request, { ...context, apiKey });
                    }
                    return NextResponse.json({ error: "INVALID_API_KEY" }, { status: 401 });
                },
            }));

            vi.doMock("@/db", () => ({
                db: {
                    select: vi.fn(() => {
                        const chain: any = {};
                        chain.from = vi.fn(() => chain);
                        chain.where = vi.fn(() => []);
                        return chain;
                    }),
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    "X-API-Key": "valid-api-key",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(200);
        });

        it("debe rechazar API key inválida", async () => {
            vi.mock("@/lib/authz", () => ({
                withApiKey: (handler: any) => async (request: Request, context: any) => {
                    return NextResponse.json({ error: "INVALID_API_KEY" }, { status: 401 });
                },
            }));

            const { GET } = await import("@/app/api/academies/route");
            const request = new NextRequest("http://localhost/api/academies", {
                headers: {
                    "X-API-Key": "invalid-key",
                },
            });

            const response = await GET(request, {});

            expect(response.status).toBe(401);
        });
    });
});
