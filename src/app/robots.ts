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
      // Default rules
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/api", "/dashboard", "/super-admin"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
