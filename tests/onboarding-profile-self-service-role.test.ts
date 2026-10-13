import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      }),
    },
  }),
}));
import { POST } from "@/app/api/onboarding/profile/route";
describe("self-service profile role boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["owner", "coach", "athlete", "parent", "provider", undefined])(
    "preserves supported registration role %s",
    async (role) => {
      const effectiveRole = role ?? "owner";
      const finalProfile = {
        id: "synthetic-profile",
        name: "Persona sintética",
        role: effectiveRole,
        tenantId: "synthetic-tenant",
        activeAcademyId: null,
      };
      const firstLimit = vi.fn().mockResolvedValue([]);
      const finalLimit = vi.fn().mockResolvedValue([finalProfile]);
      mocks.select
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: firstLimit }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: finalLimit }) }),
        });
      const values = vi
        .fn()
        .mockReturnValue({ returning: async () => [{ id: finalProfile.id }] });
      mocks.insert.mockReturnValue({ values });
      const response = await POST(
        new Request("http://synthetic.test/api/onboarding/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, name: "Persona sintética" }),
        })
      );
      expect(response.status).toBe(200);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          role: effectiveRole,
          userId: "00000000-0000-4000-8000-000000000001",
        })
      );
    }
  );
  it.each([
    "admin",
    "super_admin",
    "manager",
    "unknown",
    42,
    { role: "admin" },
  ])(
    "rejects privileged or invalid role %j before touching profiles",
    async (role) => {
      const response = await POST(
        new Request("http://synthetic.test/api/onboarding/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, name: "Persona sintética" }),
        })
      );
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain("INVALID_ROLE");
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    }
  );
});
