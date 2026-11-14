import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("attendance and progress report scope contracts", () => {
  it("keeps attendance queries scoped to the requested academy", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/reports/attendance-calculator.ts"),
      "utf8",
    );
    expect(source).toContain("eq(classes.academyId, filters.academyId)");
    expect(source).toContain("eq(athletes.academyId, filters.academyId)");
    expect(source).toContain("eq(groups.academyId, filters.academyId)");
  });

});
