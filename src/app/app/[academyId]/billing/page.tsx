import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BillingPanel } from "@/components/billing/BillingPanel";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AcademyBillingPage({ params }: PageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Academia</p>
        <h1 className="text-3xl font-semibold">Facturación & planes</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tus suscripciones, facturas y acceso al portal de Stripe para esta academia.
        </p>
      </header>

      <BillingPanel academyId={params.academyId} userId={user.id} />
    </div>
  );
}


