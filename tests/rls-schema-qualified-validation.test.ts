import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractPoliciesFromSource,
  extractRlsTablesFromSource,
} from "../scripts/validate-rls";

describe("SQL source RLS validator", () => {
  it.each(["lead_trials", "public.lead_trials", '"public"."lead_trials"'])(
    "recognizes policy and RLS for %s", (table) => {
      const dir = mkdtempSync(join(tmpdir(), "zaltyko-rls-parser-"));
      try {
        const file = join(dir, "fixture.sql");
        const source = `alter table ${table} enable row level security;\ncreate policy "tenant_access" on ${table} for all using (false);`;
        writeFileSync(file, source);
        expect([...extractRlsTablesFromSource(source)]).toEqual([JSON.stringify(["public", "lead_trials"])]);
        expect(
          extractPoliciesFromSource(source, file).map((policy) => `${policy.schema}.${policy.table}`)
        ).toEqual(["public.lead_trials"]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  );
  it("does not count a private schema policy as protection for a public table", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaltyko-rls-parser-"));
    try {
      const file = join(dir, "fixture.sql");
      const source = 'alter table private.lead_trials enable row level security;\ncreate policy "tenant_access" on private.lead_trials for all using (false);';
      writeFileSync(file, source);
      const protectedRelations = [...extractRlsTablesFromSource(source)];
      expect(protectedRelations).toEqual([JSON.stringify(["private", "lead_trials"])]);
      expect(protectedRelations).not.toContain(JSON.stringify(["public", "lead_trials"]));
      expect(extractPoliciesFromSource(source, file)).toMatchObject([
        { schema: "private", table: "lead_trials" },
      ]);
      expect(
        extractPoliciesFromSource(source, file).some(
          (policy) => policy.schema === "public" && policy.table === "lead_trials"
        )
      ).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
