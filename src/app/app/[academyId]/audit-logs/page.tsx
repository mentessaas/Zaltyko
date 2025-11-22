import { AuditLogsViewer } from "@/components/audit/AuditLogsViewer";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AuditLogsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <AuditLogsViewer academyId={academyId} />
    </div>
  );
}

