import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260911100000_provision_storage_buckets.sql",
  "utf8"
);

describe("Storage bucket contract", () => {
  it("provisions every bucket consumed by active upload modules", () => {
    expect(migration).toContain("'avatars'");
    expect(migration).toContain("'events'");
    expect(migration).toContain("'ticket-attachments'");
  });

  it("keeps private uploads and ticket attachments non-public", () => {
    expect(migration).toMatch(/\('ticket-attachments',[\s\S]*?false/);
    expect(migration).not.toMatch(/\('uploads',[\s\S]*?true/);
  });
});
