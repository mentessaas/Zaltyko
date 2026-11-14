import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const createSelectChain = (result: any[]) => {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => ({
      limit: vi.fn(() => result),
    })),
  };
  return chain;
};

let selectQueue: any[] = [];

vi.doMock("@/db", () => ({
  db: {
    select: vi.fn(() => selectQueue.shift() ?? createSelectChain([])),
  },
}));

describe("API /api/super-admin/users/[profileId]", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("debe requerir autenticación de Super Admin", async () => {
    vi.doMock("@/lib/authz", () => ({
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
    vi.doMock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));

    selectQueue = [createSelectChain([])];

    const { GET } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/non-existent");
    const response = await GET(request, {
      params: Promise.resolve({ profileId: "non-existent" }),
      profile: { id: "profile-1", role: "super_admin", tenantId: "tenant-123" },
    });
    
    expect(response.status).toBe(404);
  });

  it("debe validar que no se puede modificar un super_admin", async () => {
    vi.doMock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));

    selectQueue = [createSelectChain([{ id: "test-id", role: "super_admin", isSuspended: false }])];

    const { PATCH } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/test-id", {
      method: "PATCH",
      body: JSON.stringify({ isSuspended: true }),
    });
    
    const response = await PATCH(request, {
      params: Promise.resolve({ profileId: "test-id" }),
      profile: { id: "profile-1", role: "super_admin", tenantId: "tenant-123" },
    });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("IMMUTABLE_SUPER_ADMIN");
  });

  it("DELETE no borra un perfil dueño de academias legacy (409) ni toca su cuenta", async () => {
    vi.doMock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));
    const deleteAuthUserIfPresent = vi.fn();
    vi.doMock("@/lib/supabase/admin-operations", () => ({
      getAuthUserEmail: vi.fn(),
      updateAuthUserEmail: vi.fn(),
      deleteAuthUserIfPresent,
    }));
    const ownedAcademies: any = {
      from: vi.fn(() => ownedAcademies),
      where: vi.fn(() => Promise.resolve([{ value: 1 }])),
    };
    selectQueue = [createSelectChain([{ id: "test-id", userId: "user-1", role: "owner" }]), ownedAcademies];

    const { DELETE } = await import("@/app/api/super-admin/users/[profileId]/route");
    const request = new NextRequest("http://localhost/api/super-admin/users/test-id", {
      method: "DELETE",
      body: JSON.stringify({ reason: "Solicitud de supresión" }),
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ profileId: "test-id" }),
      profile: { id: "profile-1", role: "super_admin", tenantId: "tenant-123" },
      userId: "admin-user",
    });

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.code).toBe("ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES");
    expect(deleteAuthUserIfPresent).not.toHaveBeenCalled();
  });
});

