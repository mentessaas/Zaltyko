import { BillingItemsManager } from "@/components/billing/BillingItemsManager";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function BillingItemsPage({ params }: PageProps) {
  const { academyId } = await params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Negocio", href: `/app/${academyId}/billing` },
          { label: "Conceptos de cobro" },
        ]}
      />
      <BillingItemsManager academyId={academyId} />
    </div>
  );
}
