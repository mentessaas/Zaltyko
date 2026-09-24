import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/lead-trials/[trialId]/outcome/route.ts", "utf8");
const schema = readFileSync("src/db/schema/lead-trials.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260915140000_lead_trials.sql", "utf8");

describe("prospect trial outcome contract", () => {
  it("keeps class trials separate from subscription trials", () => {
    expect(schema).toContain('"lead_trials"');
    expect(route).toContain("leadTrialOutcomes");
    expect(route).not.toContain("academyTrials");
    expect(route).toContain('permission: "billing:update"');
    expect(route).toContain("onConflictDoNothing");
    expect(route).toContain('eventName: "lead_trial_outcome_recorded"');
    expect(migration).toContain("lead_trials");
    expect(migration).toContain("lead_trial_outcomes");
    expect(migration).toContain("get_current_tenant()");
  });
});
