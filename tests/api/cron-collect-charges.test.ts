import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  collect: vi.fn(),
  requireCronAuth: vi.fn(),
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
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
}));

import { GET } from "@/app/api/cron/collect-charges/route";

describe("collect charges cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("rechaza una llamada no autenticada antes de entrar en la ruta", async () => {
    mocks.requireCronAuth.mockReturnValue(new Response(null, { status: 401 }));

    const response = await GET(new Request("https://zaltyko.com/api/cron/collect-charges"));

    expect(response.status).toBe(401);
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("mantiene autenticación pero no intenta cobros hasta que exista opt-in seguro", async () => {
    const response = await GET(new Request("https://zaltyko.com/api/cron/collect-charges"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ skipped: true, reason: "AUTOMATIC_COLLECTION_NOT_ENABLED" });
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
