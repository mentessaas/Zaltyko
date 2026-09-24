import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("athlete skill guardian visibility contract", () => {
  it("defaults observations private and checks guardian links before exposing them", () => {
    const route = readFileSync("src/app/api/athlete-skills/route.ts", "utf8");
    const schema = readFileSync("supabase/migrations/20260915110000_skill_provenance_athlete_skills.sql", "utf8");
    const form = readFileSync("src/components/athletes/AthleteSkillObservationForm.tsx", "utf8");
    expect(schema).toContain("visible_to_guardians boolean not null default false");
    expect(schema).toContain("add column if not exists visible_to_guardians");
    expect(route).toContain("guardianAthletes");
    expect(route).toContain("eq(athleteSkills.visibleToGuardians, true)");
    expect(form).toContain("Compartir esta observación con el tutor");
  });
});
