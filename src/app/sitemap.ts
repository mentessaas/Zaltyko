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
  "/auth/login",
] as const;

const CLUSTER_LOCALES: Locale[] = ["es", "en"];
const MODALITY_KEYS = Object.keys(MODALITIES) as Array<keyof typeof MODALITIES>;
const COUNTRY_KEYS = ["espana", "mexico", "argentina", "colombia", "chile", "peru"] as Array<keyof typeof COUNTRIES>;

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

  const modalityPages = CLUSTER_LOCALES.flatMap((locale) =>
    MODALITY_KEYS.flatMap((modality) => {
      const modalitySlug = MODALITIES[modality][locale];
      if (!modalitySlug) return [];
      return {
        url: `${baseUrl}/${locale}/${modalitySlug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      };
    })
  );

  const clusterPages = CLUSTER_LOCALES.flatMap((locale) =>
    MODALITY_KEYS.flatMap((modality) =>
      COUNTRY_KEYS.flatMap((country) => {
        const modalitySlug = MODALITIES[modality][locale];
        const countrySlug = COUNTRIES[country][locale];
        if (!modalitySlug || !countrySlug) return [];
        return {
          url: `${baseUrl}/${locale}/${modalitySlug}/${countrySlug}`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: country === "espana" || country === "mexico" ? 0.8 : 0.7,
        };
      })
    )
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
