import { ScholarshipManager } from "@/components/billing/ScholarshipManager";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function ScholarshipsPage({ params }: PageProps) {
  const { academyId } = await params;
  const sportConfigs = await getAcademySportConfigOptions(academyId);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Negocio", href: `/app/${academyId}/billing` },
          { label: "Becas" },
        ]}
      />
      <ScholarshipManager
        academyId={academyId}
        sportConfigs={sportConfigs.map((config) => ({
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
