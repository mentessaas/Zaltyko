import { drizzle } from "drizzle-orm/pg-proxy";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const mocks = vi.hoisted(() => ({
  db: null as Record<string, any> | null,
  resolveOwnerScope: vi.fn(),
  statements: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, property) => {
        const database = mocks.db;
        const member = database?.[property as string];
        return typeof member === "function" ? member.bind(database) : member;
      },
    }
  ),
}));

vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.resolveOwnerScope,
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const classTemplateId = "10000000-0000-4000-8000-000000000003";
const groupId = "10000000-0000-4000-8000-000000000004";
const userId = "10000000-0000-4000-8000-000000000005";

mocks.db = drizzle(
  async (sql, params) => {
    mocks.statements.push({ sql, params });
    if (/from "zaltyko"\."class_templates"/i.test(sql)) {
      return { rows: [{ id: classTemplateId, locationId }] };
    }
    if (/from "zaltyko"\."groups"/i.test(sql)) {
      return { rows: [{ id: groupId }] };
    }
    return { rows: [] };
  },
  {},
  () => new PgDialect()
);

function ownerScope() {
  return {
    organization: {
      id: organizationId,
      name: "Academia de prueba",
      defaultCurrency: "EUR",
    },
    member: {
      id: "10000000-0000-4000-8000-000000000006",
      role: "owner",
      locationScopeMode: "selected",
    },
    locations: [{ id: locationId, name: "Sede autorizada" }],
    selectedLocationId: locationId,
    canViewOrganizationAggregate: false,
  };
}

function expectInnerLimitsAndOuterPage(
  sql: string,
  params: unknown[],
  innerLimitCount: number
) {
  const limits = [...sql.matchAll(/limit \$(\d+)/gi)].map((match) =>
    Number(match[1])
  );
  expect(limits).toHaveLength(innerLimitCount + 1);
  expect(
    limits.slice(0, innerLimitCount).map((index) => params[index - 1])
  ).toEqual(Array.from({ length: innerLimitCount }, () => 1));
  expect(params[limits.at(-1)! - 1]).toBe(20);
}

describe("límites A2 en candidatos Owner", () => {
  beforeEach(() => {
    mocks.statements.length = 0;
    mocks.resolveOwnerScope.mockReset().mockResolvedValue(ownerScope());
  });

  it("compila los EXISTS de inscripción desde el servicio con límite interno y página 20", async () => {
    const { searchOwnerEnrollmentCandidates } =
      await import("@/modules/enrollments/application/enrollment-query-service");

    await searchOwnerEnrollmentCandidates({
      userId,
      organizationId,
      locationId,
      classTemplateId,
      query: "Ana",
    });

    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
    const candidates = mocks.statements.find((statement) =>
      /from "zaltyko"\."athletes"/i.test(statement.sql)
    );
    expect(candidates).toBeDefined();
    expect(candidates!.sql).toMatch(/exists\s*\(\s*select\s+1\s+from\s+zaltyko\.group_memberships\s+eligible_membership/i);
    expect(candidates!.sql).toMatch(/exists\s*\(\s*select\s+1\s+from\s+zaltyko\.enrollments/i);
    expect(candidates!.sql).toContain('"groups"."status" = $');
    expect(candidates!.sql).toContain('"athletes"."organization_id" = $');
    expect(candidates!.sql).toContain('"athletes"."is_active" = $');
    expect(candidates!.params).toEqual(
      expect.arrayContaining([
        organizationId,
        locationId,
        true,
        "pending",
        "trial",
        "active",
        "paused",
        "%Ana%",
      ])
    );
    expectInnerLimitsAndOuterPage(candidates!.sql, candidates!.params, 1);
  });

  it("compila los NOT EXISTS de grupo e inscripción con límites internos y página 20", async () => {
    const { searchGroupAthleteOptions } =
      await import("@/modules/groups/application/group-management-service");

    await searchGroupAthleteOptions({
      userId,
      organizationId,
      groupId,
      query: "Ana",
    });

    expect(mocks.resolveOwnerScope).toHaveBeenCalledWith({
      userId,
      organizationId,
    });
    const candidates = mocks.statements.find((statement) =>
      /from "zaltyko"\."athletes"/i.test(statement.sql)
    );
    expect(candidates).toBeDefined();
    expect(candidates!.sql).toMatch(/not\s+exists\s*\(\s*select\s+1\s+from\s+zaltyko\.group_memberships\s+eligible_membership/i);
    expect(candidates!.sql).toContain('"group_id" = $');
    expect(candidates!.sql).toContain('"athletes"."organization_id" = $');
    expect(candidates!.sql).toContain('"athletes"."is_active" = $');
    expect(candidates!.params).toEqual(
      expect.arrayContaining([
        organizationId,
        groupId,
        true,
        "pending",
        "active",
        "paused",
      ])
    );
    expectInnerLimitsAndOuterPage(candidates!.sql, candidates!.params, 1);
  });
});
