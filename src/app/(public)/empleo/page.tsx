import { Metadata } from "next";
import { JobCard } from "@/components/empleo/JobCard";
import { JobFilters } from "@/components/empleo/JobFilters";
import { AdBanner } from "@/components/advertising/AdBanner";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
<<<<<<< HEAD
import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { jobCategoryEnum, jobTypeEnum } from "@/db/schema/enums";
import { eq, desc, like, and, count } from "drizzle-orm";
import { escapeLikeSearch } from "@/lib/helpers";
import { logger } from "@/lib/logger";
import { demoEmploymentListing } from "@/lib/public/demo-listings";
=======
>>>>>>> origin/main

export const metadata: Metadata = {
  title: "Bolsa de Empleo en Gimnasia | Zaltyko",
  description: "Encuentra trabajo en academias de gimnasia. Ofertas de empleo para entrenadores, auxiliares y más.",
  alternates: {
    canonical: `${getPublicSiteUrl()}/empleo`,
  },
  openGraph: {
    title: "Bolsa de Empleo en Gimnasia | Zaltyko",
    description: "Encuentra trabajo en academias de gimnasia",
    url: `${getPublicSiteUrl()}/empleo`,
    type: "website",
  },
};

<<<<<<< HEAD
type EmpleoSearch = { category?: string; jobType?: string; search?: string; page?: string };

// Consulta directa a BD (antes: self-fetch HTTP a /api/empleo, frágil en
// producción cuando NEXT_PUBLIC_APP_URL no coincide con el runtime).
async function getJobs(searchParams: EmpleoSearch): Promise<{ items: any[]; total: number }> {
  const page = Math.max(parseInt(searchParams.page || "1", 10) || 1, 1);
  const limit = 20;

  const conditions = [eq(empleoListings.status, "active")];

  if (searchParams.category) {
    const validCategory = jobCategoryEnum.enumValues.includes(
      searchParams.category as typeof jobCategoryEnum.enumValues[number]
    )
      ? (searchParams.category as typeof jobCategoryEnum.enumValues[number])
      : null;
    if (validCategory) conditions.push(eq(empleoListings.category, validCategory));
  }
  if (searchParams.jobType) {
    const validJobType = jobTypeEnum.enumValues.includes(
      searchParams.jobType as typeof jobTypeEnum.enumValues[number]
    )
      ? (searchParams.jobType as typeof jobTypeEnum.enumValues[number])
      : null;
    if (validJobType) conditions.push(eq(empleoListings.jobType, validJobType));
  }
  if (searchParams.search) {
    const escaped = escapeLikeSearch(searchParams.search);
    conditions.push(like(empleoListings.title, `%${escaped}%`));
  }

  try {
    const listings = await db
      .select()
      .from(empleoListings)
      .where(and(...conditions))
      .orderBy(desc(empleoListings.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [countResult] = await db
      .select({ count: count() })
      .from(empleoListings)
      .where(and(...conditions))
      .limit(1);

    // En no-producción, sin resultados se muestra el listing demo.
    if (listings.length === 0 && process.env.NODE_ENV !== "production") {
      return { items: [demoEmploymentListing], total: 1 };
    }
    return { items: listings, total: countResult?.count ?? 0 };
  } catch (error) {
    logger.error("Error listing employment listings on public page:", error);
    if (process.env.NODE_ENV !== "production") {
      return { items: [demoEmploymentListing], total: 1 };
    }
    return { items: [], total: 0 };
  }
=======
async function getJobs(searchParams: { category?: string; jobType?: string; search?: string; page?: string }) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set("category", searchParams.category);
  if (searchParams.jobType) params.set("jobType", searchParams.jobType);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  // Use relative URL for server-side fetches in Next.js
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/empleo?${params}`, {
    cache: "no-store",
  });
  const payload = await res.json();
  return payload?.data ?? payload;
>>>>>>> origin/main
}

async function getAds(zone: string) {
  // Use relative URL for server-side fetches in Next.js
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/advertising/zones/${zone}`, {
      cache: "no-store",
    });
    if (!res.ok) return { ads: [] };
    return res.json();
  } catch {
    return { ads: [] };
  }
}

export default async function EmpleoPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; jobType?: string; search?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const { items: jobs, total } = await getJobs(resolvedSearchParams);
  const { ads: topAds } = await getAds("empleo_top");

  return (
    <div className="container mx-auto px-4 py-8">
      <PublicPageHeader
        title="Bolsa de Empleo"
        publishHref="/empleo/nuevo"
        publishLabel="Publicar oferta"
        dashboardHref="/dashboard/empleo/mis-postulaciones"
        dashboardHrefTemplate="/dashboard/empleo/mis-postulaciones"
        dashboardLabel="Mis postulaciones"
      />

      <AdBanner ads={topAds} position="top" />

      <div className="flex gap-8 mt-6">
        <aside className="w-64 shrink-0">
          <JobFilters />
        </aside>
        <main className="flex-1 space-y-4">
          <p className="text-gray-600">{total || 0} ofertas disponibles</p>

          {jobs?.map((job: any) => (
            <JobCard key={job.id} job={job} />
          ))}

          {jobs?.length === 0 && (
            <p className="text-center text-gray-500 py-12">
              No hay ofertas de empleo disponibles
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
