import type { MetadataRoute } from "next";
import { MODALITIES, COUNTRIES } from "@/lib/seo/clusters";
import type { Locale } from "@/i18n";

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

// Cluster routes: 24 clusters (4 modalities x 6 countries)
const CLUSTER_LOCALES: Locale[] = ["es", "en"];
const MODALITY_KEYS = Object.keys(MODALITIES) as Array<keyof typeof MODALITIES>;
const COUNTRY_KEYS = Object.keys(COUNTRIES) as Array<keyof typeof COUNTRIES>;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const routes = PUBLIC_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));

  // Add localized homepage routes
  const localizedHomepages = CLUSTER_LOCALES.map((locale) => ({
    url: `${baseUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  // Add modality listing pages (8 pages: 4 modalities x 2 locales)
  const modalityPages = CLUSTER_LOCALES.flatMap((locale) =>
    MODALITY_KEYS.map((modality) => ({
      url: `${baseUrl}/${locale}/${MODALITIES[modality][locale]}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
  );

  // Add cluster pages (24 pages: 4 modalities x 6 countries x 1 locale - using ES as primary)
  // Note: For ES locale only since that's the primary market
  const clusterPages = MODALITY_KEYS.flatMap((modality) =>
    COUNTRY_KEYS.map((country) => ({
      url: `${baseUrl}/es/${MODALITIES[modality].es}/${COUNTRIES[country].es}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: country === "espana" || country === "mexico" ? 0.8 : 0.7,
    }))
  );

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

  return [
    ...routes,
    ...localizedHomepages,
    ...modalityPages,
    ...clusterPages,
    ...marketplaceRoutes,
    ...employmentRoutes,
  ];
}
