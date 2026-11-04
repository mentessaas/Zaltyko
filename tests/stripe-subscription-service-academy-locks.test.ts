import { beforeEach, describe, expect, it, vi } from "vitest";

const { fixture } = vi.hoisted(() => ({
  fixture: {
    ownerRows: [] as Array<Record<string, unknown>>,
    academyRows: [] as Array<Record<string, unknown>>,
    context: {
      academyId: null as string | null,
      userId: null as string | null,
      tenantId: null as string | null,
    },
    lockedAcademyIds: [] as string[],
    academyPageLimits: [] as number[],
    academyPageCursors: [] as Array<string | null>,
    academyPageOrdersById: [] as boolean[],
    stripeClientCalls: 0,
    tx: undefined as unknown,
  },
}));

vi.mock("@/db/schema", () => {
  const table = (tableName: string) =>
    new Proxy(
      { tableName },
      {
        get: (target, property) =>
          property in target
            ? target[property as keyof typeof target]
            : { tableName, columnName: String(property) },
      }
    );

  return {
    academies: table("academies"),
    billingEvents: table("billingEvents"),
    profiles: table("profiles"),
    subscriptions: table("subscriptions"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  asc: (column: unknown) => ({ op: "asc", column }),
  eq: (column: unknown, value: unknown) => ({
    op: "eq",
    args: [column, value],
  }),
  gt: (column: unknown, value: unknown) => ({
    op: "gt",
    args: [column, value],
  }),
}));

vi.mock("@/lib/db-transactions", () => ({
  withTransaction: (callback: (tx: unknown) => unknown) =>
    Promise.resolve(callback(fixture.tx)),
}));

vi.mock("@/lib/limits", () => ({
  lockAcademyOperationalWrites: async (_tx: unknown, academyId: string) => {
    fixture.lockedAcademyIds.push(academyId);
  },
  lockUserSubscriptionStatus: async () => undefined,
}));

vi.mock("@/lib/stripe/context-resolver", () => ({
  getAcademyContextFromSubscription: async () => fixture.context,
}));

vi.mock("@/lib/stripe/plan-service", () => ({
  getPlanIdByStripePrice: async () => "plan-id",
}));

vi.mock("@/lib/stripe/date-utils", () => ({
  unixToDate: () => null,
}));
vi.mock("@/lib/stripe/event-policy", () => ({
  shouldApplyStripeEvent: () => true,
}));
vi.mock("@/lib/stripe/metadata-utils", () => ({
  extractMetadataValue: () => null,
}));
vi.mock("@/lib/billing/trial-service", () => ({
  convertAcademyTrial: async () => false,
}));
vi.mock("@/lib/growth/contracts", () => ({
  toCommercialPlanSlug: () => "starter",
}));
vi.mock("@/lib/growth/events", () => ({
  recordGrowthEvent: async () => undefined,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => {
    fixture.stripeClientCalls += 1;
    return { subscriptions: { retrieve: async () => ({}) } };
  },
}));

import { handleSubscriptionEvent } from "@/lib/stripe/subscription-service";

type Row = Record<string, unknown>;
type Condition = { op: string; args?: unknown[]; column?: unknown };

function matches(predicate: unknown, row: Row): boolean {
  if (!predicate || typeof predicate !== "object") return true;
  const condition = predicate as Condition;
  if (condition.op === "and") {
    return (condition.args ?? []).every((item) => matches(item, row));
  }

  const [column, value] = condition.args as [
    { columnName: string },
    unknown,
  ];
  const actual = row[column.columnName];
  if (condition.op === "eq") return actual === value;
  if (condition.op === "gt") {
    return (
      typeof actual === "string" &&
      typeof value === "string" &&
      actual > value
    );
  }
  return true;
}

function findIdCursor(predicate: unknown): string | null {
  if (!predicate || typeof predicate !== "object") return null;
  const condition = predicate as Condition;
  if (condition.op === "and") {
    for (const child of condition.args ?? []) {
      const cursor = findIdCursor(child);
      if (cursor) return cursor;
    }
    return null;
  }
  if (condition.op !== "gt") return null;

  const [column, value] = condition.args as [
    { columnName: string },
    unknown,
  ];
  return column.columnName === "id" && typeof value === "string"
    ? value
    : null;
}

class SelectBuilder implements PromiseLike<Row[]> {
  private tableName = "";
  private predicate: unknown;
  private rowLimit: number | null = null;
  private ordering: unknown;

  from(source: { tableName: string }): this {
    this.tableName = source.tableName;
    return this;
  }

  where(predicate: unknown): this {
    this.predicate = predicate;
    return this;
  }

  orderBy(ordering: unknown): this {
    this.ordering = ordering;
    return this;
  }

  limit(rowLimit: number): this {
    this.rowLimit = rowLimit;
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    let rows =
      this.tableName === "profiles"
        ? fixture.ownerRows
        : this.tableName === "academies"
          ? fixture.academyRows
          : [];
    rows = rows.filter((row) => matches(this.predicate, row));

    if (this.tableName === "academies") {
      rows = [...rows].sort((left, right) =>
        String(left.id).localeCompare(String(right.id))
      );
      fixture.academyPageLimits.push(this.rowLimit ?? 0);
      fixture.academyPageCursors.push(findIdCursor(this.predicate));
      const order = this.ordering as {
        op?: string;
        column?: { columnName?: string };
      };
      fixture.academyPageOrdersById.push(
        order?.op === "asc" && order.column?.columnName === "id"
      );
    }

    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit);
    return Promise.resolve(rows).then(onfulfilled, onrejected);
  }
}

function makeTransaction() {
  return {
    select: () => new SelectBuilder(),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

async function deliverDeletedSubscriptionEvent() {
  await handleSubscriptionEvent(
    "customer.subscription.deleted",
    {
      id: "sub_deleted",
      status: "canceled",
      customer: "cus_owner",
      metadata: {},
      items: { data: [{ price: { id: "price_monthly" } }] },
    } as never,
    "evt_deleted",
    { id: "evt_deleted", created: 1_800_000_000 } as never
  );
}

describe("Stripe subscription academy locks", () => {
  beforeEach(() => {
    fixture.ownerRows = [{ id: "owner-1", userId: "user-1" }];
    fixture.academyRows = [];
    fixture.context = {
      academyId: "context-only-academy",
      userId: "user-1",
      tenantId: "tenant-1",
    };
    fixture.lockedAcademyIds = [];
    fixture.academyPageLimits = [];
    fixture.academyPageCursors = [];
    fixture.academyPageOrdersById = [];
    fixture.stripeClientCalls = 0;
    fixture.tx = makeTransaction();
  });

  it(
    "paginates every owned academy, deduplicates the context, and locks the full set in global order",
    async () => {
      fixture.academyRows = Array.from({ length: 205 }, (_, index) => ({
        id: `academy-${String(index).padStart(4, "0")}`,
        ownerId: "owner-1",
      })).reverse();
      fixture.context.academyId = "academy-0100";

      await deliverDeletedSubscriptionEvent();

      const expectedIds = fixture.academyRows
        .map((academy) => String(academy.id))
        .sort();
      expect(fixture.academyPageLimits).toEqual([100, 100, 100]);
      expect(fixture.academyPageCursors).toEqual([
        null,
        "academy-0099",
        "academy-0199",
      ]);
      expect(fixture.academyPageOrdersById).toEqual([true, true, true]);
      expect(fixture.lockedAcademyIds).toEqual(expectedIds);
      expect(fixture.lockedAcademyIds).toHaveLength(205);
      expect(
        fixture.lockedAcademyIds.filter((id) => id === "academy-0100")
      ).toHaveLength(1);
      expect(fixture.stripeClientCalls).toBe(0);
    }
  );

  it("locks the context academy if the user has no owner profile", async () => {
    fixture.ownerRows = [];
    fixture.context = {
      academyId: "context-only-academy",
      userId: "user-without-profile",
      tenantId: "tenant-1",
    };

    await deliverDeletedSubscriptionEvent();

    expect(fixture.academyPageLimits).toEqual([]);
    expect(fixture.lockedAcademyIds).toEqual(["context-only-academy"]);
    expect(fixture.stripeClientCalls).toBe(0);
  });
});
