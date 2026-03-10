import { Metadata } from "next";
import { JobCard } from "@/components/empleo/JobCard";
import { AdBanner } from "@/components/advertising/AdBanner";

export const metadata: Metadata = {
  title: "Bolsa de Empleo | Zaltyko",
  description: "Encuentra trabajo en academias de gimnasia",
};

async function getJobs(searchParams: { category?: string; jobType?: string; search?: string; page?: string }) {
  const params = new URLSearchParams();
  if (searchParams.category) params.set("category", searchParams.category);
  if (searchParams.jobType) params.set("jobType", searchParams.jobType);
  if (searchParams.search) params.set("search", searchParams.search);
  if (searchParams.page) params.set("page", searchParams.page);

  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/empleo?${params}`, {
    cache: "no-store",
  });
  return res.json();
}

async function getAds(zone: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/advertising/zones/${zone}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function EmpleoPage({
  searchParams,
}: {
  searchParams: { category?: string; jobType?: string; search?: string; page?: string };
}) {
  const { items: jobs, total } = await getJobs(searchParams);
  const { ads: topAds } = await getAds("empleo_top");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Bolsa de Empleo</h1>

      <AdBanner ads={topAds} position="top" />

      <div className="flex gap-8 mt-6">
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
