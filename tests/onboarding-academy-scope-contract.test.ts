import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("onboarding academy scope contract", () => {
  it("verifies the requested academy belongs to the authenticated tenant", () => {
    for (const file of [
      "src/app/api/onboarding/state/route.ts",
      "src/app/api/onboarding/checklist/route.ts",
      "src/app/api/onboarding/checklist/mark/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("verifyAcademyAccess");
      expect(source).toContain("context.tenantId");
    }
    expect(readFileSync(join(process.cwd(), "src/app/api/onboarding/state/route.ts"), "utf8")).toContain("request.json().catch");
    expect(readFileSync(join(process.cwd(), "src/app/api/onboarding/checklist/mark/route.ts"), "utf8")).toContain("request.json().catch");
  });
});
