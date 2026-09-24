import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment guardian publication contract", () => {
  it("defaults new assessments private and allows explicit publication", () => {
    const schema = readFileSync("src/db/schema/athlete-assessments.ts", "utf8");
    const route = readFileSync("src/app/api/assessments/route.ts", "utf8");
    const sql = readFileSync("supabase/migrations/20260915130000_assessment_guardian_visibility.sql", "utf8");
    expect(schema).toContain("visibleToGuardians");
    expect(route).toContain("visibleToGuardians: z.boolean().default(false)");
    expect(route).toContain("visibleToGuardians: body.visibleToGuardians");
    expect(sql).toContain("add column if not exists visible_to_guardians");
  });
});
