import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("classes tenant scope contract", () => {
  it("keeps tenant filtering when academyId is supplied", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/classes/route.ts"),
      "utf8"
    );

    expect(source).toContain("eq(classes.tenantId, context.tenantId)");
    expect(source).toContain("...(targetAcademyId ? [eq(classes.academyId, targetAcademyId)] : [])");
  });
});
