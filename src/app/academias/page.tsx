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

  const hasFilters = params.search || params.type || params.country || params.region || params.city;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-zaltyko-primary-light/30 via-zaltyko-primary-light/20 to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-zaltyko-primary mb-6">
              <span>Directorio público</span>
            </div>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl lg:text-6xl">
              Encuentra tu academia
            </h1>
            <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
              Descubre academias de gimnasia cerca de ti y conecta con la comunidad
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-2xl font-bold text-zaltyko-primary">{result.total}</span>
                <span>{result.total === 1 ? "academia disponible" : "academias disponibles"}</span>
              </div>
              {hasFilters && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-zaltyko-primary" />
                  <span>Filtros activos</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <AcademiesFilters />

      {/* Listado */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {result.items.length > 0 ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {result.items.length} {result.items.length === 1 ? "academia" : "academias"}
                {result.totalPages > 1 && ` · Página ${page} de ${result.totalPages}`}
              </p>
            </div>
            <AcademiesGrid academies={result.items} />
          </>
        ) : (
          <AcademiesGrid academies={result.items} />
        )}

        {/* Paginación mejorada */}
        {result.totalPages > 1 && (
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              {result.hasPreviousPage && (
                <a
                  href={`/academias?${new URLSearchParams({
                    ...params,
                    page: String(page - 1),
                  }).toString()}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:border-zaltyko-primary"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Anterior
                </a>
              )}
            </div>

            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, result.totalPages) }, (_, i) => {
                let pageNum: number;
                if (result.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= result.totalPages - 2) {
                  pageNum = result.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                if (pageNum < 1 || pageNum > result.totalPages) return null;

                return (
                  <a
                    key={pageNum}
                    href={`/academias?${new URLSearchParams({
                      ...params,
                      page: String(pageNum),
                    }).toString()}`}
                    className={`min-w-[40px] rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      pageNum === page
                        ? "border-zaltyko-primary bg-zaltyko-primary/10 text-zaltyko-primary"
                        : "border-border bg-card text-foreground hover:bg-muted hover:border-zaltyko-primary/50"
                    }`}
                  >
                    {pageNum}
                  </a>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {result.hasNextPage && (
                <a
                  href={`/academias?${new URLSearchParams({
                    ...params,
                    page: String(page + 1),
                  }).toString()}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:border-zaltyko-primary"
                >
                  Siguiente
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

