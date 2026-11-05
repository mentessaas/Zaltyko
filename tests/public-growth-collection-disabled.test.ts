import { afterEach, describe, expect, it, vi } from "vitest";

const forbidden = vi.hoisted(() => ({ recordGrowthEvent: vi.fn(), withRateLimit: vi.fn() }));
vi.mock("@/lib/growth/events", () => ({ recordGrowthEvent: forbidden.recordGrowthEvent }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: forbidden.withRateLimit }));

import { POST } from "@/app/api/growth/events/route";

describe("optional public growth collection remains closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([undefined, "false", "true"])("does not read or persist a forged body when attribution flag is %s", async (flag) => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION", flag);
    const request = new Request("http://localhost/api/growth/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "pricing_viewed", consent: "granted", properties: { utm_source: "synthetic" } }),
    });
    const read = vi.spyOn(request, "json");
    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ ok: false, code: "NOT_AVAILABLE" });
    expect(read).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
    expect(forbidden.recordGrowthEvent).not.toHaveBeenCalled();
    expect(forbidden.withRateLimit).not.toHaveBeenCalled();
  });
});
