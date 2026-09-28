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
  it("redirects www before interpreting it as an academy subdomain", async () => {
    const response = await middleware(new NextRequest("https://www.zaltyko.com/pricing", {
      headers: { host: "www.zaltyko.com" },
    }));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://zaltyko.com/pricing");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("preserves security headers and query parameters on academy rewrites", async () => {
    const previous = process.env.ENABLE_ACTOR_PAGES;
    process.env.ENABLE_ACTOR_PAGES = "true";
    try {
      const response = await middleware(new NextRequest("https://club-test.zaltyko.com/?lang=es", {
        headers: { host: "club-test.zaltyko.com" },
      }));
      expect(response.headers.get("x-middleware-rewrite")).toBe("https://zaltyko.com/a/club-test?lang=es");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    } finally {
      if (previous === undefined) delete process.env.ENABLE_ACTOR_PAGES;
      else process.env.ENABLE_ACTOR_PAGES = previous;
    }
  });

  it("hides experimental academy subdomains by default", async () => {
    const response = await middleware(new NextRequest("https://club-test.zaltyko.com/", {
      headers: { host: "club-test.zaltyko.com" },
    }));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

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

  it("blocks Preview writes when its Supabase URL points at production", async () => {
    const previousEnv = process.env.VERCEL_ENV;
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://jegxfahsvugilbthbked.supabase.co";
    try {
      const response = await middleware(
        new NextRequest("https://zaltyko-preview.vercel.app/api/athletes", { method: "POST" })
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: "PREVIEW_WRITE_BLOCKED" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(rateLimitMock).not.toHaveBeenCalled();
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnv;
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }
  });

  it("allows Preview writes when Supabase targets the E2E sandbox", async () => {
    const previousEnv = process.env.VERCEL_ENV;
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL_POOL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://aeeootdmuiqkfeernskw.supabase.co";
    delete process.env.DATABASE_URL_POOL;
    try {
      const response = await middleware(
        new NextRequest("https://zaltyko-preview.vercel.app/api/athletes", { method: "POST" })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(rateLimitMock).toHaveBeenCalledOnce();
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnv;
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL_POOL;
      else process.env.DATABASE_URL_POOL = previousDatabaseUrl;
    }
  });

  it("blocks Preview writes if any database pool still targets production", async () => {
    const previousEnv = process.env.VERCEL_ENV;
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL_POOL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://aeeootdmuiqkfeernskw.supabase.co";
    process.env.DATABASE_URL_POOL =
      "postgresql://postgres.jegxfahsvugilbthbked:placeholder@aws-0-eu-north-1.pooler.supabase.com:6543/postgres";
    try {
      const response = await middleware(
        new NextRequest("https://zaltyko-preview.vercel.app/api/athletes", { method: "POST" })
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: "PREVIEW_WRITE_BLOCKED" });
      expect(rateLimitMock).not.toHaveBeenCalled();
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnv;
      if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL_POOL;
      else process.env.DATABASE_URL_POOL = previousDatabaseUrl;
    }
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
});
