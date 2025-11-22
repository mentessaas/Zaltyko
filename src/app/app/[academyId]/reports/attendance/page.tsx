import { AttendanceReport } from "@/components/reports/AttendanceReport";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AttendanceReportsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <AttendanceReport academyId={academyId} />
    </div>
  );
}

