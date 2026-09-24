import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment form publication contract", () => {
  it("offers explicit guardian publication and sends it to the API", () => {
    const source = readFileSync("src/components/assessments/AssessmentForm.tsx", "utf8");
    expect(source).toContain("visibleToGuardians");
    expect(source).toContain("Compartir esta evaluación con el tutor");
    expect(source).toContain("visibleToGuardians,");
  });
});
