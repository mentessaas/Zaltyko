import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment detail visibility contract", () => {
  it("keeps the dynamic athlete endpoint aligned with the collection endpoint", () => {
    const source = readFileSync("src/app/api/assessments/[athleteId]/route.ts", "utf8");
    expect(source).toContain("visibleToGuardians: z.boolean().default(false)");
    expect(source).toContain("visibleToGuardians: body.visibleToGuardians");
    expect(source).toContain("export const PATCH");
    expect(source).toContain("assessmentId");
  });
});
