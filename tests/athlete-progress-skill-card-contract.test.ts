import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx", "utf8");

describe("athlete progress skill card contract", () => {
  it("renders technical observations with rollout-safe fallback and readable states", () => {
    expect(source).toContain("skillObservationRows");
    expect(source).toContain("Aún no hay observaciones de skills");
    expect(source).toContain("Dominado");
    expect(source).toContain("En competición");
    expect(source).toContain("catch {");
  });

  it("does not render NaN for assessments without scores", () => {
    expect(source).toContain("assessments.filter((a) => a.averageScore !== null).length > 0");
  });
});
