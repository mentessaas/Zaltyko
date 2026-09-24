import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("role membership referential integrity", () => {
  it("keeps role assignments attached to live entities", () => {
    const schema = readFileSync("src/db/schema/roles.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260911080000_role_members_foreign_keys.sql", "utf8");
    expect(schema).toContain('references(() => academyRoles.id, { onDelete: "cascade" })');
    expect(schema).toContain('references(() => profiles.userId, { onDelete: "cascade" })');
    expect(schema).toContain('references(() => academies.id, { onDelete: "cascade" })');
    expect(migration).toContain("role_members_role_fk");
  });
});
