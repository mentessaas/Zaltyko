import { AttendanceReport } from "@/components/reports/AttendanceReport";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";
import { eq } from "drizzle-orm";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function AttendanceReportsPage({ params }: PageProps) {
  const { academyId } = await params;

  const [[academy], sportConfigs] = await Promise.all([
    db
      .select({ country: academies.country })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1),
    getAcademySportConfigOptions(academyId),
  ]);
  const terms = getTerminologyForSportConfig(sportConfigs);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Reportes", href: `/app/${academyId}/reports` },
          { label: terms.attendance },
        ]}
      />
      <AttendanceReport
        academyId={academyId}
        academyCountry={academy?.country ?? null}
        initialSportConfigs={sportConfigs.map((config) => ({
          id: config.id,
          name: config.name,
          disciplineName: config.disciplineName,
          branchName: config.branchName,
          terminology: config.terminology,
        }))}
      />
    </div>
  );
}
