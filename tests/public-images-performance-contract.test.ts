import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public image performance contract", () => {
  it("reserves dimensions for key public images to reduce layout shift", () => {
    const academy = readFileSync(join(process.cwd(), "src/components/landing/AcademyCard.tsx"), "utf8");
    const coach = readFileSync(join(process.cwd(), "src/components/landing/CoachCard.tsx"), "utf8");
    expect(academy).toContain("width={56}");
    expect(coach).toContain("width={64}");
  });
});
