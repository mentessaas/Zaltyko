import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  collect: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mocks.accounts(),
      }),
    }),
  },
}));
vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectDueChargesForAcademy: mocks.collect,
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

import { GET } from "@/app/api/cron/collect-charges/route";

describe("collect charges cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("continúa con las demás academias cuando una falla", async () => {
    mocks.accounts.mockResolvedValue([
      { academyId: "academy-failing" },
      { academyId: "academy-ready" },
    ]);
    mocks.collect
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce({
        attempted: 3,
        paid: 2,
        failed: 1,
        skipped: 0,
      });

    const response = await GET(new Request("https://zaltyko.com/api/cron/collect-charges"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.collect).toHaveBeenNthCalledWith(1, {
      academyId: "academy-failing",
      onlyDue: true,
    });
    expect(mocks.collect).toHaveBeenNthCalledWith(2, {
      academyId: "academy-ready",
      onlyDue: true,
    });
    expect(body).toEqual({
      academies: 2,
      academyErrors: 1,
      attempted: 3,
      paid: 2,
      failed: 1,
      skipped: 0,
    });
    expect(mocks.error).toHaveBeenCalledWith(
      "Collect charges failed for academy",
      expect.any(Error),
      { academyId: "academy-failing" }
    );
  });
});
