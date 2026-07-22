import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  academies: vi.fn(),
  send: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => mocks.academies(),
    }),
  },
}));
vi.mock("@/lib/alerts/class-reminders", () => ({ sendClassReminders: mocks.send }));
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

import { GET } from "@/app/api/cron/class-reminders/route";

describe("class reminders cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("continúa y reporta el resultado real cuando una academia falla", async () => {
    mocks.academies.mockResolvedValue([
      { id: "academy-failing", tenantId: "tenant-1" },
      { id: "academy-ready", tenantId: "tenant-2" },
    ]);
    mocks.send
      .mockRejectedValueOnce(new Error("temporary notification failure"))
      .mockResolvedValueOnce(undefined);

    const response = await GET(new Request("https://zaltyko.com/api/cron/class-reminders"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenNthCalledWith(1, "academy-failing", "tenant-1", 24);
    expect(mocks.send).toHaveBeenNthCalledWith(2, "academy-ready", "tenant-2", 24);
    expect(body).toEqual({ ok: true, message: "Class reminders sent successfully", academiesProcessed: 2 });
    expect(mocks.error).toHaveBeenCalledWith(
      "Error sending reminders for academy academy-failing",
      expect.any(Error),
      { academyId: "academy-failing" }
    );
  });
});
