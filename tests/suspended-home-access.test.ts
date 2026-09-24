import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: mocks }));
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { isSuperAdmin } from "@/lib/authz/super-admin";
it("blocks a suspended super-admin before resolving an academy", async () => {
  const q: Record<string, any> = {};
  for (const op of ["from", "where"]) q[op] = vi.fn(() => q);
  q.limit = vi.fn(async () => [{ id: "profile", userId: "user", role: "super_admin", canLogin: true, isSuspended: true, activeAcademyId: null }]);
  mocks.select.mockReturnValue(q);
  expect(await resolveUserHome({ userId: "user" })).toMatchObject({ destination: "blocked" });
  expect(await isSuperAdmin("user")).toBe(false);
});
