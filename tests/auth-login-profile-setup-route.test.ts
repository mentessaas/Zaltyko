import { describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const resolveUserEntry = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/auth/resolve-user-entry", () => ({ resolveUserEntry }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/seo/site-url", () => ({
  getPublicSiteUrl: () => "https://example.test",
}));

import LoginPage from "@/app/auth/login/page";

describe("ruta de login para recuperación de perfil", () => {
  it("mantiene el formulario de recuperación cuando el servidor confirma una sesión", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user" } },
    });

    const page = await LoginPage({
      searchParams: Promise.resolve({ profile_setup: "retry" }),
    });

    expect(page.type).toBeTypeOf("function");
    expect(page.props).toMatchObject({
      profileSetupRetry: true,
      sessionAvailableForRecovery: true,
    });
    expect(resolveUserEntry).not.toHaveBeenCalled();
  });
});
