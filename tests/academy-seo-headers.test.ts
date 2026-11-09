import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  rateLimit,
  getLimitForRoute: () => ({ limit: 100, window: 60 }),
  getClientIdentifier: () => "ip:test",
}));

import { middleware } from "../middleware";

describe("retired public academy discovery", () => {
  beforeEach(() => {
    rateLimit.mockReset();
    rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 9999999999 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["terminal", "unknown", "active"])("keeps %s details unavailable without reading customer data", async id => {
    const read = vi.fn().mockRejectedValue(new Error("No directory reads permitted by this launch"));
    vi.stubGlobal("fetch", read);
    const response = await middleware(new NextRequest(`https://zaltyko.test/academias/${id}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("answers /academias/<id> from the launch cut, not from a robots lookup", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await middleware(new NextRequest("https://zaltyko.test/academias/club-ejemplo"));
    // The cut's empty 404 with no-store: a robots decision would have let the
    // request through (x-middleware-next) with an X-Robots-Tag of "noindex, noarchive".
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
});

describe("indexing decisions without network", () => {
  beforeEach(() => {
    rateLimit.mockReset();
    rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 9999999999 });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["/", "/pricing", "/features", "/owner", "/staff/accept", "/academias/club-ejemplo", "/api/v1/owner/saas/usage"])(
    "never fetches on %s to decide X-Robots-Tag",
    async path => {
      const network = vi.fn().mockRejectedValue(new Error("middleware must not fetch"));
      vi.stubGlobal("fetch", network);
      await middleware(new NextRequest(`https://zaltyko.test${path}`));
      expect(network).not.toHaveBeenCalled();
    }
  );

  it("does not tag ordinary pages as noindex", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await middleware(new NextRequest("https://zaltyko.test/pricing"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});
