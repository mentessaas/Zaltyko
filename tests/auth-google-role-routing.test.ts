import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveUserHomeMock = vi.hoisted(() => vi.fn());
const ensureGlobalProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/resolve-user-home", () => ({
  resolveUserHome: resolveUserHomeMock,
}));

vi.mock("@/lib/auth/ensure-global-profile", () => ({
  ensureGlobalProfile: ensureGlobalProfileMock,
  isOpenRegistrationRole: (value: unknown) =>
    ["owner", "coach", "parent", "athlete", "provider"].includes(String(value)),
}));

const cookiesMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
import { GET } from "@/app/auth/redirect/route";

const user = {
  id: "user-google",
  email: "parent@example.com",
  user_metadata: {},
} as never;

describe("Google signup role routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserHomeMock.mockResolvedValue({
      destination: "owner_setup",
      redirectUrl: "/onboarding/owner",
    });
    ensureGlobalProfileMock.mockResolvedValue({ id: "profile-1" });
    cookiesMock.mockResolvedValue({});
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user } }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      },
    });
  });

  it("uses the selected open-registration role when creating the profile", async () => {
    resolveUserHomeMock
      .mockResolvedValueOnce({ destination: "owner_setup", redirectUrl: "/onboarding/owner" })
      .mockResolvedValueOnce({ destination: "global_dashboard", redirectUrl: "/dashboard/profile", activeAcademyId: null });

    const home = await resolveUserEntry(user, "parent");

    expect(ensureGlobalProfileMock).toHaveBeenCalledWith(user, "parent");
    expect(home.redirectUrl).toBe("/onboarding/parent");
  });

  it("carries the selected role from the OAuth callback to the resolver", async () => {
    resolveUserHomeMock
      .mockResolvedValueOnce({ destination: "owner_setup", redirectUrl: "/onboarding/owner" })
      .mockResolvedValueOnce({ destination: "global_dashboard", redirectUrl: "/dashboard/profile", activeAcademyId: null });

    await expect(
      GET(new Request("http://localhost/auth/redirect?code=oauth-code&initial_role=provider") as never)
    ).rejects.toThrow("REDIRECT:/dashboard/marketplace/mis-productos");

    expect(resolveUserHomeMock).toHaveBeenCalled();
    expect(ensureGlobalProfileMock).toHaveBeenCalledWith(user, "provider");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard/marketplace/mis-productos");
  });
});
