import { ReceiptViewer } from "@/components/billing/ReceiptViewer";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function ReceiptsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <ReceiptViewer academyId={academyId} />
    </div>
  );
}

