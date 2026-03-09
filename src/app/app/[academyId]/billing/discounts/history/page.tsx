import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { DiscountHistory } from "@/components/billing/DiscountHistory";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function DiscountHistoryPage({ params }: PageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { academyId } = params;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Negocio", href: `/app/${academyId}/billing` },
          { label: "Descuentos", href: `/app/${academyId}/billing/discounts` },
          { label: "Historial" },
        ]}
      />
      <DiscountHistory academyId={academyId} />
    </div>
  );
}
