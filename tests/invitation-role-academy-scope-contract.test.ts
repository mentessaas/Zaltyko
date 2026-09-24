import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("multi-academy invitation roles", () => {
  it("does not assign a custom role outside its academy", () => {
    const source = readFileSync("src/app/api/invitations/complete/route.ts", "utf8");
    expect(source).toContain("eq(academyRoles.id, claimed.roleId)");
    expect(source).toContain("eq(academyRoles.academyId, academyId)");
    expect(source).toContain("if (roleForAcademy)");
  });
});
