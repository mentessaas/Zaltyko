import { describe, it, expect, vi, beforeEach } from "vitest";

// La app móvil no comparte cookies con el navegador: manda
// Authorization: Bearer <jwt>. resolveUserId() debe caer a este
// camino cuando no hay sesión de cookies (ver src/lib/authz/user-resolver.ts).

const getUserMock = vi.fn();
const cookieGetUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: cookieGetUserMock },
  })),
}));

vi.mock("@/lib/supabase/bearer-client", () => ({
  createBearerSupabaseClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
  getBearerToken: vi.fn((request: Request) => {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }),
}));

vi.mock("@/lib/dev-session", () => ({
  getDevSessionFromCookieStore: vi.fn(async () => null),
}));

import { resolveUserId } from "@/lib/authz/user-resolver";

describe("resolveUserId - bearer fallback (app móvil)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGetUserMock.mockResolvedValue({ data: { user: null } });
  });

  it("resuelve el userId desde un Bearer token válido cuando no hay cookies", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-mobile-1", email: "parent@example.com" } },
      error: null,
    });

    const request = new Request("https://api.zaltyko.test/api/me/schedule", {
      headers: { authorization: "Bearer valid.jwt.token" },
    });

    const userId = await resolveUserId(request);

    expect(userId).toBe("user-mobile-1");
    expect(getUserMock).toHaveBeenCalledWith("valid.jwt.token");
  });

  it("devuelve null si Supabase rechaza el token", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    const request = new Request("https://api.zaltyko.test/api/me/schedule", {
      headers: { authorization: "Bearer expired.jwt.token" },
    });

    const userId = await resolveUserId(request);

    expect(userId).toBeNull();
  });

  it("devuelve null sin intentar bearer si no hay header Authorization", async () => {
    const request = new Request("https://api.zaltyko.test/api/me/schedule");

    const userId = await resolveUserId(request);

    expect(userId).toBeNull();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("prioriza la sesión de cookies (web) sobre el bearer", async () => {
    cookieGetUserMock.mockResolvedValue({
      data: { user: { id: "user-web-1" } },
    });
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-mobile-1" } },
      error: null,
    });

    const request = new Request("https://api.zaltyko.test/api/me/schedule", {
      headers: { authorization: "Bearer valid.jwt.token" },
    });

    const userId = await resolveUserId(request);

    expect(userId).toBe("user-web-1");
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
