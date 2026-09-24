import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPolicies, extractRlsTables } from "../scripts/validate-rls";

describe("SQL source RLS validator", () => {
  it.each(["lead_trials", "public.lead_trials", '"public"."lead_trials"'])(
    "recognizes policy and RLS for %s", (table) => {
      const dir = mkdtempSync(join(tmpdir(), "zaltyko-rls-parser-"));
      try {
        const file = join(dir, "fixture.sql");
        writeFileSync(file, `alter table ${table} enable row level security;\ncreate policy "tenant_access" on ${table} for all using (false);`);
        expect([...extractRlsTables(file)]).toEqual(["lead_trials"]);
        expect(extractPolicies(file, "fixture.sql").map(p => p.table)).toEqual(["lead_trials"]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  );
  it("does not count a private schema policy as protection for a public table", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaltyko-rls-parser-"));
    try {
      const file = join(dir, "fixture.sql");
      writeFileSync(file, 'alter table private.lead_trials enable row level security;\ncreate policy "tenant_access" on private.lead_trials for all using (false);');
      expect([...extractRlsTables(file)]).toEqual([]);
      expect(extractPolicies(file, "fixture.sql")).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
