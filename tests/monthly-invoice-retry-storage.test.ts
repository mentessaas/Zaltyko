// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY,
  clearPendingMonthlyInvoiceIssue,
  persistPendingMonthlyInvoiceIssue,
  readPendingMonthlyInvoiceIssue,
  type PendingMonthlyInvoiceIssue,
} from "@/components/owner-dashboard/monthly-invoice-retry-storage";

const organizationId = "10000000-0000-4000-8000-000000000111";
const locationId = "10000000-0000-4000-8000-000000000112";
const familyId = "10000000-0000-4000-8000-000000000101";
const payerId = "10000000-0000-4000-8000-000000000102";
const key = "owner-monthly-invoice:10000000-0000-4000-8000-000000000911";

function pending(
  overrides: Partial<PendingMonthlyInvoiceIssue> = {}
): PendingMonthlyInvoiceIssue {
  const body = {
    organizationId,
    locationId,
    familyId,
    familyPayerId: payerId,
    servicePeriod: "2026-10",
    dueDate: "2026-10-31",
    quoteHash: "a".repeat(64),
  };
  return {
    version: 1,
    key,
    body,
    scopeKey: JSON.stringify([organizationId, locationId, "2026-10"]),
    hasAmbiguousAttempt: false,
    ...overrides,
  };
}

describe("monthly invoice retry storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists the exact command, promotes uncertainty monotonically, and clears only that command", () => {
    const original = pending();
    expect(persistPendingMonthlyInvoiceIssue(original, window.sessionStorage)).toBe(
      true
    );
    expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
      status: "pending",
      request: original,
    });

    const uncertain = { ...original, hasAmbiguousAttempt: true };
    expect(
      persistPendingMonthlyInvoiceIssue(uncertain, window.sessionStorage)
    ).toBe(true);
    expect(
      persistPendingMonthlyInvoiceIssue(original, window.sessionStorage)
    ).toBe(false);

    expect(
      clearPendingMonthlyInvoiceIssue(
        {
          ...uncertain,
          key: "owner-monthly-invoice:10000000-0000-4000-8000-000000000912",
        },
        window.sessionStorage
      )
    ).toBe(false);
    expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
      status: "pending",
      request: uncertain,
    });
    expect(
      clearPendingMonthlyInvoiceIssue(uncertain, window.sessionStorage)
    ).toBe(true);
    expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
      status: "none",
    });
  });

  it("fails closed on unknown versions, extra fields, and a mismatched scope", () => {
    const valid = pending();
    for (const invalid of [
      { ...valid, version: 2 },
      { ...valid, extra: "unexpected" },
      {
        ...valid,
        scopeKey: JSON.stringify([organizationId, locationId, "2026-11"]),
      },
      {
        ...valid,
        body: { ...valid.body, quoteHash: "not-a-quote-hash" },
      },
    ]) {
      window.sessionStorage.setItem(
        PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY,
        JSON.stringify(invalid)
      );
      expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
        status: "invalid",
      });
      window.sessionStorage.removeItem(
        PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY
      );
    }

    window.sessionStorage.setItem(
      PENDING_MONTHLY_INVOICE_ISSUE_STORAGE_KEY,
      "{"
    );
    expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
      status: "invalid",
    });
  });

  it("does not overwrite an existing command with a new invoice attempt", () => {
    const first = pending();
    const second = pending({
      key: "owner-monthly-invoice:10000000-0000-4000-8000-000000000912",
      body: { ...first.body, familyId: "10000000-0000-4000-8000-000000000103" },
    });
    expect(persistPendingMonthlyInvoiceIssue(first, window.sessionStorage)).toBe(
      true
    );
    expect(persistPendingMonthlyInvoiceIssue(second, window.sessionStorage)).toBe(
      false
    );
    expect(readPendingMonthlyInvoiceIssue(window.sessionStorage)).toEqual({
      status: "pending",
      request: first,
    });
  });

  it("reports unavailable storage and refuses to send a command when persistence fails", () => {
    const deniedStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage denied");
      },
      removeItem: () => {},
    };
    const unreadableStorage = {
      getItem: () => {
        throw new Error("Storage denied");
      },
      setItem: () => {},
      removeItem: () => {},
    };

    expect(readPendingMonthlyInvoiceIssue(null)).toEqual({
      status: "unavailable",
    });
    expect(
      readPendingMonthlyInvoiceIssue(unreadableStorage)
    ).toEqual({ status: "unavailable" });
    expect(
      persistPendingMonthlyInvoiceIssue(pending(), deniedStorage)
    ).toBe(false);
  });
});
