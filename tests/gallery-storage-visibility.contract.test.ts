import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("gallery storage visibility", () => {
  it("uses the public media bucket only for coach gallery images", () => {
    const route = readFileSync("src/app/api/upload/route.ts", "utf8");
    const helper = readFileSync("src/lib/supabase/storage-helpers.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260911100000_provision_storage_buckets.sql", "utf8");
    expect(route).toContain('parsed.data.folder === "coach-gallery"');
    expect(route).toContain('bucket: isPublicGallery ? "avatars" : "uploads"');
    expect(helper).toContain('bucket = options?.bucket ?? "uploads"');
    expect(migration).toContain("('avatars', 'avatars', true");
  });
});
