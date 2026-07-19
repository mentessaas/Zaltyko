import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API /api/admin/users", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe requerir autenticación de tenant", async () => {
    vi.mock("@/lib/authz", () => ({
      withTenant: (handler: any) => async (request: Request, context: any) => {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      },
    }));

    const { POST } = await import("@/app/api/admin/users/route");
    const request = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", role: "coach" }),
    });
    
    const response = await POST(request, {});
    
    expect(response.status).toBe(401);
  });

  it("debe validar el formato del email", async () => {
    vi.mock("@/lib/authz", () => ({
      withTenant: (handler: any) => handler,
    }));

    vi.mock("@/db", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => []),
          })),
        })),
      },
    }));

    const { POST } = await import("@/app/api/admin/users/route");
    const request = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "invalid-email", role: "coach" }),
    });
    
    const response = await POST(request, {});
    
    expect(response.status).toBe(400);
  });

  it("debe validar que el rol sea válido", async () => {
    vi.mock("@/lib/authz", () => ({
      withTenant: (handler: any) => handler,
    }));

    const { POST } = await import("@/app/api/admin/users/route");
    const request = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", role: "invalid_role" }),
    });
    
    const response = await POST(request, {});
    
    expect(response.status).toBe(400);
  });
});
