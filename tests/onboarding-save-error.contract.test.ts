import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("role onboarding save contract", () => {
  it("does not show completion when parent or athlete profile save fails", () => {
    const parent = readFileSync("src/app/(site)/onboarding/parent/page.tsx", "utf8");
    const athlete = readFileSync("src/app/(site)/onboarding/athlete/page.tsx", "utf8");
    expect(parent).toContain("if (!profileResponse.ok)");
    expect(parent).toContain("await profileResponse.json().catch");
    expect(athlete).toContain("if (!profileResponse.ok)");
    expect(athlete).toContain("await profileResponse.json().catch");
  });
});
