import { FinancialReport } from "@/components/reports/FinancialReport";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { eq } from "drizzle-orm";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function FinancialReportsPage({ params }: PageProps) {
  const { academyId } = await params;

  const [[academy], sportConfigs] = await Promise.all([
    db
      .select({ country: academies.country })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1),
    getAcademySportConfigOptions(academyId),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Reportes", href: `/app/${academyId}/reports` },
          { label: "Financiero" },
        ]}
      />
      <FinancialReport
        academyId={academyId}
        academyCountry={academy?.country ?? null}
        sportConfigs={sportConfigs}
      />
    </div>
  );
}
