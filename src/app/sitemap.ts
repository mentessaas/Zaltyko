import type { MetadataRoute } from "next";
import { ESSENTIAL_PUBLIC_ROUTES } from "@/lib/launch/essential-routes";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

// Discovery, marketplace and historical marketing are outside the first
// release. Do not query legacy or customer data to construct this sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicSiteUrl();
  const lastModified = new Date("2026-10-26T00:00:00Z");
  return [
    ...ESSENTIAL_PUBLIC_ROUTES.map(path => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.8,
    })),
    ...["/llms.txt", "/llms-full.txt"].map(path => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
