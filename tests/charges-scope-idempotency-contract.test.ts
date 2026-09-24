import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("charges scope and idempotency contract", () => {
  it("validates tenant ownership and keeps a database uniqueness guard", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/charges/route.ts"), "utf8");
    const schema = readFileSync(join(process.cwd(), "src/db/schema/charges.ts"), "utf8");
    expect(route).toContain("eq(athletes.tenantId, context.tenantId)");
    expect(route).toContain("eq(classes.tenantId, context.tenantId)");
    expect(schema).toContain("charges_academy_athlete_period_uq");
  });

  it("normalizes UI currency casing and preserves billing-item currency", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/charges/route.ts"), "utf8");
    expect(route).toContain("value.trim().toLowerCase()");
    expect(route).toContain("finalCurrency = body.currency ?? billingItem.currency");
    expect(route).not.toContain('z.enum(["eur", "usd", "mxn", "cop", "ars", "clp", "pen"])');
  });
});
