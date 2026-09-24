import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("monthly charges international and M:N contract", () => {
  const source = readFileSync(
    "src/app/api/charges/generate-monthly/route.ts",
    "utf8"
  );

  it("derives charge currency from the academy instead of hardcoding EUR", () => {
    expect(source).toContain("getCurrencyForCountry");
    expect(source).toContain("currency,\n        period");
  });

  it("resolves athletes whose group exists only in group_athletes", () => {
    expect(source).toContain("athletesWithoutLegacyGroup");
    expect(source).toContain("firstMembershipByAthlete");
    expect(source).toContain("groupAthletes.athleteId");
  });
});
