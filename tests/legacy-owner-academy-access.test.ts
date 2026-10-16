import { beforeEach, describe, expect, it, vi } from "vitest";

const { fixture, schema } = vi.hoisted(() => {
  const column = (tableName: string, columnName: string) => ({
    tableName,
    columnName,
  });
  return {
    fixture: {
      profile: null as Record<string, unknown> | null,
      academy: null as Record<string, unknown> | null,
      membership: null as Record<string, unknown> | null,
      joins: [] as Array<{ table: string; predicate: unknown }>,
      schemaState: "present" as "absent" | "present" | "partial",
      selectCount: 0,
    },
    schema: {
      profiles: {
        tableName: "profiles",
        id: column("profiles", "id"),
        userId: column("profiles", "userId"),
        name: column("profiles", "name"),
        role: column("profiles", "role"),
        tenantId: column("profiles", "tenantId"),
        canLogin: column("profiles", "canLogin"),
        isSuspended: column("profiles", "isSuspended"),
      },
      academies: {
        tableName: "academies",
        id: column("academies", "id"),
        name: column("academies", "name"),
        tenantId: column("academies", "tenantId"),
        academyType: column("academies", "academyType"),
        country: column("academies", "country"),
        status: column("academies", "status"),
        isSuspended: column("academies", "isSuspended"),
        ownerId: column("academies", "ownerId"),
      },
      memberships: {
        tableName: "memberships",
        academyId: column("memberships", "academyId"),
        userId: column("memberships", "userId"),
        role: column("memberships", "role"),
      },
    },
  };
});

function columnValue(column: unknown): unknown {
  if (!column || typeof column !== "object") return column;
  const candidate = column as { tableName?: unknown; columnName?: unknown };
  if (
    typeof candidate.tableName !== "string" ||
    typeof candidate.columnName !== "string"
  ) {
    return column;
  }
  const row =
    candidate.tableName === "profiles"
      ? fixture.profile
      : candidate.tableName === "academies"
        ? fixture.academy
        : candidate.tableName === "memberships"
          ? fixture.membership
          : null;
  return row?.[candidate.columnName];
}

function matchesPredicate(predicate: unknown): boolean {
  if (!predicate || typeof predicate !== "object") return true;
  const candidate = predicate as { op?: unknown; args?: unknown[] };
  if (!candidate.op || !Array.isArray(candidate.args)) return true;
  if (candidate.op === "and") return candidate.args.every(matchesPredicate);
  if (candidate.op === "or") return candidate.args.some(matchesPredicate);
  if (candidate.op === "eq") {
    return columnValue(candidate.args[0]) === columnValue(candidate.args[1]);
  }
  return true;
}

vi.mock("@/db/schema", () => schema);
vi.mock("@/db", () => ({
  db: {
    execute: async () => ({
      rows: [
        {
          profiles_present: fixture.schemaState !== "absent",
          academies_present: fixture.schemaState === "present",
          memberships_present: fixture.schemaState !== "absent",
        },
      ],
    }),
    select: () => {
      fixture.selectCount += 1;
      let table = "";
      let predicate: unknown;
      const query = {
        from: (source: { tableName: string }) => {
          table = source.tableName;
          return query;
        },
        where: (nextPredicate: unknown) => {
          predicate = nextPredicate;
          return query;
        },
        limit: async () => {
          fixture.joins.push({ table, predicate });
          const row =
            table === "profiles"
              ? fixture.profile
              : table === "academies"
                ? fixture.academy
                : table === "memberships"
                  ? fixture.membership
                  : null;
          return row && matchesPredicate(predicate) ? [row] : [];
        },
      };
      return query;
    },
  },
}));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  return {
    and: condition("and"),
    asc: (column: unknown) => ({ op: "asc", column }),
    eq: condition("eq"),
    or: condition("or"),
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
      parts,
      values,
    }),
  };
});

import {
  findLegacyAcademyMemberships,
  getLegacyOwnerAcademyAccess,
} from "@/lib/auth/legacy-academy-access";

function predicateHasEquality(
  predicate: unknown,
  columnName: string,
  value: unknown
): boolean {
  if (!predicate || typeof predicate !== "object") return false;
  const node = predicate as { op?: string; args?: unknown[] };
  if (node.op === "eq") {
    const [column, actual] = node.args ?? [];
    return (
      !!column &&
      typeof column === "object" &&
      "columnName" in column &&
      (column as { columnName: string }).columnName === columnName &&
      actual === value
    );
  }
  return (node.args ?? []).some((item) =>
    predicateHasEquality(item, columnName, value)
  );
}

beforeEach(() => {
  fixture.profile = {
    id: "profile-1",
    userId: "user-1",
    name: "Owner",
    role: "owner",
    tenantId: "tenant-1",
    canLogin: true,
    isSuspended: false,
  };
  fixture.academy = {
    id: "academy-1",
    name: "Academia local",
    tenantId: "tenant-1",
    academyType: "artistica",
    country: "ES",
    status: "active",
    isSuspended: false,
    ownerId: "different-profile",
  };
  fixture.membership = {
    academyId: "academy-1",
    userId: "user-1",
    role: "owner",
  };
  fixture.joins = [];
  fixture.schemaState = "present";
  fixture.selectCount = 0;
});

it("no consulta relaciones public si las tres faltan y bloquea esquema parcial", async () => {
  fixture.schemaState = "absent";
  await expect(findLegacyAcademyMemberships("user-1")).resolves.toEqual([]);
  expect(fixture.selectCount).toBe(0);

  fixture.schemaState = "partial";
  await expect(findLegacyAcademyMemberships("user-1")).rejects.toThrow(
    "está incompleto"
  );
  expect(fixture.selectCount).toBe(0);
});

describe("autorización del dashboard Owner legacy", () => {
  it("acepta la academia exacta por membresía Owner confiable", async () => {
    const access = await getLegacyOwnerAcademyAccess("user-1", "academy-1");

    expect(access?.allowed).toBe(true);
    expect(fixture.joins.map((join) => join.table)).toEqual([
      "profiles",
      "academies",
      "memberships",
    ]);
    const profilePredicate = fixture.joins.find(
      (join) => join.table === "profiles"
    )?.predicate;
    const academyPredicate = fixture.joins.find(
      (join) => join.table === "academies"
    )?.predicate;
    const membershipPredicate = fixture.joins.find(
      (join) => join.table === "memberships"
    )?.predicate;
    expect(predicateHasEquality(profilePredicate, "userId", "user-1")).toBe(
      true
    );
    expect(predicateHasEquality(academyPredicate, "id", "academy-1")).toBe(
      true
    );
    expect(predicateHasEquality(academyPredicate, "tenantId", "tenant-1")).toBe(
      true
    );
    expect(
      predicateHasEquality(membershipPredicate, "academyId", "academy-1")
    ).toBe(true);
    expect(predicateHasEquality(membershipPredicate, "userId", "user-1")).toBe(
      true
    );
  });

  it("rechaza una academia de otro tenant aunque el perfil figure como owner", async () => {
    fixture.academy = {
      ...fixture.academy,
      tenantId: "foreign-tenant",
      ownerId: "profile-1",
    };

    const access = await getLegacyOwnerAcademyAccess("user-1", "academy-1");

    expect(access?.allowed).toBe(false);
    expect(access?.academy).toBeNull();
    expect(fixture.joins.map((join) => join.table)).toEqual([
      "profiles",
      "academies",
    ]);
    const academyPredicate = fixture.joins.find(
      (join) => join.table === "academies"
    )?.predicate;
    expect(predicateHasEquality(academyPredicate, "tenantId", "tenant-1")).toBe(
      true
    );
  });

  it("permite Admin legacy con membresía Owner del enum existente", async () => {
    fixture.profile = { ...fixture.profile, role: "admin" };
    fixture.membership = {
      academyId: "academy-1",
      userId: "user-1",
      role: "owner",
    };

    const access = await getLegacyOwnerAcademyAccess("user-1", "academy-1");

    expect(access?.allowed).toBe(true);
    expect(access?.profile.role).toBe("admin");
    expect(access?.membershipRole).toBe("owner");
  });

  it.each(["coach", "viewer"] as const)(
    "no autoriza membership %s con rol global Owner sin vínculo owner",
    async (membershipRole) => {
      fixture.academy = { ...fixture.academy, ownerId: "different-profile" };
      fixture.membership = {
        academyId: "academy-1",
        userId: "user-1",
        role: membershipRole,
      };

      const access = await getLegacyOwnerAcademyAccess("user-1", "academy-1");

      expect(access?.allowed).toBe(false);
    }
  );
});
