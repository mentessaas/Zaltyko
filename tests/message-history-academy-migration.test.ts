import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("message history academy migration", () => {
  it("adds an indexed academy scope with defensive backfill", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260910223120_message_history_academy_scope.sql"),
      "utf8"
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS academy_id uuid");
    expect(sql).toContain("message_history_academy_idx");
    expect(sql).toContain("mh.meta ->> 'academyId'");
    expect(sql).toContain("a.tenant_id = mh.tenant_id");
  });
});
