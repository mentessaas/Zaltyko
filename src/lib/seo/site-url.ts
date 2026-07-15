const CANONICAL_SITE_URL = "https://zaltyko.com";

/**
 * Returns the public URL used by metadata, canonicals, sitemap and robots.
 *
 * Vercel preview/project URLs and temporary Cloudflare tunnels must never be
 * emitted as SEO canonicals. They remain useful for runtime callbacks, but
 * search engines should consolidate signals on the custom production domain.
 */
export function getPublicSiteUrl(): string {
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
