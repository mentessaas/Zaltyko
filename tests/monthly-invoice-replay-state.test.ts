import { describe, expect, it, vi } from "vitest";

const { testTables } = vi.hoisted(() => {
  const names = [
    "athletes",
    "charges",
    "classTemplates",
    "enrollmentPriceAssignments",
    "enrollments",
    "families",
    "familyGuardians",
    "familyMembers",
    "familyPayers",
    "guardians",
    "invoiceLines",
    "invoiceLineEnrollments",
    "invoices",
    "locations",
    "outboxEvents",
    "people",
    "pricePlans",
    "pricePlanClassTemplateCoverage",
  ];
  const testTables = Object.fromEntries(
    names.map((name) => [
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
  return { testTables };
});

vi.mock("@/db/zaltyko-schema", () => testTables);
vi.mock("@/db", () => ({ db: {} }));
vi.mock("drizzle-orm", () => {
  const condition =
    (op: string) =>
    (...args: unknown[]) => ({ op, args });
  const sql = Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }),
    { join: (values: unknown[]) => values }
  );
  return {
    and: condition("and"),
    asc: (value: unknown) => value,
    eq: condition("eq"),
    gt: condition("gt"),
    gte: condition("gte"),
    inArray: condition("inArray"),
    isNull: condition("isNull"),
    lte: condition("lte"),
    or: condition("or"),
    sql,
  };
});

import {
  charges,
  familyMembers,
  invoiceLineEnrollments,
  invoiceLines,
  pricePlanClassTemplateCoverage,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  loadIssuedLines,
  loadMonthlyChargeState,
  loadMonthlyFamilyMemberships,
  loadMonthlyReplayState,
} from "@/modules/billing/application/monthly-invoice-service";
import { loadPricePlanCoverage } from "@/modules/billing/application/monthly-price-plan-service";

const { invoices } = testTables;

type ReaderFixture = {
  familyRows?: Array<{ cursorId: string; athleteId: string }>;
  coverageRows?: Array<{
    cursorId: string;
    classTemplateId: string;
    startsOn: string;
    endsOn: string | null;
  }>;
  lineRows?: Array<{
    id: string;
    athleteId: string | null;
    sortAthleteId: string | null;
    enrollmentId: string | null;
    pricePlanId: string | null;
    athleteName: string;
    amountCents: number;
    currency: string;
  }>;
  snapshotRows?: Array<{
    invoiceLineId: string;
    enrollmentId: string;
    classTemplateId: string;
    className: string;
    assignmentId: string;
  }>;
  chargeRows?: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
    collectionMode: "manual" | "automatic";
  }>;
};

function flattenConditions(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  if (typeof node.op === "string") {
    return [
      node,
      ...((node.args as unknown[] | undefined) ?? []).flatMap(
        flattenConditions
      ),
    ];
  }
  return [];
}

function createReaderTx(fixture: ReaderFixture) {
  const pageCalls: Array<{
    table: string;
    limit: number;
    cursor: string | null;
  }> = [];
  const lockCalls: string[] = [];
  const tx = {
    select: vi.fn(() => {
      let table: unknown;
      let where: unknown;
      let limit = 0;
      const query = {
        from: vi.fn((value: unknown) => {
          table = value;
          return query;
        }),
        leftJoin: vi.fn(() => query),
        innerJoin: vi.fn(() => query),
        where: vi.fn((value: unknown) => {
          where = value;
          return query;
        }),
        orderBy: vi.fn(() => query),
        limit: vi.fn((value: number) => {
          limit = value;
          return query;
        }),
        for: vi.fn((mode: string) => {
          lockCalls.push(mode);
          return query;
        }),
        then: (
          resolve: (rows: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          const tableName =
            (table as { tableName?: string })?.tableName ?? "unknown";
          const nodes = flattenConditions(where);
          const cursorNodes = nodes.filter((node) => node.op === "gt");
          const after =
            cursorNodes.at(-1)?.args instanceof Array
              ? String((cursorNodes.at(-1)?.args as unknown[])[1])
              : null;
          pageCalls.push({ table: tableName, limit, cursor: after });
          let rows: Array<Record<string, unknown>> = [];
          if (table === familyMembers) rows = fixture.familyRows ?? [];
          if (table === pricePlanClassTemplateCoverage)
            rows = fixture.coverageRows ?? [];
          if (table === invoiceLines) rows = fixture.lineRows ?? [];
          if (table === invoiceLineEnrollments)
            rows = fixture.snapshotRows ?? [];
          if (table === charges) rows = fixture.chargeRows ?? [];
          if (table === invoiceLineEnrollments) {
            const lineIds = nodes
              .filter((node) => node.op === "inArray")
              .flatMap((node) => (node.args as unknown[])[1] as string[]);
            rows = rows.filter((row) =>
              lineIds.includes(String(row.invoiceLineId))
            );
            const pairNodes = cursorNodes;
            if (pairNodes.length > 1) {
              const cursorLine = String((pairNodes[0].args as unknown[])[1]);
              const cursorEnrollment = String(
                (pairNodes[1].args as unknown[])[1]
              );
              rows = rows.filter(
                (row) =>
                  `${row.invoiceLineId}:${row.enrollmentId}` >
                  `${cursorLine}:${cursorEnrollment}`
              );
            }
            rows = rows.sort((left, right) =>
              `${left.invoiceLineId}:${left.enrollmentId}`.localeCompare(
                `${right.invoiceLineId}:${right.enrollmentId}`
              )
            );
          } else if (after) {
            rows = rows.filter((row) => String(row.cursorId ?? row.id) > after);
            rows = rows.sort((left, right) =>
              String(left.cursorId ?? left.id).localeCompare(
                String(right.cursorId ?? right.id)
              )
            );
          }
          return Promise.resolve(rows.slice(0, limit)).then(resolve, reject);
        },
      };
      return query;
    }),
  };
  return {
    tx: tx as unknown as TransactionClient,
    pageCalls,
    lockCalls,
  };
}

function createReplayTx(options?: { nextInvoiceStatus?: "paid" | "void" }) {
  const calls: string[] = [];
  let invoiceStatus: "due" | "paid" | "void" = "due";
  let releaseChargeRead: (() => void) | undefined;
  const chargeLockWait = new Promise<void>((resolve) => {
    releaseChargeRead = resolve;
  });
  const chargeRows: Array<{
    id: string;
    status: "due" | "partially_paid" | "paid" | "void";
    collectionMode: "manual" | "automatic";
  }> = [
    {
      id: "charge-1",
      status: "due",
      collectionMode: "manual",
    },
  ];
  const invoiceRow = {
    id: "invoice-1",
    organizationId: "org-1",
    status: invoiceStatus,
    voidedAt: null,
  };

  const tx = {
    select: vi.fn(() => {
      let table: unknown;
      const query = {
        from: vi.fn((value: unknown) => {
          table = value;
          return query;
        }),
        where: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        limit: vi.fn(() => query),
        for: vi.fn((lock: string) => {
          calls.push(`${table === charges ? "charges" : "invoice"}:${lock}`);
          return query;
        }),
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          const read = async () => {
            if (table === charges) {
              calls.push("charges:read-start");
              await chargeLockWait;
              invoiceStatus = options?.nextInvoiceStatus ?? "paid";
              chargeRows[0].status = invoiceStatus === "void" ? "void" : "paid";
              calls.push("charges:read-complete");
              return chargeRows;
            }
            if (table === invoices) {
              calls.push("invoice:read");
              return [{ ...invoiceRow, status: invoiceStatus }];
            }
            throw new Error("Unexpected table in replay query");
          };
          return read().then(resolve, reject);
        },
      };
      return query;
    }),
  };

  return {
    tx: tx as unknown as TransactionClient,
    calls,
    completeConcurrentPayment: () => releaseChargeRead?.(),
  };
}

describe("monthly invoice replay state", () => {
  it("pages family memberships and plan coverage beyond 200 rows", async () => {
    const familyRows = Array.from({ length: 205 }, (_, index) => ({
      cursorId: `family-${String(index + 1).padStart(3, "0")}`,
      athleteId: `athlete-${String(index % 17).padStart(2, "0")}`,
    }));
    const familyHarness = createReaderTx({ familyRows });
    const memberships = await loadMonthlyFamilyMemberships(
      familyHarness.tx,
      "org-1",
      "family-1",
      { start: "2026-10-01", end: "2026-10-31" }
    );
    expect(memberships).toEqual(familyRows);
    expect(familyHarness.pageCalls.map((page) => page.limit)).toEqual([
      200, 200,
    ]);

    const coverageRows = Array.from({ length: 205 }, (_, index) => ({
      cursorId: `coverage-${String(index + 1).padStart(3, "0")}`,
      classTemplateId: `template-${String(index + 1).padStart(3, "0")}`,
      startsOn: "2026-09-01",
      endsOn: null,
    }));
    const coverageHarness = createReaderTx({ coverageRows });
    const coverage = await loadPricePlanCoverage(
      coverageHarness.tx,
      "org-1",
      "location-1",
      "price-plan-1"
    );
    expect(coverage).toHaveLength(205);
    expect(coverage.at(-1)?.classTemplateId).toBe("template-205");
    expect(coverageHarness.pageCalls.map((page) => page.limit)).toEqual([
      200, 200,
    ]);
  });

  it("reconstructs all line snapshots across line and composite cursor pages", async () => {
    const lineRows = Array.from({ length: 201 }, (_, index) => ({
      id: `line-${String(index + 1).padStart(3, "0")}`,
      athleteId: `athlete-${String(index + 1).padStart(3, "0")}`,
      sortAthleteId: `athlete-${String(index + 1).padStart(3, "0")}`,
      enrollmentId: null,
      pricePlanId: "plan-1",
      athleteName: `Gymnast ${index + 1}`,
      amountCents: 1000,
      currency: "EUR",
    }));
    const snapshotRows = lineRows.flatMap((line) =>
      ["a", "b"].map((suffix) => ({
        invoiceLineId: line.id,
        enrollmentId: `enrollment-${suffix}`,
        classTemplateId: `template-${suffix}`,
        className: `Class ${suffix}`,
        assignmentId: `assignment-${suffix}`,
      }))
    );
    const harness = createReaderTx({ lineRows, snapshotRows });

    const result = await loadIssuedLines(harness.tx, "org-1", "invoice-1");

    expect(result).toHaveLength(201);
    expect(result.every((line) => line.coveredEnrollments.length === 2)).toBe(
      true
    );
    expect(
      result.at(-1)?.coveredEnrollments.map((row) => row.enrollmentId)
    ).toEqual(["enrollment-a", "enrollment-b"]);
    expect(
      harness.pageCalls
        .filter((page) => page.table === "invoiceLineEnrollments")
        .map((page) => page.limit)
    ).toEqual([200, 200, 200, 200]);
  });

  it("pages more than 200 snapshots within one invoice line by composite cursor", async () => {
    const snapshotRows = Array.from({ length: 205 }, (_, index) => ({
      invoiceLineId: "line-001",
      enrollmentId: `enrollment-${String(index + 1).padStart(3, "0")}`,
      classTemplateId: `template-${String(index + 1).padStart(3, "0")}`,
      className: `Class ${index + 1}`,
      assignmentId: `assignment-${String(index + 1).padStart(3, "0")}`,
    }));
    const harness = createReaderTx({
      lineRows: [
        {
          id: "line-001",
          athleteId: "athlete-001",
          sortAthleteId: "athlete-001",
          enrollmentId: null,
          pricePlanId: "plan-1",
          athleteName: "Gymnast 1",
          amountCents: 1000,
          currency: "EUR",
        },
      ],
      snapshotRows,
    });

    const result = await loadIssuedLines(harness.tx, "org-1", "invoice-1");

    expect(result).toHaveLength(1);
    expect(result[0].coveredEnrollments).toHaveLength(205);
    expect(result[0].coveredEnrollments[0].enrollmentId).toBe("enrollment-001");
    expect(result[0].coveredEnrollments.at(-1)?.enrollmentId).toBe(
      "enrollment-205"
    );
    expect(
      harness.pageCalls
        .filter((page) => page.table === "invoiceLineEnrollments")
        .map((page) => page.limit)
    ).toEqual([200, 200]);
  });

  it("locks and returns every charge over multiple pages", async () => {
    const chargeRows = Array.from({ length: 205 }, (_, index) => ({
      id: `charge-${String(index + 1).padStart(3, "0")}`,
      status: "due" as const,
      collectionMode: "manual" as const,
    }));
    const harness = createReaderTx({ chargeRows });

    const result = await loadMonthlyChargeState(
      harness.tx,
      "org-1",
      "invoice-1"
    );

    expect(result.charges).toHaveLength(205);
    expect(result.charges.at(-1)?.id).toBe("charge-205");
    expect(harness.lockCalls).toEqual(["update", "update"]);
  });

  it("re-reads invoice status after charge locks settle", async () => {
    const harness = createReplayTx();
    const replay = loadMonthlyReplayState(harness.tx, "org-1", "invoice-1");

    await vi.waitFor(() => {
      expect(harness.calls).toContain("charges:read-start");
    });
    harness.completeConcurrentPayment();

    const result = await replay;
    expect(result.invoice.status).toBe("paid");
    expect(result.chargeStatus).toBe("paid");
    expect(harness.calls).toEqual([
      "charges:update",
      "charges:read-start",
      "charges:read-complete",
      "invoice:read",
    ]);
  });

  it("detects an invoice voided while waiting on the charge locks", async () => {
    const harness = createReplayTx({ nextInvoiceStatus: "void" });
    const replay = loadMonthlyReplayState(harness.tx, "org-1", "invoice-1");

    await vi.waitFor(() => {
      expect(harness.calls).toContain("charges:read-start");
    });
    harness.completeConcurrentPayment();

    await expect(replay).rejects.toMatchObject({ code: "INVOICE_VOIDED" });
    expect(harness.calls.indexOf("charges:read-complete")).toBeLessThan(
      harness.calls.indexOf("invoice:read")
    );
  });
});
