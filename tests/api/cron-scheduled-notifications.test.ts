import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPending: vi.fn(),
  getTemplate: vi.fn(),
  markFailed: vi.fn(),
  markSent: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  adminProfiles: vi.fn(),
  createNotification: vi.fn(),
  sendPush: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/communication-service", () => ({
  getPendingScheduledNotifications: mocks.getPending,
  getMessageTemplateById: mocks.getTemplate,
  markScheduledNotificationFailed: mocks.markFailed,
  markScheduledNotificationSent: mocks.markSent,
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
vi.mock("@/lib/notifications/push-service", () => ({ sendPushToUser: mocks.sendPush }));
vi.mock("@/lib/notifications/notification-service", () => ({
  createNotification: mocks.createNotification,
}));
vi.mock("@/lib/brevo", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: () => mocks.adminProfiles(),
          }),
        }),
      }),
    }),
  },
}));

import { GET, POST } from "@/app/api/cron/scheduled-notifications/route";

const scheduled = {
  id: "notification-1",
  tenantId: "00000000-0000-0000-0000-000000000001",
  groupId: null,
  templateId: "template-1",
  channel: "in_app",
};

const template = {
  templateType: "announcement",
  subject: "Aviso",
  name: "Aviso",
  body: "Hola {{name}}",
};

describe("scheduled notifications cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
    mocks.getPending.mockResolvedValue([]);
    mocks.getTemplate.mockResolvedValue(template);
    mocks.adminProfiles.mockResolvedValue([]);
    mocks.sendPush.mockResolvedValue({ sent: 1, failed: 0 });
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

  it("usa el userId de autenticación y solo marca sent tras entregar", async () => {
    mocks.getPending.mockResolvedValue([scheduled]);
    mocks.adminProfiles.mockResolvedValue([
      {
        userId: "00000000-0000-0000-0000-000000000002",
        name: "Elvis",
        email: "elvis@example.com",
        phone: null,
      },
    ]);

    const response = await GET(new Request("https://zaltyko.com/api/cron/scheduled-notifications"));
    const body = await response.json();

    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-0000-0000-000000000002",
        message: "Hola Elvis",
      })
    );
    expect(mocks.markSent).toHaveBeenCalledWith("notification-1");
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(body).toEqual({ processed: 1, failed: 0, total: 1 });
  });

  it("escapa contenido dinámico antes de construir el HTML del email", async () => {
    mocks.getPending.mockResolvedValue([{ ...scheduled, channel: "email" }]);
    mocks.adminProfiles.mockResolvedValue([
      {
        userId: "00000000-0000-0000-0000-000000000002",
        name: '<img src=x onerror="alert(1)">',
        email: "elvis@example.com",
        phone: null,
      },
    ]);

    await GET(new Request("https://zaltyko.com/api/cron/scheduled-notifications"));

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "<p>Hola &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
      })
    );
    expect(mocks.markSent).toHaveBeenCalledWith("notification-1");
  });

  it("marca failed cuando el canal no puede entregar", async () => {
    mocks.getPending.mockResolvedValue([{ ...scheduled, channel: "email" }]);
    mocks.adminProfiles.mockResolvedValue([
      {
        userId: "00000000-0000-0000-0000-000000000002",
        name: "Elvis",
        email: null,
        phone: null,
      },
    ]);

    const response = await GET(new Request("https://zaltyko.com/api/cron/scheduled-notifications"));
    const body = await response.json();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.markFailed).toHaveBeenCalledWith("notification-1");
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(body).toEqual({ processed: 0, failed: 1, total: 1 });
  });
});
