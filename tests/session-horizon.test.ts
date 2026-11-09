import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extend: vi.fn(),
  lease: vi.fn(),
}));

vi.mock("@/modules/scheduling/application/session-horizon", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/scheduling/application/session-horizon")>();
  return { ...actual, extendSessionHorizons: mocks.extend };
});
vi.mock("@/lib/cron-lease", () => ({ runCronWithLease: mocks.lease }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  SESSION_HORIZON_REFILL_DAYS,
  SESSION_HORIZON_TARGET_DAYS,
  computeSessionHorizonRange,
} from "@/modules/scheduling/application/session-horizon";
import { GET, POST } from "@/app/api/cron/session-horizon/route";

describe("computeSessionHorizonRange", () => {
  it("keeps the refill and target windows of class creation", () => {
    expect(SESSION_HORIZON_REFILL_DAYS).toBe(60);
    expect(SESSION_HORIZON_TARGET_DAYS).toBe(120);
  });

  it("does nothing while generated sessions still cover the refill window", () => {
    expect(
      computeSessionHorizonRange({
        today: "2026-11-08",
        lastGeneratedDate: "2027-01-07",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
      })
    ).toBeNull();
  });

  it("continues the day after the last generated session up to 120 days ahead", () => {
    expect(
      computeSessionHorizonRange({
        today: "2026-11-08",
        lastGeneratedDate: "2026-12-20",
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
      })
    ).toEqual({ startDate: "2026-12-21", endDate: "2027-03-07" });
  });

  it("never generates past days and respects a future start or an end date", () => {
    expect(
      computeSessionHorizonRange({
        today: "2026-11-08",
        lastGeneratedDate: "2026-10-01",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-12-31",
      })
    ).toEqual({ startDate: "2026-11-08", endDate: "2026-12-31" });
    expect(
      computeSessionHorizonRange({
        today: "2026-11-08",
        lastGeneratedDate: null,
        effectiveFrom: "2026-11-20",
        effectiveTo: null,
      })
    ).toEqual({ startDate: "2026-11-20", endDate: "2027-03-07" });
  });

  it("returns null when the template already ended", () => {
    expect(
      computeSessionHorizonRange({
        today: "2026-11-08",
        lastGeneratedDate: "2026-11-01",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-11-05",
      })
    ).toBeNull();
  });
});

describe("session horizon cron route", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "synthetic-cron-secret";
    mocks.lease.mockImplementation(async (_name: string, job: () => Promise<unknown>) => ({
      acquired: true,
      value: await job(),
    }));
    mocks.extend.mockResolvedValue({ checked: 2, extended: 1, skippedReadOnly: 1, failed: 0, truncated: false });
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects requests without the cron secret and does not run the job", async () => {
    const response = await GET(new Request("https://example.test/api/cron/session-horizon"));
    expect(response.status).toBe(401);
    expect(mocks.extend).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(
      new Request("https://example.test/api/cron/session-horizon", {
        headers: { authorization: "Bearer anything" },
      })
    );
    expect(response.status).toBe(503);
    expect(mocks.extend).not.toHaveBeenCalled();
  });

  it("runs once under the lease for Vercel cron (GET) and manual POST", async () => {
    for (const handler of [GET, POST]) {
      const response = await handler(
        new Request("https://example.test/api/cron/session-horizon", {
          headers: { authorization: "Bearer synthetic-cron-secret" },
        })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({ skipped: false, extended: 1, skippedReadOnly: 1 });
    }
    expect(mocks.lease).toHaveBeenCalledWith("cron:session-horizon", expect.any(Function));
    expect(mocks.extend).toHaveBeenCalledTimes(2);
  });

  it("reports a held lease without running the job", async () => {
    mocks.lease.mockResolvedValueOnce({ acquired: false });
    const response = await GET(
      new Request("https://example.test/api/cron/session-horizon", {
        headers: { authorization: "Bearer synthetic-cron-secret" },
      })
    );
    expect((await response.json()).data).toEqual({ skipped: true, reason: "LEASE_HELD" });
    expect(mocks.extend).not.toHaveBeenCalled();
  });
});
