import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("useBillingData contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/hooks/use-billing-data.ts"), "utf8");

  it("uses canonical tenant-scoped billing endpoints", () => {
    expect(source).toContain('fetch("/api/billing/status"');
    expect(source).toContain('fetch("/api/billing/plans"');
    expect(source).toContain('fetch("/api/billing/history"');
    expect(source).not.toContain("/api/billing/summary");
    expect(source).not.toContain("/api/billing/invoices");
    expect(source).not.toContain('fetch("/api/plans"');
  });

  it("reads standardized { ok, data } envelopes", () => {
    expect(source).toContain("payload.ok === true");
    expect(source).toContain("payload.data as T");
  });
});
