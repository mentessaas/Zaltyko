import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

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

