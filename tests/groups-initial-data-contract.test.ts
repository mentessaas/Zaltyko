import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("groups initial data contract", () => {
  it("keeps the initial group cards faithful to the database", () => {
    const page = readFileSync("src/app/app/[academyId]/groups/page.tsx", "utf8");

    expect(page).toContain("sportConfigId: groups.sportConfigId");
    expect(page).toContain("technicalFocus: groups.technicalFocus");
    expect(page).toContain("apparatus: groups.apparatus");
    expect(page).toContain("sessionBlocks: groups.sessionBlocks");
    expect(page).toContain("sportConfigId: group.sportConfigId ?? null");
    expect(page).toContain("technicalFocus: group.technicalFocus ?? null");
    expect(page).not.toContain("technicalFocus: null,");
    expect(page).not.toContain("apparatus: [],");
  });

  it("excludes deleted records and crosses no tenant boundary", () => {
    const page = readFileSync("src/app/app/[academyId]/groups/page.tsx", "utf8");

    expect(page).toContain("eq(groups.tenantId, academy.tenantId)");
    expect(page).toContain("isNull(groups.deletedAt)");
    expect(page).toContain("eq(groupAthletes.tenantId, academy.tenantId)");
    expect(page).toContain("isNull(athletes.deletedAt)");
  });
});
