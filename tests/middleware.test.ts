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

  it("marks a non-public academy detail as noindex and noarchive", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    const response = await middleware(
      new NextRequest("https://zaltyko.test/academias/123e4567-e89b-12d3-a456-426614174000")
    );

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "https://zaltyko.test/api/public/academies/123e4567-e89b-12d3-a456-426614174000"
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    fetchSpy.mockRestore();
  });

  it("keeps a public academy detail indexable when the public endpoint succeeds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "academy-1" }), { status: 200 })
    );

    const response = await middleware(
      new NextRequest("https://zaltyko.test/academias/123e4567-e89b-12d3-a456-426614174000")
    );

    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    fetchSpy.mockRestore();
  });

  it("fails closed with noindex when the academy status endpoint errors", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 })
    );

    const response = await middleware(
      new NextRequest("https://zaltyko.test/academias/123e4567-e89b-12d3-a456-426614174000")
    );

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
    fetchSpy.mockRestore();
  });

  it("fails closed with noindex when the academy status lookup is unavailable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unavailable"));

    const response = await middleware(
      new NextRequest("https://zaltyko.test/academias/123e4567-e89b-12d3-a456-426614174000")
    );

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
    fetchSpy.mockRestore();
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

  it("keeps the canonical public route /ayuda unlocalized", async () => {
    const response = await middleware(
      new NextRequest("https://zaltyko.test/ayuda", {
        headers: { "accept-language": "en-US" },
      })
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the canonical public route /sobre-nosotros unlocalized", async () => {
    const response = await middleware(
      new NextRequest("https://zaltyko.test/sobre-nosotros", {
        headers: { "accept-language": "en-US" },
      })
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
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

  it("applies the security headers and nonce to public routes", async () => {
    for (const pathname of ["/", "/pricing", "/contact", "/es/gimnasia-artistica"]) {
      const response = await middleware(new NextRequest(`https://zaltyko.test${pathname}`));
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=31536000; includeSubDomains; preload"
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("permissions-policy")).toBe(
        "camera=(), microphone=(), geolocation=(), payment=()"
      );
      expect(response.headers.get("x-dns-prefetch-control")).toBe("off");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain(`script-src 'self'`);
      expect(csp).toContain(`'nonce-${response.headers.get("x-nonce")}'`);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("manifest-src 'self'");
      expect(csp).toContain("img-src 'self' data: blob: https:");
      expect(csp).not.toContain("unsafe-eval");
      expect(csp).not.toContain("google-analytics");
      expect(csp).not.toContain("googletagmanager");
      expect(response.headers.get("x-nonce")).toBeTruthy();
    }
  });

  it("generates a different CSP nonce per request", async () => {
    const first = await middleware(new NextRequest("https://zaltyko.test/"));
    const second = await middleware(new NextRequest("https://zaltyko.test/"));

    expect(first.headers.get("x-nonce")).toBeTruthy();
    expect(second.headers.get("x-nonce")).toBeTruthy();
    expect(first.headers.get("x-nonce")).not.toBe(second.headers.get("x-nonce"));
  });

  it("propagates the nonce and pathname to the downstream request headers", async () => {
    const response = await middleware(new NextRequest("https://zaltyko.test/contact"));
    const nonce = response.headers.get("x-nonce");

    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-x-zaltyko-pathname")).toBe("/contact");
  });

  it("redirects www to the apex host with status 301 and avoids cycling", async () => {
    const redirect = await middleware(
      new NextRequest("https://www.zaltyko.test/pricing?source=test")
    );
    const apex = await middleware(new NextRequest("https://zaltyko.test/pricing?source=test"));

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe(
      "https://zaltyko.test/pricing?source=test"
    );
    expect(apex.headers.get("location")).toBeNull();
    expect(apex.headers.get("x-middleware-next")).toBe("1");
  });
});
