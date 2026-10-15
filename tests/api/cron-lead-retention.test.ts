import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: mocks.requireCronAuth }));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));

import { GET } from "@/app/api/cron/lead-retention/route";

function makeTransaction(expiredLeadRows: Array<{ id: string }>) {
  const expiredQuery = {
    from: vi.fn(() => expiredQuery),
    where: vi.fn(() => expiredQuery),
    orderBy: vi.fn(() => expiredQuery),
    limit: vi.fn().mockResolvedValue(expiredLeadRows),
  };
  const interactionQuery = {
    from: vi.fn(() => interactionQuery),
    where: vi.fn().mockResolvedValue([{ visitorId: "visitor-1" }]),
  };
  const trialQuery = {
    from: vi.fn(() => trialQuery),
    where: vi.fn().mockResolvedValue([{ id: "trial-1" }]),
  };
  const tx = {
    select: vi
      .fn()
      .mockReturnValueOnce(expiredQuery)
      .mockReturnValueOnce(interactionQuery)
      .mockReturnValueOnce(trialQuery),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "interview-1" }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  };
  return tx;
}

describe("lead retention cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("requires cron authentication before opening a transaction", async () => {
    mocks.requireCronAuth.mockReturnValue(
      Response.json({ code: "UNAUTHORIZED" }, { status: 401 })
    );

    const response = await GET(
      new Request("https://zaltyko.com/api/cron/lead-retention")
    );

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("anonymizes old interview details and removes expired prospect data atomically", async () => {
    const tx = makeTransaction([{ id: "lead-1" }]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await GET(
      new Request("https://zaltyko.com/api/cron/lead-retention")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      deletedLeads: 1,
      anonymizedInterviews: 1,
      retentionMonths: 12,
      batchLimit: 250,
    });
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(tx.delete).toHaveBeenCalledTimes(3);
    expect(mocks.info).toHaveBeenCalledWith(
      "Lead retention completed",
      expect.objectContaining({ deletedLeads: 1 })
    );
  });

  it("cleans old contact notification logs but keeps lead rows when there are no expired leads", async () => {
    const tx = makeTransaction([]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const response = await GET(
      new Request("https://zaltyko.com/api/cron/lead-retention")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ deletedLeads: 0, anonymizedInterviews: 0 });
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });
});
