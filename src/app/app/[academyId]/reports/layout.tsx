import { FeatureUnavailableState } from "@/components/product/FeatureUnavailableState";
import { isFeatureEnabled } from "@/lib/product/features";

interface ReportsLayoutProps {
  params: Promise<{
    academyId: string;
  }>;
  children: React.ReactNode;
}

export default async function ReportsLayout({ params, children }: ReportsLayoutProps) {
  const { academyId } = await params;

  if (!isFeatureEnabled("reportsHub")) {
    return (
      <FeatureUnavailableState
        title="Centro de reportes"
        description="Los reportes multi-módulo y la programación automática todavía no están habilitados para los primeros clientes."
        backHref={`/app/${academyId}/dashboard`}
        backLabel="Volver al dashboard"
      />
    );
  }

  return children;
}
