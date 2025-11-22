import { ProgressReport } from "@/components/reports/ProgressReport";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function ProgressReportsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <ProgressReport academyId={academyId} />
    </div>
  );
}

