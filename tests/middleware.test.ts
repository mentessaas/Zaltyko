import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rateLimitMock = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  getLimitForRoute: () => ({ limit: 100, window: 60 }),
  getClientIdentifier: () => "ip:test",
}));

import { middleware } from "../middleware";

describe("middleware", () => {
  beforeEach(() => {
    rateLimitMock.mockReset();
    rateLimitMock.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Math.floor(Date.now() / 1000) + 60,
    });
  });

  it("allows an API mutation when the rate limit succeeds", async () => {
    const response = await middleware(
      new NextRequest("https://zaltyko.test/api/athletes", { method: "POST" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("99");
  });

  it("returns 429 only when the rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await middleware(
      new NextRequest("https://zaltyko.test/api/athletes", { method: "POST" })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("does not localize application or commercial routes without localized handlers", async () => {
    const pricingResponse = await middleware(new NextRequest("https://zaltyko.test/pricing"));
    const academyResponse = await middleware(
      new NextRequest("https://zaltyko.test/app/academy-1/dashboard")
    );

    expect(pricingResponse.headers.get("location")).toBeNull();
    expect(pricingResponse.headers.get("x-middleware-next")).toBe("1");
    expect(academyResponse.headers.get("location")).toBeNull();
    expect(academyResponse.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps SEO cluster routes localized", async () => {
    const response = await middleware(
      new NextRequest("https://zaltyko.test/gimnasia-artistica/espana", {
        headers: { "accept-language": "es-ES" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://zaltyko.test/es/gimnasia-artistica/espana"
    );
  });
});
