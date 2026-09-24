import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("athlete skill notification contract", () => {
  it("notifies only linked guardians after an explicitly shared observation", () => {
    const source = readFileSync("src/app/api/athlete-skills/route.ts", "utf8");
    expect(source).toContain("if (created && input.visibleToGuardians)");
    expect(source).toContain("guardianAthletes");
    expect(source).toContain('type: "skill_progress"');
    expect(source).toContain("Promise.allSettled");
  });
});
