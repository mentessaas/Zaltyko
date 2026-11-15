import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/quick-actions/record-payment/route.ts", "utf8");

describe("quick payment academy scope", () => {
  it("requires the charge to belong to the selected academy", () => {
    expect(route).toContain("eq(charges.academyId, academyId)");
    expect(route).toContain("authorizeAcademyCapability");
  });
});
