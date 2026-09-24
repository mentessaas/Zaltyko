import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/components/dashboard/DashboardPage.tsx", "utf8");

describe("dashboard quick actions surface", () => {
  it("uses the contextual widget as the single dashboard quick-action surface", () => {
    expect(dashboard).toContain("<QuickActionsWidget");
    expect(dashboard).not.toContain("<QuickActions academyId={academyId}");
  });
});
