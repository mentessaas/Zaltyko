import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("contact lead history contract", () => {
  it("keeps the deduplicated lead and records immutable interactions", () => {
    const route = readFileSync("src/app/api/contact/route.ts", "utf8");
    const sql = readFileSync("supabase/migrations/20260915120000_lead_interactions.sql", "utf8");
    expect(route).toContain("onConflictDoNothing({ target: leads.email })");
    expect(route).toContain("leadInteractions");
    expect(route).toContain("onConflictDoNothing({ target: leadInteractions.submissionId })");
    expect(sql).toContain("create table if not exists public.lead_interactions");
    expect(sql).toContain("create unique index if not exists lead_interactions_submission_idx");
    expect(sql).not.toMatch(/drop\s+(table|column)/i);
  });
});
