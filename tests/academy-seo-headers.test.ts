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
});
