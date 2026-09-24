import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("parent progress access contract", () => {
  it("requires a guardian-athlete link before opening progress", () => {
    const page = readFileSync("src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx", "utf8");
    const profile = readFileSync("src/components/profiles/ParentProfile.tsx", "utf8");
    expect(page).toContain("guardianAthletes");
    expect(page).toContain("guardians.profileId, profile.id");
    expect(page).toContain("canAccess = Boolean(guardianLink)");
    expect(page).toContain('profile.role === "athlete"');
    expect(page).toContain("visibleToGuardians, true");
    expect(profile).toContain("Ver progreso técnico");
  });
});
