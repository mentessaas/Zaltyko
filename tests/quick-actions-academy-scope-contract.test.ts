import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const modal = readFileSync("src/components/dashboard/QuickClassModal.tsx", "utf8");
const widget = readFileSync("src/components/dashboard/QuickActionsWidget.tsx", "utf8");
const route = readFileSync("src/app/api/quick-actions/create-class/route.ts", "utf8");

describe("quick class academy scope", () => {
  it("passes the selected academy through the client flow", () => {
    expect(widget).toContain("academyId={academyId}");
    expect(modal).toContain("academyId=${encodeURIComponent(academyId)}");
    expect(modal).toContain("{ ...values, academyId }");
  });

  it("rejects classes outside the selected academy", () => {
    expect(route).toContain('permission: "classes:schedule"');
    expect(route).toContain("authorizeAcademyCapability");
    expect(route).toContain("classData.academyId !== academyId");
  });
});
