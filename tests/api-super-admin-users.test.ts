import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

describe("API /api/super-admin/users/[profileId]", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debe requerir autenticación de Super Admin", async () => {
    vi.mock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => async (request: Request, context: any) => {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      },
    }));

    const { GET } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/test-id");
    const response = await GET(request, { params: Promise.resolve({ profileId: "test-id" }) });
    
    expect(response.status).toBe(401);
  });

  it("debe retornar 404 si el usuario no existe", async () => {
    vi.mock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));

    vi.mock("@/db", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => []),
            })),
          })),
        })),
      },
    }));

    const { GET } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/non-existent");
    const response = await GET(request, { params: Promise.resolve({ profileId: "non-existent" }) });
    
    expect(response.status).toBe(404);
  });

  it("debe validar que no se puede modificar un super_admin", async () => {
    vi.mock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));

    vi.mock("@/db", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => [{ id: "test-id", role: "super_admin", isSuspended: false }]),
            })),
          })),
        })),
      },
    }));

    const { PATCH } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/test-id", {
      method: "PATCH",
      body: JSON.stringify({ isSuspended: true }),
    });
    
    const response = await PATCH(request, { params: Promise.resolve({ profileId: "test-id" }) });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("IMMUTABLE_SUPER_ADMIN");
  });
});

