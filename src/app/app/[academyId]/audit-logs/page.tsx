import { AuditLogsViewer } from "@/components/audit/AuditLogsViewer";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AuditLogsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Administración" },
          { label: "Logs de Auditoría" },
        ]}
      />
      <AuditLogsViewer academyId={academyId} />
    </div>
  );
}

