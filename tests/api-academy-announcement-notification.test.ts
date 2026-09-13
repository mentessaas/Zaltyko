import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  createNotification: vi.fn(),
  sendPushToUser: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@/db/schema/announcements", () => ({
  announcements: {
    id: "announcements.id",
  },
  announcementReadStatus: {
    announcementId: "announcementReadStatus.announcementId",
    userId: "announcementReadStatus.userId",
  },
}));

vi.mock("@/db/schema/memberships", () => ({
  memberships: {
    academyId: "memberships.academyId",
    userId: "memberships.userId",
    role: "memberships.role",
  },
}));

vi.mock("@/db/schema/profiles", () => ({
  profiles: {
    id: "profiles.id",
    userId: "profiles.userId",
    tenantId: "profiles.tenantId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@/lib/authz", () => ({
  withTenant: (handler: unknown) => handler,
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("@/lib/notifications/push-service", () => ({
  sendPushToUser: mocks.sendPushToUser,
}));

vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json({ ok: true, data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ ok: false, code, message }, { status }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/academies/[academyId]/announcements/route";

describe("POST /api/academies/[academyId]/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ role: "owner" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () =>
              Promise.resolve([
                {
                  profileId: "profile-owner",
                  authUserId: "auth-owner",
                },
                {
                  profileId: "profile-member",
                  authUserId: "auth-member",
                },
              ]),
          }),
        }),
      });
    mocks.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([{ id: "announcement-1" }]),
      }),
    });
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });
    mocks.createNotification.mockResolvedValue({ id: "notification-1" });
    mocks.sendPushToUser.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("usa profileId para la notificación y authUserId solo para push", async () => {
    const academyId = "11111111-1111-4111-8111-111111111111";
    const request = new NextRequest(`https://zaltyko.com/api/academies/${academyId}/announcements`, {
      method: "POST",
      body: JSON.stringify({
        title: "Aviso importante",
        content: "La clase del viernes cambia de horario.",
        priority: "high",
      }),
    });

    const response = await POST(request, {
      params: { academyId },
      tenantId: "tenant-1",
      profile: {
        id: "profile-owner",
        userId: "auth-owner",
        role: "owner",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { id: "announcement-1", sentCount: 1 } });
    expect(mocks.createNotification).toHaveBeenCalledWith({
      userId: "profile-member",
      tenantId: "tenant-1",
      type: "announcement",
      title: "Nuevo anuncio: Aviso importante",
      message: "La clase del viernes cambia de horario.",
      data: {
        announcementId: "announcement-1",
        academyId,
        priority: "high",
      },
    });
    expect(mocks.sendPushToUser).toHaveBeenCalledWith("auth-member", expect.any(Object));
  });
});
