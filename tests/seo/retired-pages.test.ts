import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESSENTIAL_PUBLIC_ROUTES,
  isRetiredLaunchMarketing,
  retiredMarketingOutcome,
} from "@/lib/launch/essential-routes";
import { LEGACY_PUBLIC_REDIRECTS } from "@/lib/launch/legacy-public-redirects.mjs";

vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.com" }));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  permanentRedirect: vi.fn((to: string) => { throw new Error(`NEXT_PERMANENT_REDIRECT ${to}`); }),
}));
vi.mock("next/navigation", () => navigation);

import sitemap from "@/app/sitemap";
import LocaleAyudaPage from "@/app/(site)/[locale]/ayuda/page";
import LocaleSobreNosotrosPage from "@/app/(site)/[locale]/sobre-nosotros/page";

// URLs that search engines still list (or did) and what each must answer.
// 301 → closest live page; 410 → nothing replaces it.
const RETIRED_MARKETING: ReadonlyArray<[path: string, status: 301 | 410, location?: string]> = [
  ["/gimnasia-ritmica", 301, "/features"],
  ["/gimnasia-ritmica/espana", 301, "/features"],
  ["/es/gimnasia-ritmica/espana", 301, "/features"],
  ["/gimnasia-artistica", 301, "/features"],
  ["/en/rhythmic-gymnastics", 301, "/features"],
  ["/artistic-gymnastics/spain", 301, "/features"],
  ["/gimnasia-acrobatica", 410],
  ["/trampolin", 410],
  ["/es/trampolin/espana", 410],
  ["/en/acrobatic-gymnastics/spain", 410],
  ["/trampoline", 410],
  ["/modules", 301, "/features"],
  ["/modules/pagos-administracion", 301, "/features"],
  ["/comparativas", 301, "/features"],
  ["/comparativas/zaltyko-vs-excel", 301, "/features"],
  ["/sobre-nosotros", 301, "/"],
  ["/es/sobre-nosotros", 301, "/"],
  ["/blog", 410],
  ["/blog/migrar-excel", 410],
  ["/es/blog/migrar-excel", 410],
];

describe("retired marketing pages", () => {
  it.each(RETIRED_MARKETING)("%s answers %s %s", (path, status, location) => {
    expect(retiredMarketingOutcome(path)).toEqual(status === 301 ? { status, location } : { status });
    expect(isRetiredLaunchMarketing(path)).toBe(true);
  });

  it("redirects only to live, non-retired pages (no chains)", () => {
    for (const [, status, location] of RETIRED_MARKETING) {
      if (status !== 301) continue;
      expect(ESSENTIAL_PUBLIC_ROUTES).toContain(location);
      expect(retiredMarketingOutcome(location!)).toBeNull();
    }
  });

  it.each(["/", "/features", "/pricing", "/ayuda", "/modulesx", "/blogger", "/gimnasia-ritmica-x"])(
    "leaves %s alone", path => {
      expect(retiredMarketingOutcome(path)).toBeNull();
    }
  );
});

describe("sitemap", () => {
  it("lists no retired page and no legacy alias", async () => {
    const paths = (await sitemap()).map(entry => new URL(entry.url).pathname);
    const aliasSources = new Set(LEGACY_PUBLIC_REDIRECTS.map(([source]) => source));
    for (const path of paths) {
      expect(isRetiredLaunchMarketing(path), path).toBe(false);
      expect(aliasSources.has(path), path).toBe(false);
    }
    for (const [path] of RETIRED_MARKETING) expect(paths).not.toContain(path);
  });
});

describe("legacy public aliases in next.config.mjs", () => {
  function configuredRedirects(): Array<{ source: string; destination: string; permanent?: boolean; has?: unknown }> {
    const url = pathToFileURL(resolve(process.cwd(), "next.config.mjs")).href;
    const output = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `const {default:c}=await import(${JSON.stringify(url)});console.log(JSON.stringify(await c.redirects()));`],
      {
        cwd: process.cwd(),
        env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
        timeout: 15_000,
        maxBuffer: 256 * 1024,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    return JSON.parse(output.trim().split("\n").at(-1)!);
  }

  it("serves every alias as a permanent redirect straight to a live page", () => {
    const redirects = configuredRedirects();
    expect(LEGACY_PUBLIC_REDIRECTS).toEqual([
      ["/planes", "/pricing"],
      ["/precios", "/pricing"],
      ["/contacto", "/contact"],
      ["/nosotros", "/"],
      ["/about", "/"],
      ["/help", "/ayuda"],
      ["/privacy-policy", "/politica-privacidad"],
      ["/tos", "/terminos"],
      ["/es", "/"],
      ["/en", "/"],
      ["/es/ayuda", "/ayuda"],
      ["/en/ayuda", "/ayuda"],
    ]);
    const aliasSources = new Set(LEGACY_PUBLIC_REDIRECTS.map(([source]) => source));
    for (const [source, destination] of LEGACY_PUBLIC_REDIRECTS) {
      expect(redirects).toContainEqual({ source, destination, permanent: true });
      expect(ESSENTIAL_PUBLIC_ROUTES).toContain(destination);
      expect(aliasSources.has(destination)).toBe(false);
      expect(retiredMarketingOutcome(destination)).toBeNull();
    }
  });
});

describe("locale-prefixed legacy handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["ayuda", LocaleAyudaPage, "/ayuda"],
    ["sobre-nosotros", LocaleSobreNosotrosPage, "/"],
  ] as const)("/{es,en}/%s redirects permanently to %s's live page", async (_name, Page, target) => {
    for (const locale of ["es", "en"]) {
      await expect(Page({ params: Promise.resolve({ locale }) })).rejects.toThrow(`NEXT_PERMANENT_REDIRECT ${target}`);
    }
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it.each([
    ["ayuda", LocaleAyudaPage],
    ["sobre-nosotros", LocaleSobreNosotrosPage],
  ] as const)("/<unknown>/%s is a real 404, not a redirect", async (_name, Page) => {
    for (const locale of ["fr", "recursos", "x"]) {
      await expect(Page({ params: Promise.resolve({ locale }) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(navigation.permanentRedirect).not.toHaveBeenCalled();
  });
});
