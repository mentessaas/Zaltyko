import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCronAuth: vi.fn(),
  submitIndexNow: vi.fn(),
  getPublicSiteUrl: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  requireCronAuth: mocks.requireCronAuth,
}));
vi.mock("@/lib/seo/indexnow", () => ({
  submitIndexNow: mocks.submitIndexNow,
}));
vi.mock("@/lib/seo/site-url", () => ({
  getPublicSiteUrl: mocks.getPublicSiteUrl,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));
vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ code, message }, { status }),
}));

import { GET } from "@/app/api/cron/indexnow-submit/route";

describe("IndexNow cron contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicSiteUrl.mockReturnValue("https://zaltyko.com");
    mocks.requireCronAuth.mockReturnValue(null);
  });

  function buildRequest() {
    return new Request("https://zaltyko.com/api/cron/indexnow-submit", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
  }

  it("rechaza con 401 cuando requireCronAuth devuelve error", async () => {
    mocks.requireCronAuth.mockReturnValue(
      Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it("envía el conjunto curado de rutas públicas a IndexNow", async () => {
    mocks.submitIndexNow.mockResolvedValue({
      submitted: 12,
      accepted: true,
      status: 202,
    });
    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.urlsSubmitted).toBe(12);
    expect(body.accepted).toBe(true);
    expect(body.upstreamStatus).toBe(202);

    const [submitted] = mocks.submitIndexNow.mock.calls;
    const urls = submitted[0] as string[];
    expect(urls[0]).toBe("https://zaltyko.com/");
    expect(urls).toContain("https://zaltyko.com/pricing");
    expect(urls).toContain("https://zaltyko.com/academias");
    expect(urls).toContain("https://zaltyko.com/faq");
    expect(urls).toContain("https://zaltyko.com/integraciones");
    expect(urls).not.toContain("https://zaltyko.com/app");
    expect(urls).not.toContain("https://zaltyko.com/api");
    expect(urls.every((u) => u.startsWith("https://zaltyko.com/"))).toBe(true);
  });

  it("devuelve 500 con código INDEXNOW_FAILED si submitIndexNow lanza", async () => {
    mocks.submitIndexNow.mockRejectedValue(new Error("network down"));
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INDEXNOW_FAILED");
    expect(mocks.error).toHaveBeenCalled();
  });

  it("propaga accepted=false y status upstream cuando IndexNow rechaza", async () => {
    mocks.submitIndexNow.mockResolvedValue({
      submitted: 12,
      accepted: false,
      status: 422,
      error: "INVALID_URL",
    });
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(body.accepted).toBe(false);
    expect(body.upstreamStatus).toBe(422);
    expect(body.error).toBe("INVALID_URL");
  });
});
