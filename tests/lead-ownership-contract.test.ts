import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260915150000_lead_ownership.sql", "utf8");
const route = readFileSync("src/app/api/lead-trials/route.ts", "utf8");

describe("lead ownership rollout contract", () => {
  it("is additive and preserves unassigned legacy leads", () => {
    expect(migration).toContain("add column if not exists tenant_id uuid");
    expect(migration).toContain("add column if not exists academy_id uuid");
    expect(migration).not.toMatch(/drop\s+(table|column)\s+public\.leads/i);
  });

  it("keeps an explicit compatibility fallback until remote schema catches up", () => {
    expect(route).toContain("findLeadForTrial");
    expect(route).toContain("ownershipSupported: false");
    expect(route).toContain("isNull(leads.tenantId)");
  });

  it("guards the unassigned-lead claim against a concurrent owner", () => {
    expect(route).toContain(".returning({ id: leads.id })");
    expect(route).toContain("current.academyId !== input.academyId");
  });
});
