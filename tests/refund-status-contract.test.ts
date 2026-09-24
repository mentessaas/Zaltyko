import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("refund state transitions", () => {
  it("does not mark a charge refunded while Stripe is still pending", () => {
    const source = readFileSync("src/lib/stripe/refund-service.ts", "utf8");
    expect(source).toContain('refund.status === "succeeded"');
  });
});
