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

  it("DELETE traduce un bloqueo de la supresión a 409 y no registra la eliminación", async () => {
    vi.doMock("@/lib/authz", () => ({
      withSuperAdmin: (handler: any) => handler,
    }));
    const logAdminAction = vi.fn();
    vi.doMock("@/lib/admin-logs", () => ({ logAdminAction }));
    const eraseUserAccount = vi.fn();
    vi.doMock("@/modules/data-rights/application/account-erasure", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/modules/data-rights/application/account-erasure")>();
      eraseUserAccount.mockRejectedValue(
        new original.AccountErasureError("ACCOUNT_ERASURE_OWNS_LEGACY_ACADEMIES", "Este perfil es dueño de academias.", 409, { academies: 1 })
      );
      return { ...original, eraseUserAccount };
    });
    selectQueue = [createSelectChain([{ id: "test-id", userId: "user-1", role: "owner" }])];

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
    expect(data.details).toEqual({ academies: 1 });
    expect(eraseUserAccount).toHaveBeenCalledWith(
      expect.anything(),
      { profileId: "test-id", userId: "user-1", actorUserId: "admin-user" }
    );
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

