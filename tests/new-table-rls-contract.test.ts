import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("new Supabase table RLS contract", () => {
  it("protects athlete skills by tenant and keeps lead history backend-only", () => {
    const skills = readFileSync("supabase/migrations/20260915110000_skill_provenance_athlete_skills.sql", "utf8");
    const leads = readFileSync("supabase/migrations/20260915120000_lead_interactions.sql", "utf8");
    expect(skills).toContain("enable row level security");
    expect(skills).toContain("tenant_id = get_current_tenant()");
    expect(skills).toContain("with check");
    expect(leads).toContain("alter table public.lead_interactions enable row level security");
  });
});
