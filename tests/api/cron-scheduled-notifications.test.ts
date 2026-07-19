import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/communication-service", () => ({
  getPendingScheduledNotifications: mocks.getPending,
  getMessageTemplateById: vi.fn(),
  markScheduledNotificationFailed: vi.fn(),
  markScheduledNotificationSent: vi.fn(),
}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));
vi.mock("@/lib/notifications/push-service", () => ({ sendPushToUser: vi.fn() }));
vi.mock("@/lib/notifications/notification-service", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/brevo", () => ({ sendEmail: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema/profiles", () => ({ profiles: {} }));

import { GET, POST } from "@/app/api/cron/scheduled-notifications/route";

describe("scheduled notifications cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
    mocks.getPending.mockResolvedValue([]);
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
  ])("procesa el cron mediante %s", async (_method, handler) => {
    const response = await handler(new Request("https://zaltyko.com/api/cron/scheduled-notifications"));

    expect(response.status).toBe(200);
    expect(mocks.getPending).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith(
      "Scheduled notifications cron completed",
      expect.objectContaining({ total: 0, processed: 0, failed: 0 })
    );
  });
});
