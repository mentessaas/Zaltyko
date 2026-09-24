import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("commercial trial lead link", () => {
  it("is additive, nullable and indexed", () => {
    const schema = readFileSync("src/db/schema/academy-trials.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260915100000_trial_lead_link.sql", "utf8");

    expect(schema).toContain('leadId: uuid("lead_id")');
    expect(schema).toContain("references(() => leads.id, { onDelete: \"set null\" })");
    expect(schema).toContain('index("academy_trials_lead_idx")');
    expect(migration).toContain("add column if not exists lead_id uuid");
    expect(migration).toContain("on delete set null");
    expect(migration).toContain("create index if not exists academy_trials_lead_idx");
  });
});
