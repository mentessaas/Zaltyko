import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("E2E family schema contract", () => {
  it("does not write the removed guardians.is_primary column", () => {
    const source = readFileSync("scripts/prepare-e2e-family-auth.ts", "utf8");
    expect(source).not.toContain("guardians (tenant_id, profile_id, name, email, relationship, is_primary)");
    expect(source).toContain("guardian_athletes (tenant_id, guardian_id, athlete_id, relationship, is_primary)");
  });
});
