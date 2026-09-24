import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("athlete skill observation form contract", () => {
  it("uses the scoped API and exposes the coach's essential workflow", () => {
    const source = readFileSync("src/components/athletes/AthleteSkillObservationForm.tsx", "utf8");
    const page = readFileSync("src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx", "utf8");
    expect(source).toContain('fetch("/api/skills?limit=200")');
    expect(source).toContain('fetch("/api/athlete-skills"');
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("Guardar observación");
    expect(source).toContain('role="status"');
    expect(page).toContain("<AthleteSkillObservationForm athleteId={athleteId} />");
    expect(page).toContain('profile.role !== "parent" && profile.role !== "athlete"');
  });
});
