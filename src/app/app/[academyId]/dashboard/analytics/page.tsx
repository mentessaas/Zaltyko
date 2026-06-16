import { AnalyticsWidgets } from "@/components/analytics/AnalyticsWidgets";
import { FeatureUnavailableState } from "@/components/product/FeatureUnavailableState";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { isFeatureEnabled } from "@/lib/product/features";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
  searchParams: Promise<{
    dateRange?: string;
    classId?: string;
    coachId?: string;
  }>;
}

export default async function AnalyticsPage({ params, searchParams }: PageProps) {
  const { academyId } = await params;
  await searchParams;

  if (!isFeatureEnabled("advancedAnalytics")) {
    return (
      <FeatureUnavailableState
        title="Analítica avanzada"
        description="Esta área todavía no forma parte del primer release para clientes. Cuando esté lista, aparecerá aquí con datos verificados y exportación estable."
        backHref={`/app/${academyId}/dashboard`}
        backLabel="Volver al dashboard"
      />
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Analítica Avanzada" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold">Analytics Avanzado</h1>
        <p className="text-muted-foreground mt-1">
          Métricas detalladas, gráficos y análisis de rendimiento
        </p>
      </div>

      <AnalyticsWidgets academyId={academyId} />
    </div>
  );
}
