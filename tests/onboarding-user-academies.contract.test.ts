import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding academy access contract", () => {
  it("includes invited memberships in addition to owned academies", () => {
    const source = readFileSync("src/app/api/onboarding/user-academies/route.ts", "utf8");
    expect(source).toContain("memberships");
    expect(source).toContain("eq(memberships.userId, user.id)");
    expect(source).toContain("new Map([...ownedAcademies, ...memberAcademies]");
  });
});
