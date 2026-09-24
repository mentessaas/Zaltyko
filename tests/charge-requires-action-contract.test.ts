import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stripe requires_action charge contract", () => {
  it("persists the state and excludes it from automatic collection", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/stripe/charge-collection-service.ts"),
      "utf8"
    );
    const schema = readFileSync(join(process.cwd(), "src/db/schema/enums.ts"), "utf8");
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260910224328_charge_requires_action_status.sql"),
      "utf8"
    );

    expect(service).toContain('status: requiresAction ? "requires_action" : "failed"');
    expect(service).toContain('["pending", "overdue", "failed"]');
    expect(schema).toContain('"requires_action"');
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'requires_action'");
  });
});
