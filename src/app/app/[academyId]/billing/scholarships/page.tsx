import { ScholarshipManager } from "@/components/billing/ScholarshipManager";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function ScholarshipsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <ScholarshipManager academyId={academyId} />
    </div>
  );
}

