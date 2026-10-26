import { describe, expect, it, vi } from "vitest";
import { ESSENTIAL_PUBLIC_ROUTES, isOutsideEssentialLaunch, isRetiredLaunchMarketing } from "@/lib/launch/essential-routes";

vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.com" }));
import sitemap from "@/app/sitemap";

describe("essential launch sitemap", () => {
  it("emits the actual finite public route set, with no customer or historical marketing URLs", async () => {
    const entries = await sitemap();
    const paths = entries.map(entry => new URL(entry.url).pathname);
    expect(paths).toEqual([...ESSENTIAL_PUBLIC_ROUTES, "/llms.txt", "/llms-full.txt"]);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(isOutsideEssentialLaunch(path)).toBe(false);
      expect(isRetiredLaunchMarketing(path)).toBe(false);
      expect(path).not.toMatch(/^\/(?:api|app|dashboard|owner|super-admin|dev)(?:\/|$)/);
    }
  });

  it("uses the real content revision rather than the request time", async () => {
    for (const entry of await sitemap()) {
      expect(entry.lastModified).toEqual(new Date("2026-10-26T00:00:00Z"));
    }
  });
});
