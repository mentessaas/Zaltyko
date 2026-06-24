import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantContext = vi.hoisted(() => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  profile: {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "22222222-2222-4222-8222-222222222222",
    role: "owner",
    activeAcademyId: "44444444-4444-4444-8444-444444444444",
    canLogin: true,
  },
}));

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const verifyAcademyAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/authz", () => ({
  withTenant:
    (handler: (request: Request, context: Record<string, unknown>) => Promise<Response>) =>
    (request: Request, context?: Record<string, unknown>) =>
      handler(request, {
        ...context,
        ...tenantContext,
      }),
}));

vi.mock("@/lib/permissions", () => ({
  verifyAcademyAccess: verifyAcademyAccessMock,
}));

import { DELETE } from "@/app/api/academy-memberships/[membershipId]/route";

function createSelectQuery(result: unknown) {
  return {
    from: vi.fn(() => ({
      innerJoin: vi.fn(function innerJoin(this: any) {
        return this;
      }),
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function createDeleteQuery(result?: unknown) {
  return {
    where: vi.fn().mockResolvedValue(result),
  };
}

function createUpdateQuery(result?: unknown) {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createInsertQuery(result?: unknown) {
  return {
    values: vi.fn().mockResolvedValue(result),
  };
}

describe("academy memberships API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantContext.profile = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "22222222-2222-4222-8222-222222222222",
      role: "owner",
      activeAcademyId: "44444444-4444-4444-8444-444444444444",
      canLogin: true,
    };
    verifyAcademyAccessMock.mockResolvedValue({ allowed: true });
  });

  it("deletes only the academy membership and keeps the global profile", async () => {
    const membership = {
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
      academyId: "44444444-4444-4444-8444-444444444444",
      role: "viewer",
      profileId: "77777777-7777-4777-8777-777777777777",
      profileTenantId: "88888888-8888-4888-8888-888888888888",
      activeAcademyId: "44444444-4444-4444-8444-444444444444",
      academyName: "Academia Centro",
    };
    const deleteMembership = createDeleteQuery();
    const updateProfile = createUpdateQuery();
    const notificationInsert = createInsertQuery();

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([membership]))
      .mockImplementationOnce(() => createSelectQuery([]));
    dbMock.delete.mockImplementationOnce(() => deleteMembership);
    dbMock.update.mockImplementationOnce(() => updateProfile);
    dbMock.insert.mockImplementationOnce(() => notificationInsert);

    const response = await DELETE(
      new Request("http://localhost/api/academy-memberships/55555555-5555-4555-8555-555555555555", {
        method: "DELETE",
      }),
      { params: { membershipId: "55555555-5555-4555-8555-555555555555" } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        success: true,
        profileId: "77777777-7777-4777-8777-777777777777",
        academyId: "44444444-4444-4444-8444-444444444444",
      },
    });
    expect(deleteMembership.where).toHaveBeenCalled();
    expect(updateProfile.set).toHaveBeenCalledWith({
      activeAcademyId: null,
    });
    expect(notificationInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "88888888-8888-4888-8888-888888888888",
        userId: "77777777-7777-4777-8777-777777777777",
        type: "academy_unlinked",
      })
    );
  });

  it("blocks removing the last owner membership", async () => {
    const ownerMembership = {
      id: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
      academyId: "44444444-4444-4444-8444-444444444444",
      role: "owner",
      profileId: "77777777-7777-4777-8777-777777777777",
      profileTenantId: "88888888-8888-4888-8888-888888888888",
      activeAcademyId: null,
      academyName: "Academia Centro",
    };

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([ownerMembership]))
      .mockImplementationOnce(() => createSelectQuery([]));

    const response = await DELETE(
      new Request("http://localhost/api/academy-memberships/55555555-5555-4555-8555-555555555555", {
        method: "DELETE",
      }),
      { params: { membershipId: "55555555-5555-4555-8555-555555555555" } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "LAST_OWNER_REQUIRED",
    });
    expect(dbMock.delete).not.toHaveBeenCalled();
  });
});
