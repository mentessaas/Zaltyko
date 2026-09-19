import type { MetadataRoute } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { MODALITIES, COUNTRIES } from "@/lib/seo/clusters";
import {
  INDEXABLE_ACADEMY_STATUS_VALUES,
  isAcademyIndexable,
} from "@/lib/seo/academy-indexability";
import { getComparisonSlugs } from "@/lib/seo/comparativas";
import { getBlogSlugs, loadBlogPost } from "@/lib/seo/blog";
import type { Locale } from "@/i18n";

// El estado de una academia puede cambiar fuera del ciclo de generación del
// sitemap. Nunca servimos una lista cacheada de URLs terminales.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mapa de última edición real del copy público. Mantener al día cuando se
// cambie copy que afecte a la página — Google usa lastModified como señal de
// freshness. Sin este mapa el sitemap marcaba TODO como modificado hoy, lo que
// diluía la señal.
const PUBLIC_LAST_UPDATED: Record<string, string> = {
  "/": "2026-09-18",
  "/features": "2026-09-18",
  "/pricing": "2026-09-18",
  "/academias": "2026-09-15",
  "/coaches": "2026-09-12",
  "/marketplace": "2026-09-10",
  "/empleo": "2026-09-15",
  "/events": "2026-09-12",
  "/faq": "2026-09-18",
  "/contact": "2026-08-20",
  "/ayuda": "2026-09-10",
  "/sobre-nosotros": "2026-08-25",
  "/terminos": "2026-07-15",
  "/politica-privacidad": "2026-07-15",
  "/integraciones": "2026-08-30",
  "/comparativas": "2026-09-18",
  "/blog": "2026-09-18",
};

const COMPARISON_LAST_UPDATED = "2026-09-18";
const BLOG_POST_LAST_UPDATED = "2026-09-18";

interface BlogPostDate {
  slug: string;
  dateModified?: string;
}

async function loadBlogPostDates(): Promise<BlogPostDate[]> {
  const out: BlogPostDate[] = [];
  for (const slug of getBlogSlugs()) {
    const post = await loadBlogPost("es", slug);
    if (!post) continue;
    out.push({ slug, dateModified: post.dateModified });
  }
  return out;
}

const MODULE_LAST_UPDATED: Record<string, string> = {
  "/modules/gestion-atletas": "2026-09-10",
  "/modules/clases-horarios": "2026-09-10",
  "/modules/pagos-administracion": "2026-09-10",
  "/modules/comunicacion": "2026-09-10",
  "/modules/eventos-competiciones": "2026-09-10",
  "/modules/dashboard-reportes": "2026-09-10",
  "/modules/directorio-academias": "2026-09-10",
};

const CLUSTER_LAST_UPDATED = "2026-09-10";

const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/pricing",
  "/academias",
  "/coaches",
  "/marketplace",
  "/empleo",
  "/events",
  "/faq",
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

function parseLastUpdated(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicSiteUrl();
  const today = new Date();

  // Cargar metadata de comparativas y blog para enriquecer lastModified.
  const comparisonSlugs = getComparisonSlugs();
  const blogPosts = await loadBlogPostDates();

  const routes = PUBLIC_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: parseLastUpdated(PUBLIC_LAST_UPDATED[path], today),
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));

  const moduleRoutes = MODULE_ROUTES.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: parseLastUpdated(MODULE_LAST_UPDATED[path], today),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const clusterLastModified = parseLastUpdated(CLUSTER_LAST_UPDATED, today);

  // Add localized homepage routes only if they resolve to a real page (not a 404/redirect).
  // Currently /es and /en redirect to /, so we omit them to avoid "soft 404" in Search Console.
  const localizedHomepages: Array<{ url: string; lastModified: Date; changeFrequency: "weekly"; priority: number }> = [];

  const modalityPages = CLUSTER_LOCALES.flatMap((locale) =>
    MODALITY_KEYS.flatMap((modality) => {
      const modalitySlug = MODALITIES[modality][locale];
      if (!modalitySlug) return [];
      return {
        url: `${baseUrl}/${locale}/${modalitySlug}`,
        lastModified: clusterLastModified,
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
          lastModified: clusterLastModified,
          changeFrequency: "weekly" as const,
          priority: country === "espana" || country === "mexico" ? 0.8 : 0.7,
        };
      })
    )
  );

  // Contrato explícito: solo academias públicas `active` o `trial` y sin el
  // flag legacy `isSuspended` entran al sitemap. Si la consulta falla, se
  // omiten todas las academias; no inventamos URLs potencialmente terminales.
  let academyPages: MetadataRoute.Sitemap = [];
  try {
    const academyRows = await db
      .select({
        id: academies.id,
        status: academies.status,
        isPublic: academies.isPublic,
        isSuspended: academies.isSuspended,
        lastModified: academies.statusUpdatedAt,
        createdAt: academies.createdAt,
      })
      .from(academies)
      .limit(10000)
      .where(
        and(
          eq(academies.isPublic, true),
          eq(academies.isSuspended, false),
          inArray(academies.status, INDEXABLE_ACADEMY_STATUS_VALUES)
        )
      );

    academyPages = academyRows
      .filter(isAcademyIndexable)
      .map((academy) => ({
        url: `${baseUrl}/academias/${academy.id}`,
        lastModified: academy.lastModified ?? academy.createdAt ?? new Date(),
        changeFrequency: "daily" as const,
        priority: 0.7,
      }));
  } catch {
    academyPages = [];
  }

  // Nota: se retiraron las variantes con query param (?category=) de marketplace/empleo:
  // un sitemap no debe listar URLs de filtro, generan contenido duplicado sin valor de indexación propio.

  return [
    ...routes,
    ...moduleRoutes,
    ...localizedHomepages,
    ...modalityPages,
    ...clusterPages,
    ...academyPages,
    // Páginas de comparativa: prioridad 0.7 para que Google las rastree
    // pronto sin canibalizar la home o pricing.
    ...comparisonSlugs.map((slug) => ({
      url: `${baseUrl}/comparativas/${slug}`,
      lastModified: parseLastUpdated(COMPARISON_LAST_UPDATED, today),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Posts del blog
    ...blogPosts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: parseLastUpdated(
        post.dateModified ?? BLOG_POST_LAST_UPDATED,
        today,
      ),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // AI/GEO resources. Prioridad baja para no canibalizar paginas
    // comerciales; los crawlers AI las encuentran igual sin alta prioridad.
    {
      url: `${baseUrl}/llms.txt`,
      lastModified: parseLastUpdated("2026-09-18", today),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/llms-full.txt`,
      lastModified: parseLastUpdated("2026-09-18", today),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
  ];
}
