import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertConfiguredE2EFamilyAthlete } from "../scripts/lib/e2e-family-athlete";

describe("E2E family schema contract", () => {
  it("does not write the removed guardians.is_primary column", () => {
    const source = readFileSync("scripts/prepare-e2e-family-auth.ts", "utf8");
    expect(source).not.toContain("guardians (tenant_id, profile_id, name, email, relationship, is_primary)");
    expect(source).toContain("guardian_athletes (tenant_id, guardian_id, athlete_id, relationship, is_primary)");
  });

  it("reuses the existing synthetic athlete only when it belongs to the configured test account", () => {
    const athlete = {
      id: "athlete-e2e",
      name: "E2E Athlete",
      user_id: "auth-athlete-e2e",
      academy_id: "academy-e2e",
      tenant_id: "tenant-e2e",
    };

    expect(
      assertConfiguredE2EFamilyAthlete(athlete, {
        academyId: "academy-e2e",
        tenantId: "tenant-e2e",
        athleteUserId: "auth-athlete-e2e",
        deterministicName: "E2E Athlete (e2e-family)",
        legacyName: "E2E Athlete",
      })
    ).toBe("athlete-e2e");

    expect(() =>
      assertConfiguredE2EFamilyAthlete(
        { ...athlete, user_id: "another-user" },
        {
          academyId: "academy-e2e",
          tenantId: "tenant-e2e",
          athleteUserId: "auth-athlete-e2e",
          deterministicName: "E2E Athlete (e2e-family)",
          legacyName: "E2E Athlete",
        }
      )
    ).toThrow("disposable athlete row");
  });
});
