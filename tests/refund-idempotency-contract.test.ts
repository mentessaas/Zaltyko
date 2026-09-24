import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("refund idempotency contract", () => {
  it("uses a unique Stripe refund id and records the actor", () => {
    const schema = readFileSync(join(process.cwd(), "src/db/schema/refunds.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/lib/stripe/refund-service.ts"), "utf8");
    expect(schema).toContain("refunds_stripe_refund_id_unique");
    expect(service).toContain("createdBy: params.actorUserId");
    expect(service).toContain("idempotencyKey");
  });
});
