import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  select: vi.fn(),
}));

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

import { getUserPermissions } from "@/lib/authz/permissions-service";

describe("getUserPermissions precedence", () => {
  beforeEach(() => {
    mocks.results = [];
    mocks.select.mockReset();
    mocks.select.mockImplementation(() =>
      makeSelectChain(mocks.results.shift() ?? [])
    );
  });

  it("grants all permissions only to the real owner of this academy", async () => {
    mocks.results = [
      [{ id: "profile-owner", role: "owner" }],
      [{ ownerId: "profile-owner" }],
      [],
    ];

    const result = await getUserPermissions("user-owner", "academy-a");
    expect(result).toMatchObject({ isOwner: true, source: "owner" });
  });

  it("uses explicit coach baseline when no custom role exists", async () => {
    mocks.results = [
      [{ id: "profile-coach", role: "coach" }],
      [{ ownerId: "profile-owner" }],
      [{ role: "coach" }],
      [],
    ];

    const result = await getUserPermissions("user-coach", "academy-a");
    expect(result).toMatchObject({ isOwner: false, roleId: null, source: "baseline" });
    expect(result.permissions).toContain("classes:schedule");
    expect(result.permissions).not.toContain("billing:read");
  });

  it("uses an active custom role as the restrictive permission source", async () => {
    mocks.results = [
      [{ id: "profile-coach", role: "coach" }],
      [{ ownerId: "profile-owner" }],
      [{ role: "coach" }],
      [{ roleId: "role-1", expiresAt: null, customPermissions: [] }],
      [{
        id: "role-1",
        academyId: "academy-a",
        name: "Lectura atletas",
        permissions: ["athletes:read"],
        inheritsFrom: null,
        isActive: true,
      }],
    ];

    const result = await getUserPermissions("user-coach", "academy-a");
    expect(result).toMatchObject({ roleId: "role-1", source: "custom", isOwner: false });
    expect(result.permissions).toEqual(["athletes:read"]);
  });

  it("denies an expired custom role instead of falling back to baseline", async () => {
    mocks.results = [
      [{ id: "profile-coach", role: "coach" }],
      [{ ownerId: "profile-owner" }],
      [{ role: "coach" }],
      [{ roleId: "role-expired", expiresAt: new Date("2020-01-01"), customPermissions: [] }],
    ];

    const result = await getUserPermissions("user-coach", "academy-a");
    expect(result).toMatchObject({
      permissions: [],
      source: "denied",
      denialReason: "expired_assignment",
      isOwner: false,
    });
  });

  it("denies an assignment whose academy role is inactive", async () => {
    mocks.results = [
      [{ id: "profile-coach", role: "coach" }],
      [{ ownerId: "profile-owner" }],
      [{ role: "coach" }],
      [{ roleId: "role-inactive", expiresAt: null, customPermissions: ["billing:read"] }],
      [{
        id: "role-inactive",
        academyId: "academy-a",
        name: "Inactivo",
        permissions: ["billing:read"],
        inheritsFrom: null,
        isActive: false,
      }],
    ];

    const result = await getUserPermissions("user-coach", "academy-a");
    expect(result).toMatchObject({
      permissions: [],
      source: "denied",
      denialReason: "inactive_role",
      isOwner: false,
    });
  });

  it("denies a global owner who has no ownership or membership in this academy", async () => {
    mocks.results = [
      [{ id: "profile-owner-a", role: "owner" }],
      [{ ownerId: "profile-owner-b" }],
      [],
      [],
    ];

    await expect(getUserPermissions("owner-a", "academy-b")).resolves.toMatchObject({
      permissions: [],
      isOwner: false,
      source: "denied",
      denialReason: "no_membership",
    });
  });
});
