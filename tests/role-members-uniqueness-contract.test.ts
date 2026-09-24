import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("role membership uniqueness", () => {
  it("scopes custom-role uniqueness to an academy", () => {
    const schema = readFileSync("src/db/schema/roles.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260911073000_fix_role_members_scope_unique.sql", "utf8");
    expect(schema).toContain('on(table.academyId, table.userId)');
    expect(migration).toContain("(academy_id, user_id)");
    expect(migration).toContain("DROP INDEX IF EXISTS public.role_members_uq");
  });
});
