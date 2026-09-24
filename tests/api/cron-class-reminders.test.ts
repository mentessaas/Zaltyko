import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  requireCronAuth: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/email/triggers", () => ({ triggerAttendanceReminders: mocks.trigger }));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/cron-lease", () => ({
  runCronWithLease: vi.fn(async (_name: string, job: () => Promise<unknown>) => ({ acquired: true, value: await job() })),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.error } }));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));

import { GET } from "@/app/api/cron/class-reminders/route";

describe("class reminders cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("ejecuta el trigger global y expone el total entregado", async () => {
    mocks.trigger.mockResolvedValue(2);

    const response = await GET(new Request("https://zaltyko.com/api/cron/class-reminders"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.trigger).toHaveBeenCalledOnce();
    expect(body).toEqual({ ok: true, message: "Recordatorios de clase procesados", remindersSent: 2 });
  });
});
