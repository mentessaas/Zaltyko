import { DiscountManager } from "@/components/billing/DiscountManager";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function DiscountsPage({ params }: PageProps) {
  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <DiscountManager academyId={academyId} />
    </div>
  );
}

