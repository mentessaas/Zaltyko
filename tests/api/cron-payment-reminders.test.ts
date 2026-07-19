import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/email/triggers", () => ({
  triggerScheduledPaymentReminders: mocks.trigger,
}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info, error: mocks.error } }));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));

import { GET } from "@/app/api/cron/payment-reminders/route";

describe("payment reminders cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("expone envíos, fallos y recordatorios sin destinatario", async () => {
    mocks.trigger.mockResolvedValue({
      due: 6,
      sent: 2,
      failed: 1,
      skippedNoRecipient: 2,
      skippedDuplicate: 1,
    });

    const response = await GET(new Request("https://zaltyko.com/api/cron/payment-reminders"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      due: 6,
      sent: 2,
      failed: 1,
      skippedNoRecipient: 2,
      skippedDuplicate: 1,
    });
    expect(mocks.info).toHaveBeenCalledWith(
      "Payment reminders cron completed",
      expect.objectContaining({
        due: 6,
        sent: 2,
        failed: 1,
        skippedNoRecipient: 2,
        skippedDuplicate: 1,
      })
    );
  });
});
