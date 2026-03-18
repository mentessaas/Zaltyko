import type { MetadataRoute } from "next";

const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/pricing",
  "/academias",
  "/marketplace",
  "/empleo",
  "/events",
  "/login",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const routes = PUBLIC_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));

  // Add static routes for marketplace categories
  const marketplaceCategories = ["ropa", "equipamiento", "suplementos", "servicios"];
  const marketplaceRoutes = marketplaceCategories.map((category) => ({
    url: `${baseUrl}/marketplace?category=${category}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Add static routes for employment categories
  const employmentTypes = ["entrenador", "auxiliar", "administrativo"];
  const employmentRoutes = employmentTypes.map((type) => ({
    url: `${baseUrl}/empleo?category=${type}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  return [...routes, ...marketplaceRoutes, ...employmentRoutes];
}
