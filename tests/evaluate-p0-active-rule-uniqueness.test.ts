import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeRuleRows: [] as Array<{
    id: string;
    key: string;
    version: number;
    config: Record<string, unknown>;
  }>,
  cursors: [] as Array<string | undefined>,
  execute: vi.fn(),
  runInsightEvaluation: vi.fn(),
}));

vi.mock("drizzle-orm", () => {
  const condition = (
    op: string,
    field?: { name: string },
    value?: unknown
  ) => ({
    op,
    field,
    value,
  });
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  });
  return {
    and: (...conditions: unknown[]) => ({ op: "and", conditions }),
    asc: (field: { name: string }) => ({ op: "asc", field }),
    eq: (field: { name: string }, value: unknown) =>
      condition("eq", field, value),
    gt: (field: { name: string }, value: unknown) =>
      condition("gt", field, value),
    sql,
  };
});

vi.mock("@/db/zaltyko-schema", () => {
  const column = (name: string) => ({ name });
  return {
    insightRuleVersions: {
      id: column("id"),
      key: column("key"),
      version: column("version"),
      config: column("config"),
      status: column("status"),
    },
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => {
      let cursor: string | undefined;
      const findCursor = (value: unknown): string | undefined => {
        if (!value || typeof value !== "object") return undefined;
        const item = value as {
          op?: string;
          field?: { name?: string };
          value?: unknown;
          conditions?: unknown[];
        };
        if (item.op === "gt" && item.field?.name === "id") {
          return String(item.value);
        }
        for (const child of item.conditions ?? []) {
          const found = findCursor(child);
          if (found) return found;
        }
        return undefined;
      };
      const query = {
        from: () => query,
        where: (filter: unknown) => {
          cursor = findCursor(filter);
          mocks.cursors.push(cursor);
          return query;
        },
        orderBy: (order: { field: { name: string } }) => {
          expect(order.field.name).toBe("id");
          return query;
        },
        limit: (limit: number) =>
          Promise.resolve(
            mocks.activeRuleRows
              .filter((row) => !cursor || row.id > cursor)
              .sort((left, right) => left.id.localeCompare(right.id))
              .slice(0, limit)
          ),
      };
      return query;
    },
    execute: mocks.execute,
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({}),
  },
}));

vi.mock("@/modules/shared/infrastructure/operational-authorization", () => ({
  assertOperationalAccess: vi.fn(),
  assertSystemOperationalScope: vi.fn(),
}));

vi.mock("@/modules/insights/application/insight-service", () => ({
  runInsightEvaluation: mocks.runInsightEvaluation,
}));

import { evaluateP0Insights } from "@/modules/insights/application/evaluate-p0-rules";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const ruleKeys = [
  "underutilized_class",
  "excess_demand",
  "overdue_collections",
  "incomplete_attendance",
  "trial_without_followup",
  "low_trial_conversion",
  "capacity_without_price",
  "session_without_coach",
  "critical_data_missing",
] as const;

const uuid = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function rule(id: number, key: string, version = 1) {
  return { id: uuid(id), key, version, config: {} };
}

function command() {
  return {
    organizationId: uuid(900),
    locationId: uuid(901),
    actor: { userId: uuid(902), role: "owner" as const },
    evaluatedAt: "2026-10-14T10:00:00.000Z",
    sourceWatermark: "2026-10-14T10:00:00.000Z",
    idempotencyPrefix: "duplicate-rule-test",
  };
}

describe("evaluateP0Insights active rule versions", () => {
  beforeEach(() => {
    mocks.activeRuleRows = [];
    mocks.cursors = [];
    mocks.execute.mockReset().mockResolvedValue({ rows: [] });
    mocks.runInsightEvaluation
      .mockReset()
      .mockImplementation(async (input) => ({
        ruleKey: input.ruleKey,
        ruleVersion: input.ruleVersion,
      }));
  });

  it("paginates all active rows, keeps future keys, and evaluates the nine unique rules", async () => {
    mocks.activeRuleRows = [
      ...Array.from({ length: 105 }, (_, index) =>
        rule(index + 1, "future_rule", index === 1 ? 2 : 1)
      ),
      ...ruleKeys.map((key, index) => rule(index + 106, key)),
    ];

    const result = await evaluateP0Insights(command());

    expect(mocks.cursors).toHaveLength(2);
    expect(mocks.cursors[0]).toBeUndefined();
    expect(mocks.cursors[1]).toBe(uuid(100));
    expect(result.evaluatedRules).toBe(9);
    expect(mocks.runInsightEvaluation).toHaveBeenCalledTimes(9);
    expect(
      mocks.runInsightEvaluation.mock.calls.map(([input]) => input.ruleKey)
    ).toEqual(ruleKeys);
    expect(mocks.execute).toHaveBeenCalled();
  });

  it("fails before metric reads or insight writes when a known key is duplicated across pages", async () => {
    mocks.activeRuleRows = [
      ...Array.from({ length: 99 }, (_, index) =>
        rule(index + 1, `future_rule_${index + 1}`)
      ),
      rule(100, "underutilized_class", 1),
      rule(101, "underutilized_class", 2),
      ...ruleKeys
        .filter((key) => key !== "underutilized_class")
        .map((key, index) => rule(index + 102, key)),
    ];

    await expect(evaluateP0Insights(command())).rejects.toMatchObject({
      name: "OperationalError",
      code: "AMBIGUOUS_ACTIVE_INSIGHT_RULE",
      status: 409,
      details: { ruleKey: "underutilized_class", versions: [1, 2] },
    } satisfies Partial<OperationalError>);

    expect(mocks.cursors).toHaveLength(2);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.runInsightEvaluation).not.toHaveBeenCalled();
  });

  it("keeps the existing behavior when an implemented key is absent", async () => {
    mocks.activeRuleRows = [rule(1, "underutilized_class")];

    const result = await evaluateP0Insights(command());

    expect(result.evaluatedRules).toBe(1);
    expect(mocks.runInsightEvaluation).toHaveBeenCalledTimes(1);
    expect(mocks.runInsightEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: "underutilized_class",
        ruleVersion: 1,
      })
    );
  });
});
