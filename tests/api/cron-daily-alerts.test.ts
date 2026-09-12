import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  capacity: vi.fn(),
  payments: vi.fn(),
  attendance: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/alerts/capacity-alerts", () => ({
  createCapacityNotifications: mocks.capacity,
}));
vi.mock("@/lib/alerts/payment-alerts", () => ({
  createPaymentNotifications: mocks.payments,
}));
vi.mock("@/lib/alerts/attendance/createAttendanceNotifications", () => ({
  createAttendanceNotifications: mocks.attendance,
}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/cron-lease", () => ({
  runCronWithLease: vi.fn(async (_name: string, job: () => Promise<unknown>) => ({ acquired: true, value: await job() })),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info, error: mocks.error } }));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));

import { GET } from "@/app/api/cron/daily-alerts/route";

describe("daily alerts cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("reporta operaciones y academias fallidas sin detener las demás", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            { id: "academy-1", tenantId: "tenant-1", ownerId: "owner-1" },
            { id: "academy-2", tenantId: "tenant-2", ownerId: "owner-2" },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([
              {
                academyId: "academy-1",
                profileId: "profile-admin-1",
                role: "admin",
                membershipRole: "viewer",
              },
              {
                academyId: "academy-2",
                profileId: "profile-coach-2",
                role: "coach",
                membershipRole: "coach",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      });
    mocks.capacity.mockResolvedValue(undefined);
    mocks.payments
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    mocks.attendance.mockResolvedValue(undefined);

    const response = await GET(new Request("https://zaltyko.com/api/cron/daily-alerts"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      academiesProcessed: 2,
      results: {
        capacityAlerts: 2,
        paymentAlerts: 1,
        attendanceAlerts: 2,
      },
    });
    expect(mocks.payments).toHaveBeenCalledTimes(2);
    expect(mocks.payments).toHaveBeenNthCalledWith(1, "academy-1", "tenant-1", ["profile-admin-1"]);
    expect(mocks.payments).toHaveBeenNthCalledWith(2, "academy-2", "tenant-2", []);
    expect(mocks.attendance).toHaveBeenNthCalledWith(
      2,
      "academy-2",
      "tenant-2",
      [],
      ["profile-coach-2"]
    );
  });

  it("no mezcla destinatarios entre academias que comparten tenant", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            { id: "academy-1", tenantId: "shared-tenant", ownerId: "owner-1" },
            { id: "academy-2", tenantId: "shared-tenant", ownerId: "owner-2" },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([
              {
                academyId: "academy-1",
                profileId: "coach-1",
                role: "coach",
                membershipRole: "coach",
              },
              {
                academyId: "academy-2",
                profileId: "admin-2",
                role: "admin",
                membershipRole: "viewer",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      });
    mocks.capacity.mockResolvedValue(undefined);
    mocks.payments.mockResolvedValue(undefined);
    mocks.attendance.mockResolvedValue(undefined);

    await GET(new Request("https://zaltyko.com/api/cron/daily-alerts"));

    expect(mocks.payments).toHaveBeenNthCalledWith(1, "academy-1", "shared-tenant", []);
    expect(mocks.payments).toHaveBeenNthCalledWith(2, "academy-2", "shared-tenant", ["admin-2"]);
    expect(mocks.attendance).toHaveBeenNthCalledWith(1, "academy-1", "shared-tenant", [], ["coach-1"]);
    expect(mocks.attendance).toHaveBeenNthCalledWith(2, "academy-2", "shared-tenant", ["admin-2"], []);
  });
});
