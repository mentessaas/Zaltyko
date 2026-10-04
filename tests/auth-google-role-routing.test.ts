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
const updateUserMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";
import { GET } from "@/app/auth/redirect/route";
import { GET as oauthCallback } from "@/app/auth/callback/route";

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
        updateUser: updateUserMock.mockResolvedValue({ error: null }),
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

  it("records signup consent from Google before redirecting to onboarding", async () => {
    const request = new Request(
      "http://localhost/auth/callback?code=oauth-code&next=%2Fauth%2Fredirect%3Finitial_role%3Downer&legal_consent_version=v1-2026-08-01&legal_consent_proof=signup%3Aregister-form-v1"
    );

    await expect(oauthCallback(request as never)).rejects.toThrow(
      "REDIRECT:/auth/redirect?initial_role=owner"
    );

    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        legal_consent_version: "v1-2026-08-01",
        legal_consent_proof: "signup:register-form-v1",
      },
    });
  });
});
