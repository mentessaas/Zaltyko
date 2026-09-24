import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("athlete skills schema contract", () => {
  it("keeps provenance additive and the observation table tenant-scoped", () => {
    const sql = readFileSync("supabase/migrations/20260915110000_skill_provenance_athlete_skills.sql", "utf8");
    expect(sql).toContain("add column if not exists source");
    expect(sql).toContain("create table if not exists public.athlete_skills");
    expect(sql).toContain("tenant_id uuid not null");
    expect(sql).toContain("idempotency_key text");
    expect(sql).not.toMatch(/drop\s+(table|column)/i);
  });
});
