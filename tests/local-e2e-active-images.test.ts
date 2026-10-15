import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_LOCAL_SUPABASE_IMAGES,
  EXCLUDED_LOCAL_SUPABASE_IMAGES,
  REQUIRED_LOCAL_SUPABASE_IMAGES,
  findMissingImages,
} from "../scripts/lib/local-e2e-preflight";
import { LOCAL_E2E_DIGEST_PINS } from "../scripts/lib/local-e2e-digest-pins";

describe("fixed active local image plan", () => {
  it("retains all 13 catalog pins and excludes exactly two management images", () => {
    expect(REQUIRED_LOCAL_SUPABASE_IMAGES).toHaveLength(13);
    expect(LOCAL_E2E_DIGEST_PINS.map((pin) => pin.ecr)).toEqual(
      REQUIRED_LOCAL_SUPABASE_IMAGES
    );
    expect(EXCLUDED_LOCAL_SUPABASE_IMAGES).toEqual([
      "public.ecr.aws/supabase/studio:2026.03.23-sha-b7847b7",
      "public.ecr.aws/supabase/postgres-meta:v0.96.1",
    ]);
    expect(ACTIVE_LOCAL_SUPABASE_IMAGES).toHaveLength(11);
    expect(new Set(ACTIVE_LOCAL_SUPABASE_IMAGES).size).toBe(11);
    expect(Object.isFrozen(ACTIVE_LOCAL_SUPABASE_IMAGES)).toBe(true);
    expect(
      REQUIRED_LOCAL_SUPABASE_IMAGES.filter(
        (image) => !ACTIVE_LOCAL_SUPABASE_IMAGES.includes(image)
      )
    ).toEqual(EXCLUDED_LOCAL_SUPABASE_IMAGES);
  });

  it.each(ACTIVE_LOCAL_SUPABASE_IMAGES)(
    "requires active image %s",
    (missing) => {
      const installed = ACTIVE_LOCAL_SUPABASE_IMAGES.filter(
        (image) => image !== missing
      );
      expect(
        findMissingImages(ACTIVE_LOCAL_SUPABASE_IMAGES, installed)
      ).toEqual([missing]);
    }
  );

  it("accepts all active images without management images", () => {
    expect(
      findMissingImages(ACTIVE_LOCAL_SUPABASE_IMAGES, [
        ...ACTIVE_LOCAL_SUPABASE_IMAGES,
      ])
    ).toEqual([]);
  });

  it("wires the same plan into preload and fail-closed runner preflight", () => {
    const runner = readFileSync(
      new URL("../scripts/run-e2e-local.ts", import.meta.url),
      "utf8"
    );
    const preloader = readFileSync(
      new URL("../scripts/lib/local-e2e-image-preloader.ts", import.meta.url),
      "utf8"
    );
    expect(runner).toContain(
      "findMissingImages(\n      ACTIVE_LOCAL_SUPABASE_IMAGES,"
    );
    expect(runner).toContain(
      'localProject(["start", "--exclude", "supavisor,studio,postgres-meta"])'
    );
    expect(runner).toContain("if (missingImages.length > 0)");
    expect(preloader).toContain(
      "for (const image of ACTIVE_LOCAL_SUPABASE_IMAGES)"
    );
  });
});
