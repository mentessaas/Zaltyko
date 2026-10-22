const CANONICAL_SITE_URL = "https://zaltyko.com";
const DEV_SITE_URL = "http://localhost:3000";

/**
 * Returns the public URL used by metadata, canonicals, sitemap and robots.
 *
 * Vercel preview/project URLs and temporary Cloudflare tunnels must never be
 * emitted as SEO canonicals. They remain useful for runtime callbacks, but
 * search engines should consolidate signals on the custom production domain.
 *
 * In development (`NODE_ENV=development`) devuelve `http://localhost:3000`
 * para que `pnpm dev` produzca sitemap/canonical/og:url coherentes sin
 * contaminar el canónico de producción.
 */
export function getPublicSiteUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return DEV_SITE_URL;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (!configured) return CANONICAL_SITE_URL;

  try {
    const hostname = new URL(configured).hostname.toLowerCase();
    if (
      hostname === "zaltyko.vercel.app" ||
      hostname.endsWith(".vercel.app") ||
      hostname.endsWith(".trycloudflare.com")
    ) {
      return CANONICAL_SITE_URL;
    }
  } catch {
    return CANONICAL_SITE_URL;
  }

  return configured;
}
