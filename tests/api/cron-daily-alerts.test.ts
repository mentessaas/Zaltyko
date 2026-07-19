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
        from: () => Promise.resolve([
          { id: "academy-1", tenantId: "tenant-1" },
          { id: "academy-2", tenantId: "tenant-2" },
        ]),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            { userId: "admin-1", tenantId: "tenant-1", role: "admin" },
            { userId: "coach-2", tenantId: "tenant-2", role: "coach" },
          ]),
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
      academiesSucceeded: 1,
      academiesFailed: 1,
      operationsFailed: 1,
      results: {
        capacity: { succeeded: 2, failed: 0 },
        payments: { succeeded: 1, failed: 1 },
        attendance: { succeeded: 2, failed: 0 },
      },
    });
    expect(mocks.payments).toHaveBeenCalledTimes(2);
  });
});
