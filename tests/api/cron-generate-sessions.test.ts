import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  requireCronAuth: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/generate-class-sessions", () => ({
  generateSessionsForAllTenants: mocks.generate,
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

import { GET } from "@/app/api/cron/generate-sessions/route";

describe("generate sessions cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCronAuth.mockReturnValue(null);
  });

  it("expone un fallo parcial en vez de declarar éxito total", async () => {
    mocks.generate.mockResolvedValue({
      total_tenants: 2,
      total_classes: 3,
      total_generated: 10,
      total_skipped: 4,
      tenants_succeeded: 1,
      tenants_failed: 1,
      errors: { "tenant-failing": { _tenant: ["database unavailable"] } },
    });

    const response = await GET(
      new Request("https://zaltyko.com/api/cron/generate-sessions") as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      result: {
        tenants_processed: 2,
        errors_count: 1,
      },
    });
  });
});
