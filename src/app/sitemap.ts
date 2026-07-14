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
  "/contact",
  "/ayuda",
  "/sobre-nosotros",
  "/terminos",
  "/politica-privacidad",
  "/integraciones",
] as const;

const MODULE_ROUTES = [
  "/modules/gestion-atletas",
  "/modules/clases-horarios",
  "/modules/pagos-administracion",
  "/modules/comunicacion",
  "/modules/eventos-competiciones",
  "/modules/dashboard-reportes",
  "/modules/directorio-academias",
] as const;

const CLUSTER_LOCALES: Locale[] = ["es", "en"];
const MODALITY_KEYS = Object.keys(MODALITIES) as Array<keyof typeof MODALITIES>;
const COUNTRY_KEYS = ["espana", "mexico", "argentina", "colombia", "chile", "peru"] as Array<keyof typeof COUNTRIES>;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";

  const routes = PUBLIC_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));

  const moduleRoutes = MODULE_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Add localized homepage routes only if they resolve to a real page (not a 404/redirect).
  // Currently /es and /en redirect to /, so we omit them to avoid "soft 404" in Search Console.
  const localizedHomepages: Array<{ url: string; lastModified: Date; changeFrequency: "weekly"; priority: number }> = [];

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

  // Nota: se retiraron las variantes con query param (?category=) de marketplace/empleo:
  // un sitemap no debe listar URLs de filtro, generan contenido duplicado sin valor de indexación propio.

  return [
    ...routes,
    ...moduleRoutes,
    ...localizedHomepages,
    ...modalityPages,
    ...clusterPages,
  ];
}
