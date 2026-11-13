import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/seo/site-url", () => ({ getPublicSiteUrl: () => "https://zaltyko.com" }));

import ThemePreviewPage, { metadata } from "@/app/dev/theme-preview/page";
import robots from "@/app/robots";
import { ThemePreview } from "@/components/ui/theme-preview";

afterEach(() => { vi.unstubAllEnvs(); });

// La auditoría de coherencia visual (2026-11-12) encontró /dev/theme-preview
// respondiendo 200 en producción con el «Design System Preview» antiguo.
describe("/dev/theme-preview", () => {
  it("responde 404 en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => ThemePreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("responde 404 en staging y previews de Vercel", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => ThemePreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("responde 404 con `next start` local (build de producción)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    expect(() => ThemePreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("no se sirve aunque un despliegue de Vercel arranque en modo desarrollo", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => ThemePreviewPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("sigue disponible en `next dev` local", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    expect(ThemePreviewPage().type).toBe(ThemePreview);
  });

  it("no es indexable y robots mantiene Disallow: /dev", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    const rules = robots().rules;
    const wildcard = (Array.isArray(rules) ? rules : [rules]).find(rule => rule.userAgent === "*");
    expect(wildcard?.disallow).toContain("/dev");
  });
});
