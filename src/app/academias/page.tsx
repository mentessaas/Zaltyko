import type { Metadata } from "next";
import { AcademiesFilters } from "@/components/public/AcademiesFilters";
import { AcademiesGrid } from "@/components/public/AcademiesGrid";
import { getPublicAcademies } from "@/app/actions/public/get-public-academies";

export const metadata: Metadata = {
  title: "Directorio de Academias | Zaltyko",
  description: "Encuentra academias de gimnasia cerca de ti. Directorio público de academias de gimnasia artística, rítmica, trampolín y más.",
};

interface AcademiesPageProps {
  searchParams: Promise<{
    search?: string;
    type?: string;
    country?: string;
    region?: string;
    city?: string;
    page?: string;
  }>;
}

export default async function AcademiesPage({ searchParams }: AcademiesPageProps) {
  const params = await searchParams;
  
  const page = Number(params.page) || 1;
  const result = await getPublicAcademies({
    search: params.search,
    type: params.type as any,
    country: params.country,
    region: params.region,
    city: params.city,
    page,
    limit: 50,
  });

  return (
    <div className="min-h-screen bg-zaltyko-primary-dark">
      {/* Hero Section */}
      <section className="border-b border-white/10 bg-gradient-to-br from-zaltyko-primary-dark via-zaltyko-primary to-zaltyko-primary-dark py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
              Directorio de Academias
            </h1>
            <p className="mt-4 text-lg text-white/80">
              Encuentra academias de gimnasia cerca de ti
            </p>
            <p className="mt-2 text-sm text-white/60">
              {result.total} {result.total === 1 ? "academia encontrada" : "academias encontradas"}
            </p>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <AcademiesFilters />

      {/* Listado */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <AcademiesGrid academies={result.items} />

        {/* Paginación */}
        {result.totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-4">
            {result.hasPreviousPage && (
              <a
                href={`/academias?${new URLSearchParams({
                  ...params,
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Anterior
              </a>
            )}

            <span className="text-sm text-white/60">
              Página {page} de {result.totalPages}
            </span>

            {result.hasNextPage && (
              <a
                href={`/academias?${new URLSearchParams({
                  ...params,
                  page: String(page + 1),
                }).toString()}`}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Siguiente
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

