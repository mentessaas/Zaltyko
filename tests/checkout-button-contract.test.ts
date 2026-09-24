import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CheckoutButton contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/CheckoutButton.tsx"), "utf8");

  it("uses the canonical tenant checkout endpoint", () => {
    expect(source).toContain('fetch("/api/billing/checkout"');
    expect(source).not.toContain('fetch("/api/checkout"');
    expect(source).toContain("academyId, planCode");
  });

  it("requires the standardized checkout URL envelope", () => {
    expect(source).toContain("payload?.ok === true");
    expect(source).toContain("payload.data?.checkoutUrl");
    expect(source).toContain('role="alert"');
  });
});
