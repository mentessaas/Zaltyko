import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  legacyRows: [] as Array<Record<string, unknown>>,
  schemaState: "present" as "absent" | "present",
  profileQueryCount: 0,
}));

const tables = vi.hoisted(() => ({
  profiles: { tableName: "profiles" },
  invitations: { tableName: "invitations" },
}));

vi.mock("@/db/schema", () => tables);
vi.mock("@/db", () => ({
  db: {
    select: () => {
      let tableName = "";
      const query = {
        from: (table: { tableName: string }) => {
          tableName = table.tableName;
          if (tableName === "profiles") fixture.profileQueryCount += 1;
          return query;
        },
        where: () => query,
        limit: async () =>
          tableName === "profiles" && fixture.profile ? [fixture.profile] : [],
      };
      return query;
    },
  },
}));
vi.mock("@/lib/auth/legacy-academy-access", () => ({
  findLegacyAcademyMemberships: vi.fn(async () => fixture.legacyRows),
  inspectLegacyAcademySchema: vi.fn(async () => fixture.schemaState),
  isAvailableLegacyAcademy: (row: Record<string, unknown>) =>
    row.profileCanLogin === true &&
    row.profileIsSuspended === false &&
    row.academyIsSuspended === false &&
    ["active", "trial"].includes(String(row.academyStatus)),
}));
vi.mock("drizzle-orm", () => {
  const op =
    (name: string) =>
    (...args: unknown[]) => ({ op: name, args });
  return {
    and: op("and"),
    asc: (column: unknown) => ({ op: "asc", column }),
    eq: op("eq"),
    gt: op("gt"),
  };
});

import { resolveUserHome } from "@/lib/auth/resolve-user-home";

const baseProfile = {
  id: "profile-1",
  userId: "user-1",
  role: "owner",
  tenantId: "tenant-1",
  activeAcademyId: "academy-1",
  canLogin: true,
  isSuspended: false,
};

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    profileId: "profile-1",
    profileUserId: "user-1",
    profileRole: "owner",
    profileTenantId: "tenant-1",
    profileCanLogin: true,
    profileIsSuspended: false,
    academyId: "academy-1",
    academyTenantId: "tenant-1",
    academyOwnerId: "profile-1",
    academyStatus: "active",
    academyIsSuspended: false,
    membershipUserId: null,
    membershipRole: null,
    ...overrides,
  };
}

beforeEach(() => {
  fixture.profile = { ...baseProfile };
  fixture.legacyRows = [legacyRow()];
  fixture.schemaState = "present";
  fixture.profileQueryCount = 0;
});

describe("resolveUserHome: Owner legacy", () => {
  it("conserva el dashboard de un Owner cuya academia le pertenece", async () => {
    const result = await resolveUserHome({ userId: "user-1" });

    expect(result).toMatchObject({
      destination: "academy_workspace",
      redirectUrl: "/app/academy-1/dashboard",
      reason: "legacy-owner-membership",
      profileRole: "owner",
      activeAcademyId: "academy-1",
    });
  });

  it("conserva acceso Admin solo con una relación owner verificada", async () => {
    fixture.profile = { ...baseProfile, role: "admin" };
    fixture.legacyRows = [
      legacyRow({
        profileRole: "admin",
        academyOwnerId: "different-profile",
        membershipUserId: "user-1",
        membershipRole: "owner",
      }),
    ];

    const result = await resolveUserHome({ userId: "user-1" });

    expect(result.redirectUrl).toBe("/app/academy-1/dashboard");
  });

  it("no acepta una membresía de academia de otro tenant", async () => {
    fixture.legacyRows = [legacyRow({ academyTenantId: "foreign-tenant" })];

    const result = await resolveUserHome({ userId: "user-1" });

    expect(result.destination).toBe("owner_setup");
    expect(result.activeAcademyId).toBeNull();
  });

  it("usa activeAcademyId solo si coincide con una de varias membresías válidas", async () => {
    fixture.profile = { ...baseProfile, activeAcademyId: "academy-2" };
    fixture.legacyRows = [
      legacyRow(),
      legacyRow({ academyId: "academy-2", academyOwnerId: "profile-1" }),
    ];

    const result = await resolveUserHome({ userId: "user-1" });

    expect(result.redirectUrl).toBe("/app/academy-2/dashboard");
    expect(result.activeAcademyId).toBe("academy-2");
  });

  it("no elige una academia del tenant por el rol Owner si falta el vínculo", async () => {
    fixture.legacyRows = [
      legacyRow({
        academyOwnerId: "different-profile",
        membershipUserId: "user-1",
        membershipRole: "coach",
      }),
    ];

    const result = await resolveUserHome({ userId: "user-1" });

    expect(result.destination).toBe("owner_setup");
    expect(result.activeAcademyId).toBeNull();
  });

  it("no consulta perfiles legacy cuando las tres tablas legacy están ausentes", async () => {
    fixture.schemaState = "absent";
    fixture.profile = null;
    fixture.legacyRows = [];

    const result = await resolveUserHome({ userId: "user-1" });

    expect(result).toMatchObject({
      destination: "owner_setup",
      reason: "legacy-schema-absent",
    });
    expect(fixture.profileQueryCount).toBe(0);
  });
});
