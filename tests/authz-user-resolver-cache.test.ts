import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookieStore: {
    getAll: vi.fn(() => [{ name: "sb-test-auth-token", value: "verified-token" }]),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/dev-session", () => ({
  getDevSessionFromCookieStore: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

describe("resolveUserId auth lookup deduplication", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("shares one verified Supabase lookup across concurrent requests with the same cookie", async () => {
    const { resolveUserId } = await import("@/lib/authz/user-resolver");

    const [first, second, third] = await Promise.all([
      resolveUserId(new Request("http://localhost/api/one")),
      resolveUserId(new Request("http://localhost/api/two")),
      resolveUserId(new Request("http://localhost/api/three")),
    ]);

    expect([first, second, third]).toEqual(["user-1", "user-1", "user-1"]);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});
