import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("consolidated RLS new tables contract", () => {
  it("includes both new tables and tenant policies", () => {
    const sql = readFileSync("supabase/rls-consolidated.sql", "utf8");
    expect(sql).toContain("ALTER TABLE athlete_skills ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('CREATE POLICY "athlete_skills_select"');
    expect(sql).toContain("tenant_id = get_current_tenant()");
    expect(sql).toContain("LEAD INTERACTIONS intentionally has no public policy");
  });
});
