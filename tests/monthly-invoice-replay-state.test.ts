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
    names.map((name) => [name, { tableName: name }])
  );
  return { testTables };
});

vi.mock("@/db/zaltyko-schema", () => testTables);
vi.mock("@/db", () => ({ db: {} }));
vi.mock("drizzle-orm", () => {
  const sql = Object.assign(
    (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }),
    { join: (values: unknown[]) => values }
  );
  return {
    and: (...values: unknown[]) => values,
    asc: (value: unknown) => value,
    eq: (...values: unknown[]) => values,
    gt: (...values: unknown[]) => values,
    gte: (...values: unknown[]) => values,
    inArray: (...values: unknown[]) => values,
    isNull: (value: unknown) => value,
    lte: (...values: unknown[]) => values,
    or: (...values: unknown[]) => values,
    sql,
  };
});

import type { TransactionClient } from "@/lib/db-transactions";
import { loadMonthlyReplayState } from "@/modules/billing/application/monthly-invoice-service";

const { charges, invoices } = testTables;

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
