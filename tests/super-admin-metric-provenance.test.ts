import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("super-admin metric provenance contract", () => {
  it("derives the latest user date from profiles rather than academies", () => {
    const source = readFileSync("src/lib/superAdminService.ts", "utf8");
    expect(source).toContain("latestUserAt");
    expect(source).toContain("db.select({ createdAt: profiles.createdAt })");
    expect(source).toContain("orderBy(desc(profiles.createdAt))");
  });

  it("does not label the user card with the latest academy date", () => {
    const source = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8"
    );
    expect(source).toContain("Última academia: ${latestAcademyDate}");
    expect(source).toContain("Último usuario: ${latestUserDate}");
    expect(source).not.toContain("subtitle: `Última alta: ${latestAcademyDate}`");
  });

  it("exposes owners without an active academy as an operational activation metric", () => {
    const service = readFileSync("src/lib/superAdminService.ts", "utf8");
    const dashboard = readFileSync(
      "src/app/(super-admin)/super-admin/components/SuperAdminDashboard.tsx",
      "utf8",
    );
    expect(service).toContain("pendingAcademyOwnerTotal");
    expect(service).toContain("activeAcademyId} IS NULL");
    expect(dashboard).toContain('title: "Dueños sin academia"');
    expect(dashboard).toContain("pendingAcademyOwners");
  });
});
