import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getLegacyOwnerAcademyAccess: vi.fn(),
  getDashboardData: vi.fn(),
  getDevSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) => ({
    type: "legacy-dashboard",
    props,
  }),
}));
vi.mock("@/components/dashboard/DashboardPage", () => ({
  DashboardPageSkeleton: () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/dev-session", () => ({
  getDevSessionFromCookieStore: mocks.getDevSession,
}));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  getLegacyOwnerAcademyAccess: mocks.getLegacyOwnerAcademyAccess,
}));
vi.mock("@/lib/dashboard", () => ({
  getDashboardData: mocks.getDashboardData,
}));

import AcademyDashboard from "@/app/app/[academyId]/dashboard/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "owner@example.test" } },
  });
  mocks.getDevSession.mockResolvedValue(null);
  mocks.getLegacyOwnerAcademyAccess.mockResolvedValue({
    profile: { id: "profile-1", role: "owner", name: "Owner" },
    academy: {
      id: "academy-1",
      tenantId: "tenant-1",
      name: "Academia local",
      academyType: "artistica",
      country: "ES",
    },
    allowed: true,
  });
  mocks.getDashboardData.mockResolvedValue({
    academy: {
      name: "Academia local",
      academyType: "artistica",
      country: "ES",
    },
    data: { athletes: [] },
  });
});

describe("auth del dashboard legacy", () => {
  it("carga datos solo después de autorizar la academia exacta", async () => {
    const element = await AcademyDashboard({
      params: Promise.resolve({ academyId: "academy-1" }),
    });

    expect(mocks.getLegacyOwnerAcademyAccess).toHaveBeenCalledWith(
      "user-1",
      "academy-1"
    );
    expect(mocks.getDashboardData).toHaveBeenCalledWith("academy-1");
    expect(element.props).toMatchObject({
      academyId: "academy-1",
      tenantId: "tenant-1",
      profileName: "Owner",
    });
  });

  it("no consulta datos ante membresía ajena o rol sin autoridad Owner", async () => {
    mocks.getLegacyOwnerAcademyAccess.mockResolvedValue({
      profile: { id: "profile-1", role: "coach", name: "Coach" },
      academy: null,
      allowed: false,
    });

    await expect(
      AcademyDashboard({
        params: Promise.resolve({ academyId: "foreign-academy" }),
      })
    ).rejects.toThrow("NOT_FOUND");

    expect(mocks.getDashboardData).not.toHaveBeenCalled();
  });

  it("no usa dev-session como autenticación en producción", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    try {
      await expect(
        AcademyDashboard({
          params: Promise.resolve({ academyId: "academy-1" }),
        })
      ).rejects.toThrow("REDIRECT:/auth/login?next=/app/academy-1/dashboard");
      expect(mocks.getDevSession).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
