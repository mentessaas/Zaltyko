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
        innerJoin: () => ({
          where: () => ({
            limit: () => mocks.accounts(),
            then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
              mocks.accounts().then(resolve, reject),
          }),
        }),
        where: () => ({
          limit: () => mocks.accounts(),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            mocks.accounts().then(resolve, reject),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/stripe/charge-collection-service", () => ({
  collectDueChargesForAcademy: mocks.collect,
}));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/cron-lease", () => ({
  runCronWithLease: vi.fn(async (_name: string, job: () => Promise<unknown>) => ({ acquired: true, value: await job() })),
}));
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

  it("responde desactivado y no consulta academias ni intenta cobros", async () => {
    const response = await GET(new Request("https://zaltyko.com/api/cron/collect-charges"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "disabled",
      reason: "FAMILY_AUTOMATIC_COLLECTION_DISABLED",
      processed: 0,
    });
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
