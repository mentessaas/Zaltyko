import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const resolveUserHomeMock = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/resolve-user-home", () => ({
  resolveUserHome: resolveUserHomeMock,
}));

vi.mock("@/db", () => ({
  db: dbMock,
}));

import { POST } from "@/app/api/invitations/complete/route";

function createSelectQuery(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function createInsertReturningQuery(result: unknown) {
  return {
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createInsertQuery(result?: unknown) {
  return {
    values: vi.fn().mockResolvedValue(result),
  };
}

function createUpdateQuery(result?: unknown) {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

describe("critical invitation flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "coach@example.com",
            },
          },
        }),
      },
    });

    resolveUserHomeMock.mockResolvedValue({
      destination: "academy_workspace",
      redirectUrl: "/app/academy-1/dashboard",
      activeAcademyId: "academy-1",
    });
  });

  it("returns the resolved academy redirect for an invited coach", async () => {
    const invitation = {
      id: "invite-1",
      token: "token-1",
      email: "coach@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      role: "coach",
      tenantId: "tenant-1",
      defaultAcademyId: "academy-1",
      academyIds: ["academy-1"],
    };

    const createdProfile = {
      id: "profile-1",
      userId: "user-1",
      tenantId: "tenant-1",
      activeAcademyId: "academy-1",
    };

    const profileInsert = createInsertReturningQuery([createdProfile]);
    const membershipInsert = createInsertQuery();
    const invitationUpdate = createUpdateQuery();

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([invitation]))
      .mockImplementationOnce(() => createSelectQuery([]))
      .mockImplementationOnce(() => createSelectQuery([]));
    dbMock.insert
      .mockImplementationOnce(() => profileInsert)
      .mockImplementationOnce(() => membershipInsert);
    dbMock.update.mockImplementation(() => invitationUpdate);

    const response = await POST(
      new Request("http://localhost/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitation.token, name: "Coach Example" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        success: true,
        role: "coach",
        academyId: "academy-1",
        redirectUrl: "/app/academy-1/dashboard",
      },
    });

    expect(resolveUserHomeMock).toHaveBeenCalledWith({
      userId: "user-1",
      email: "coach@example.com",
    });
    expect(membershipInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        academyId: "academy-1",
        role: "coach",
      })
    );
  });

  it("maps invited parents to viewer membership and profile redirect", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-parent",
              email: "parent@example.com",
            },
          },
        }),
      },
    });

    resolveUserHomeMock.mockResolvedValue({
      destination: "global_dashboard",
      redirectUrl: "/dashboard/profile",
      activeAcademyId: null,
    });

    const invitation = {
      id: "invite-parent",
      token: "token-parent",
      email: "parent@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      role: "parent",
      tenantId: "tenant-1",
      defaultAcademyId: "academy-family",
      academyIds: ["academy-family"],
    };

    const createdProfile = {
      id: "profile-parent",
      userId: "user-parent",
      tenantId: "tenant-1",
      activeAcademyId: "academy-family",
    };

    const profileInsert = createInsertReturningQuery([createdProfile]);
    const membershipInsert = createInsertQuery();
    const invitationUpdate = createUpdateQuery();

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([invitation]))
      .mockImplementationOnce(() => createSelectQuery([]))
      .mockImplementationOnce(() => createSelectQuery([]));
    dbMock.insert
      .mockImplementationOnce(() => profileInsert)
      .mockImplementationOnce(() => membershipInsert);
    dbMock.update.mockImplementation(() => invitationUpdate);

    const response = await POST(
      new Request("http://localhost/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitation.token, name: "Parent Example" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        role: "parent",
        academyId: null,
        redirectUrl: "/dashboard/profile",
      },
    });
    expect(membershipInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-parent",
        academyId: "academy-family",
        role: "viewer",
      })
    );
  });

  it("rejects invitation acceptance when the session email does not match", async () => {
    const invitation = {
      id: "invite-2",
      token: "token-2",
      email: "owner@example.com",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      role: "owner",
      tenantId: "tenant-1",
      defaultAcademyId: "academy-1",
      academyIds: ["academy-1"],
    };

    dbMock.select.mockImplementationOnce(() => createSelectQuery([invitation]));

    const response = await POST(
      new Request("http://localhost/api/invitations/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitation.token }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "EMAIL_MISMATCH",
      code: "EMAIL_MISMATCH",
    });
    expect(resolveUserHomeMock).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
