import { AdvancedMetrics } from "@/components/dashboard/AdvancedMetrics";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { academyId } = params;

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
          Métricas detalladas y análisis de rendimiento
        </p>
      </div>

      <AdvancedMetrics academyId={academyId} />
    </div>
  );
}

