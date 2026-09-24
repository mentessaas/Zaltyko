import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const listRoute = readFileSync("src/app/api/reports/scheduled/route.ts", "utf8");
const itemRoute = readFileSync("src/app/api/reports/scheduled/[id]/route.ts", "utf8");

describe("scheduled reports API contract", () => {
  it("scopes list/create operations to an academy and validates payloads", () => {
    expect(listRoute).toContain("verifyAcademyAccess");
    expect(listRoute).toContain("createSchema");
    expect(listRoute).toContain(".limit(100)");
    expect(listRoute).toContain("Los reportes de eventos requieren formato Excel");
  });

  it("uses tenant-owned lookup for item mutations", () => {
    expect(itemRoute).toContain("innerJoin(academies");
    expect(itemRoute).toContain("eq(academies.tenantId, tenantId)");
    expect(itemRoute).toContain("export const PATCH");
    expect(itemRoute).toContain("export const DELETE");
  });
});
