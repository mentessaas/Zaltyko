import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantContext = vi.hoisted(() => ({
  tenantId: "tenant-1",
  userId: "22222222-2222-4222-8222-222222222222",
  profile: {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "22222222-2222-4222-8222-222222222222",
    role: "owner",
    activeAcademyId: "11111111-1111-4111-8111-111111111111",
    canLogin: true,
  },
}));

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

const verifyAcademyAccessMock = vi.hoisted(() => vi.fn());
const resolveUserHomeMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/auth/resolve-user-home", () => ({
  resolveUserHome: resolveUserHomeMock,
}));

vi.mock("@/lib/brevo", () => ({
  sendEmail: sendEmailMock,
}));

import { POST } from "@/app/api/link-requests/route";
import { PATCH } from "@/app/api/link-requests/[requestId]/route";

function createSelectQuery(result: unknown) {
  const terminal = {
    limit: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  const where = vi.fn(() => terminal);
  const joinable = {
    innerJoin: vi.fn(() => joinable),
    where,
  };

  return {
    from: vi.fn(() => joinable),
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
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createUpdateReturningQuery(result: unknown) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

function createUpdateQuery(result?: unknown) {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

describe("academy link requests API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    dbMock.update.mockReset();
    tenantContext.tenantId = "tenant-1";
    tenantContext.userId = "22222222-2222-4222-8222-222222222222";
    tenantContext.profile = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "22222222-2222-4222-8222-222222222222",
      role: "owner",
      activeAcademyId: "11111111-1111-4111-8111-111111111111",
      canLogin: true,
    };
    verifyAcademyAccessMock.mockResolvedValue({ allowed: true });
    resolveUserHomeMock.mockResolvedValue({
      redirectUrl: "/app/11111111-1111-4111-8111-111111111111/my-dashboard",
      activeAcademyId: "11111111-1111-4111-8111-111111111111",
    });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("creates a pending link request for an existing account found by exact email", async () => {
    const target = {
      profileId: "55555555-5555-4555-8555-555555555555",
      tenantId: "tenant-target-1",
      userId: "44444444-4444-4444-8444-444444444444",
      name: "Tutor Example",
      email: "parent@example.com",
    };
    const createdRequest = {
      id: "66666666-6666-4666-8666-666666666666",
      status: "pending",
      createdAt: new Date("2026-06-23T10:00:00Z"),
    };
    const linkRequestInsert = createInsertReturningQuery([createdRequest]);
    const notificationInsert = createInsertQuery();

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([{ name: "Academia Centro" }]))
      .mockImplementationOnce(() => createSelectQuery([target]))
      .mockImplementationOnce(() => createSelectQuery([]))
      .mockImplementationOnce(() => createSelectQuery([]));
    dbMock.insert
      .mockImplementationOnce(() => linkRequestInsert)
      .mockImplementationOnce(() => notificationInsert);

    const response = await POST(
      new Request("http://localhost/api/link-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId: "11111111-1111-4111-8111-111111111111",
          email: "PARENT@example.com",
          role: "parent",
          message: "Te invitamos a vincularte.",
        }),
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        linkRequest: {
          id: "66666666-6666-4666-8666-666666666666",
          status: "pending",
        },
        target: {
          name: "Tutor Example",
          email: "parent@example.com",
        },
      },
    });
    expect(linkRequestInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: "11111111-1111-4111-8111-111111111111",
        targetProfileId: "55555555-5555-4555-8555-555555555555",
        requestedProfileRole: "parent",
        requestedMembershipRole: "viewer",
        status: "pending",
      })
    );
    expect(notificationInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-target-1",
        userId: "55555555-5555-4555-8555-555555555555",
        type: "academy_link_request",
      })
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        subject: expect.stringContaining("Solicitud de vinculacion"),
      })
    );
  });

  it("lets the target user accept and creates the academy membership", async () => {
    tenantContext.userId = "44444444-4444-4444-8444-444444444444";
    tenantContext.profile = {
      id: "55555555-5555-4555-8555-555555555555",
      userId: "44444444-4444-4444-8444-444444444444",
      role: "parent",
      activeAcademyId: null,
      canLogin: true,
    };

    const linkRequest = {
      id: "66666666-6666-4666-8666-666666666666",
      tenantId: "tenant-1",
      academyId: "11111111-1111-4111-8111-111111111111",
      targetProfileId: "55555555-5555-4555-8555-555555555555",
      requestedMembershipRole: "viewer",
      status: "pending",
    };

    const membershipInsert = createInsertQuery();
    const profileUpdate = createUpdateQuery();
    const requestUpdate = createUpdateQuery();

    dbMock.select
      .mockImplementationOnce(() => createSelectQuery([linkRequest]));
    dbMock.insert.mockImplementationOnce(() => membershipInsert);
    dbMock.update
      .mockImplementationOnce(() => createUpdateReturningQuery([linkRequest]))
      .mockImplementationOnce(() => profileUpdate)
      .mockImplementationOnce(() => requestUpdate);

    const response = await PATCH(
      new Request("http://localhost/api/link-requests/66666666-6666-4666-8666-666666666666", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      }),
      { params: { requestId: "66666666-6666-4666-8666-666666666666" } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        success: true,
        status: "accepted",
        academyId: "11111111-1111-4111-8111-111111111111",
        redirectUrl: "/app/11111111-1111-4111-8111-111111111111/my-dashboard",
      },
    });
    expect(membershipInsert.values).toHaveBeenCalledWith({
      userId: "44444444-4444-4444-8444-444444444444",
      academyId: "11111111-1111-4111-8111-111111111111",
      role: "viewer",
    });
    expect(profileUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        activeAcademyId: "11111111-1111-4111-8111-111111111111",
        tenantId: "tenant-1",
      })
    );
    expect(requestUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
      })
    );
  });
});
