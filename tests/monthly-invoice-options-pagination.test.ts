import { describe, expect, it, vi } from "vitest";

const { fixtureState, testTables } = vi.hoisted(() => {
  const tableNames = [
    "athletes",
    "classTemplates",
    "enrollmentPriceAssignments",
    "enrollments",
    "families",
    "familyGuardians",
    "familyMembers",
    "familyPayers",
    "guardians",
    "invoiceLines",
    "invoices",
    "locations",
    "people",
    "pricePlans",
    "pricePlanClassTemplateCoverage",
  ];
  const testTables = Object.fromEntries(
    tableNames.map((name) => [
      name,
      new Proxy(
        { tableName: name },
        {
          get: (target, property) =>
            property in target
              ? target[property as keyof typeof target]
              : { tableName: name, columnName: String(property) },
        }
      ),
    ])
  );
  return {
    fixtureState: {
      rows: {} as Record<string, unknown[]>,
      tx: undefined as unknown,
    },
    testTables,
  };
});

vi.mock("@/db/zaltyko-schema", () => testTables);
vi.mock("@/db", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) =>
      callback(fixtureState.tx),
  },
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: vi.fn(),
}));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  return {
    and: condition("and"),
    asc: (column: unknown) => ({ op: "asc", column }),
    eq: condition("eq"),
    gt: condition("gt"),
    gte: condition("gte"),
    inArray: condition("inArray"),
    isNull: condition("isNull"),
    lte: condition("lte"),
    or: condition("or"),
    sql: Object.assign(() => ({}), { join: (values: unknown[]) => values }),
  };
});

import { getMonthlyInvoiceOptions } from "@/modules/billing/application/monthly-invoice-service";

type Condition = { op: string; args: unknown[] };
type FixtureRow = Record<string, unknown>;

function matches(condition: unknown, row: FixtureRow): boolean {
  if (!condition || typeof condition !== "object") return true;
  const node = condition as Condition;
  if (node.op === "and") return node.args.every((item) => matches(item, row));
  if (node.op === "or") return node.args.some((item) => matches(item, row));
  const [column, value] = node.args as [{ columnName: string }, unknown];
  const actual = row[column.columnName];
  if (node.op === "eq") return actual === value;
  if (node.op === "gt") return String(actual) > String(value);
  if (node.op === "gte") return String(actual) >= String(value);
  if (node.op === "lte") return String(actual) <= String(value);
  if (node.op === "inArray") return (value as unknown[]).includes(actual);
  if (node.op === "isNull") return actual === null;
  return true;
}

function makeTx() {
  return {
    select: vi.fn(() => {
      let tableName = "";
      let where: unknown;
      let order: Array<{ columnName: string }> = [];
      let pageSize = 0;
      const query: Record<string, unknown> = {
        from: (table: { tableName: string }) => {
          tableName = table.tableName;
          return query;
        },
        innerJoin: () => query,
        leftJoin: () => query,
        where: (condition: unknown) => {
          where = condition;
          return query;
        },
        groupBy: () => query,
        orderBy: (
          ...columns: Array<{
            columnName?: string;
            column?: { columnName: string };
          }>
        ) => {
          order = columns.map(
            (item) => item.column ?? (item as { columnName: string })
          );
          return query;
        },
        limit: (limit: number) => {
          pageSize = limit;
          return query;
        },
        then: (
          resolve: (value: FixtureRow[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          try {
            const rows = ((fixtureState.rows[tableName] ?? []) as FixtureRow[])
              .filter((row) => matches(where, row))
              .sort((left, right) => {
                for (const column of order) {
                  const comparison = String(
                    left[column.columnName] ?? ""
                  ).localeCompare(String(right[column.columnName] ?? ""));
                  if (comparison) return comparison;
                }
                return 0;
              })
              .slice(0, pageSize);
            return Promise.resolve(rows).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return query;
    }),
  };
}

function setFixture(rows: Record<string, FixtureRow[]>, tx: unknown) {
  fixtureState.rows = rows;
  fixtureState.tx = tx;
}

function buildLargeFixture() {
  const orgId = "org-1";
  const locationId = "location-1";
  const plans = Array.from({ length: 101 }, (_, index) => ({
    id: `plan-${String(index + 1).padStart(3, "0")}`,
    organizationId: orgId,
    isActive: true,
    cadence: "monthly",
    name: `Plan ${String(index + 1).padStart(3, "0")}`,
    amountCents: 10000,
    currency: "EUR",
  }));
  const enrollments = Array.from({ length: 1001 }, (_, index) => {
    const suffix = String(index + 1).padStart(4, "0");
    return {
      id: `enrollment-${suffix}`,
      enrollmentId: `enrollment-${suffix}`,
      organizationId: orgId,
      locationId,
      status: "active",
      startsOn: "2026-10-01",
      endsOn: null,
      athleteId: `athlete-${suffix}`,
      classTemplateId: "template-1",
      className: "Grupo",
      athleteName: `Atleta ${suffix}`,
      familySortName: "Atleta",
      givenSortName: suffix,
    };
  });
  const familyMembers = enrollments.flatMap((enrollment, index) =>
    ["a", "b"].map((side) => ({
      id: `member-${String(index + 1).padStart(4, "0")}-${side}`,
      memberId: `member-${String(index + 1).padStart(4, "0")}-${side}`,
      organizationId: orgId,
      athleteId: enrollment.athleteId,
      familyId: `family-${String(index + 1).padStart(4, "0")}-${side}`,
      startsOn: "2026-01-01",
      endsOn: null,
      familyIsActive: true,
    }))
  );
  const assignments = enrollments.flatMap((enrollment, index) =>
    ["a", "b"].map((side) => ({
      id: `assignment-${String(index + 1).padStart(4, "0")}-${side}`,
      organizationId: orgId,
      enrollmentId: enrollment.enrollmentId,
      pricePlanId: "plan-001",
      currency: "EUR",
      unitAmountCents: 10000,
      startsOn: "2026-01-01",
      endsOn: null,
    }))
  );
  const families = familyMembers.map((member) => member.familyId);
  const familyPayers = families.map((familyId, index) => ({
    id: `payer-${String(index + 1).padStart(4, "0")}`,
    familyPayerId: `payer-${String(index + 1).padStart(4, "0")}`,
    organizationId: orgId,
    familyId,
    startsOn: "2026-01-01",
    endsOn: null,
    isPrimary: true,
    displayName: "Tutor",
  }));
  const invoices = families.map((familyId, index) => ({
    id: `invoice-${String(index + 1).padStart(4, "0")}`,
    invoiceId: `invoice-${String(index + 1).padStart(4, "0")}`,
    organizationId: orgId,
    locationId,
    familyId,
    status: "due",
    voidedAt: null,
    lineType: "monthly_fee",
    servicePeriodStart: "2026-10-01",
    servicePeriodEnd: "2026-10-31",
  }));
  const coverage = Array.from({ length: 4001 }, (_, index) => ({
    id: `coverage-${String(index + 1).padStart(4, "0")}`,
    organizationId: orgId,
    locationId,
    pricePlanId: "plan-001",
    classTemplateId: "template-1",
    startsOn: "2026-01-01",
    endsOn: null,
  }));
  return {
    orgId,
    locationId,
    rows: {
      locations: [
        {
          id: locationId,
          organizationId: orgId,
          isActive: true,
          timezone: "Europe/Madrid",
        },
      ],
      pricePlans: plans,
      enrollments,
      familyMembers,
      enrollmentPriceAssignments: assignments,
      pricePlanClassTemplateCoverage: coverage,
      familyPayers,
      invoices,
    },
  };
}

describe("monthly invoice options keyset pagination", () => {
  it("returns every option and relationship beyond prior fixed limits", async () => {
    const fixture = buildLargeFixture();
    const tx = makeTx();
    setFixture(fixture.rows, tx);

    const result = await getMonthlyInvoiceOptions({
      organizationId: fixture.orgId,
      locationId: fixture.locationId,
      servicePeriod: "2026-10",
      actor: { userId: "user-1", memberId: "member-1", role: "owner" },
    });

    expect(result.pricePlans).toHaveLength(101);
    expect(result.families).toHaveLength(2002);
    expect(result.families.every((family) => family.existingInvoiceId)).toBe(
      true
    );
  });

  it("keeps organization and location filters while paging", async () => {
    const orgId = "org-1";
    const locationId = "location-1";
    const rows = {
      locations: [
        {
          id: locationId,
          organizationId: orgId,
          isActive: true,
          timezone: "Europe/Madrid",
        },
      ],
      pricePlans: [
        {
          id: "plan-valid",
          organizationId: orgId,
          isActive: true,
          cadence: "monthly",
          name: "Cuota",
          amountCents: 10000,
          currency: "EUR",
        },
        {
          id: "plan-foreign",
          organizationId: "org-other",
          isActive: true,
          cadence: "monthly",
          name: "Ajeno",
          amountCents: 10000,
          currency: "EUR",
        },
      ],
      enrollments: [
        {
          id: "enrollment-valid",
          enrollmentId: "enrollment-valid",
          organizationId: orgId,
          locationId,
          status: "active",
          startsOn: "2026-10-01",
          endsOn: null,
          athleteId: "athlete-valid",
          classTemplateId: "template-valid",
          className: "Grupo",
          athleteName: "Atleta",
          familySortName: "Atleta",
          givenSortName: "Uno",
        },
        {
          id: "enrollment-foreign-org",
          enrollmentId: "enrollment-foreign-org",
          organizationId: "org-other",
          locationId,
          status: "active",
          startsOn: "2026-10-01",
          endsOn: null,
          athleteId: "athlete-foreign-org",
          classTemplateId: "template-valid",
          className: "Ajeno",
          athleteName: "No incluir",
          familySortName: "Ajeno",
          givenSortName: "Dos",
        },
        {
          id: "enrollment-foreign-site",
          enrollmentId: "enrollment-foreign-site",
          organizationId: orgId,
          locationId: "location-other",
          status: "active",
          startsOn: "2026-10-01",
          endsOn: null,
          athleteId: "athlete-foreign-site",
          classTemplateId: "template-valid",
          className: "Ajeno",
          athleteName: "No incluir",
          familySortName: "Ajeno",
          givenSortName: "Tres",
        },
      ],
      familyMembers: [
        {
          id: "membership-valid",
          memberId: "membership-valid",
          organizationId: orgId,
          athleteId: "athlete-valid",
          familyId: "family-valid",
          startsOn: "2026-01-01",
          endsOn: null,
          familyIsActive: true,
        },
        {
          id: "membership-foreign",
          memberId: "membership-foreign",
          organizationId: "org-other",
          athleteId: "athlete-valid",
          familyId: "family-foreign",
          startsOn: "2026-01-01",
          endsOn: null,
          familyIsActive: true,
        },
      ],
      enrollmentPriceAssignments: [
        {
          id: "assignment-valid",
          organizationId: orgId,
          enrollmentId: "enrollment-valid",
          pricePlanId: "plan-valid",
          currency: "EUR",
          unitAmountCents: 10000,
          startsOn: "2026-01-01",
          endsOn: null,
        },
        {
          id: "assignment-foreign",
          organizationId: "org-other",
          enrollmentId: "enrollment-valid",
          pricePlanId: "plan-foreign",
          currency: "EUR",
          unitAmountCents: 20000,
          startsOn: "2026-01-01",
          endsOn: null,
        },
      ],
      pricePlanClassTemplateCoverage: [
        {
          id: "coverage-valid",
          organizationId: orgId,
          locationId,
          pricePlanId: "plan-valid",
          classTemplateId: "template-valid",
          startsOn: "2026-01-01",
          endsOn: null,
        },
        {
          id: "coverage-foreign-org",
          organizationId: "org-other",
          locationId,
          pricePlanId: "plan-valid",
          classTemplateId: "template-valid",
          startsOn: "2026-01-01",
          endsOn: null,
        },
        {
          id: "coverage-foreign-site",
          organizationId: orgId,
          locationId: "location-other",
          pricePlanId: "plan-valid",
          classTemplateId: "template-valid",
          startsOn: "2026-01-01",
          endsOn: null,
        },
      ],
      familyPayers: [
        {
          id: "payer-valid",
          familyPayerId: "payer-valid",
          organizationId: orgId,
          familyId: "family-valid",
          startsOn: "2026-01-01",
          endsOn: null,
          isPrimary: true,
          displayName: "Tutor",
        },
        {
          id: "payer-foreign",
          familyPayerId: "payer-foreign",
          organizationId: "org-other",
          familyId: "family-valid",
          startsOn: "2026-01-01",
          endsOn: null,
          isPrimary: true,
          displayName: "Ajeno",
        },
      ],
      invoices: [
        {
          id: "invoice-foreign-org",
          invoiceId: "invoice-foreign-org",
          organizationId: "org-other",
          locationId,
          familyId: "family-valid",
          status: "due",
          voidedAt: null,
          lineType: "monthly_fee",
          servicePeriodStart: "2026-10-01",
          servicePeriodEnd: "2026-10-31",
        },
        {
          id: "invoice-foreign-site",
          invoiceId: "invoice-foreign-site",
          organizationId: orgId,
          locationId: "location-other",
          familyId: "family-valid",
          status: "due",
          voidedAt: null,
          lineType: "monthly_fee",
          servicePeriodStart: "2026-10-01",
          servicePeriodEnd: "2026-10-31",
        },
      ],
    };
    const tx = makeTx();
    setFixture(rows, tx);

    const result = await getMonthlyInvoiceOptions({
      organizationId: orgId,
      locationId,
      servicePeriod: "2026-10",
      actor: { userId: "user-1", memberId: "member-1", role: "owner" },
    });

    expect(result.pricePlans.map((plan) => plan.id)).toEqual(["plan-valid"]);
    expect(result.families).toHaveLength(1);
    expect(result.families[0]).toMatchObject({
      familyId: "family-valid",
      existingInvoiceId: null,
      canIssue: true,
    });
    expect(
      result.families[0].payers.map((payer) => payer.familyPayerId)
    ).toEqual(["payer-valid"]);
  });
});
