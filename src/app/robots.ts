import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicSiteUrl();

  return {
    rules: [
      // Allow all AI crawlers
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      // Default rules. /dev bloqueado defensivamente por si llega a desplegar
      // una preview o un theme playground en producción.
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/api", "/dashboard", "/super-admin", "/dev"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
