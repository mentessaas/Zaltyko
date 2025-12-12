import type { MetadataRoute } from "next";

const PUBLIC_ROUTES = ["/", "/features", "/pricing"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return PUBLIC_ROUTES.map((path, index) => ({
    url: `${baseUrl}${path}`,
    priority: index === 0 ? 1 : 0.8,
  }));
}

