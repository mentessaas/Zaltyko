import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  inspectLegacyAcademySchema: vi.fn(async () => "present"),
  findLegacyAcademyMemberships: vi.fn(),
  isAvailableLegacyAcademy: vi.fn(),
}));
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { isSuperAdmin } from "@/lib/authz/super-admin";
it("blocks a suspended super-admin before resolving an academy", async () => {
  const q = {} as {
    from: (...args: unknown[]) => unknown;
    where: (...args: unknown[]) => unknown;
    limit: (...args: unknown[]) => Promise<unknown[]>;
  };
  q.from = vi.fn(() => q);
  q.where = vi.fn(() => q);
  q.limit = vi.fn(async () => [
    {
      id: "profile",
      userId: "user",
      role: "super_admin",
      canLogin: true,
      isSuspended: true,
      activeAcademyId: null,
    },
  ]);
  mocks.select.mockReturnValue(q);
  expect(await resolveUserHome({ userId: "user" })).toMatchObject({
    destination: "blocked",
  });
  expect(await isSuperAdmin("user")).toBe(false);
});
