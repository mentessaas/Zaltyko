import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: mocks.select },
}));
vi.mock("@/lib/supabase/bearer-client", () => ({
  getBearerToken: vi.fn(() => "verified-token"),
  createBearerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-athlete", email: "athlete@example.com" } },
        error: null,
      }),
    },
  })),
}));
vi.mock("@/lib/authz/profile-service", () => ({
  getCurrentProfile: mocks.getCurrentProfile,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "@/app/api/me/charges/route";

describe("GET /api/me/charges authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies an authenticated athlete before reading financial rows", async () => {
    mocks.getCurrentProfile.mockResolvedValue({
      id: "profile-athlete",
      userId: "user-athlete",
      role: "athlete",
      tenantId: "tenant-a",
      canLogin: true,
    });

    const response = await GET(
      new Request("http://localhost/api/me/charges", {
        headers: { authorization: "Bearer verified-token" },
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
