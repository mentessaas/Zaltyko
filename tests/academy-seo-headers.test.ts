import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({
  rateLimit,
  getLimitForRoute: () => ({ limit: 100, window: 60 }),
  getClientIdentifier: () => "ip:test",
}));

import { middleware } from "../middleware";

describe("X-Robots-Tag de detalles de academia", () => {
  beforeEach(() => {
    rateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 9999999999 });
  });

  it("emite noindex/noarchive para una academia no publicable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const response = await middleware(new NextRequest("https://zaltyko.test/academias/terminal"));
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
  });

  it("falla cerrado si no puede consultar el estado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await middleware(new NextRequest("https://zaltyko.test/academias/unknown"));
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
  });

  it("no añade la cabecera cuando el detalle elegible responde 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const response = await middleware(new NextRequest("https://zaltyko.test/academias/active"));
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
});
