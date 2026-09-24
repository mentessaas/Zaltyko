import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("assessment visibility label contract", () => {
  it("makes publication state auditable in the history list", () => {
    const history = readFileSync("src/components/assessments/AssessmentHistory.tsx", "utf8");
    const type = readFileSync("src/types/index.ts", "utf8");
    expect(type).toContain("visibleToGuardians?: boolean");
    expect(history).toContain("Visible al tutor");
    expect(history).toContain("Privada");
  });
});
