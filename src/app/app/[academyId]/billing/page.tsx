import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BillingPanel } from "@/components/billing/BillingPanel";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";

/**
 * AcademyBillingPage - Vista principal de facturación y planes
 * 
 * Permite gestionar la suscripción actual, ver límites de atletas/clases, y acceder
 * al portal de Stripe para actualizar planes o ver facturas.
 */
interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function AcademyBillingPage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const sportConfigs = await getAcademySportConfigOptions(academyId);

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <header className="zaltyko-motion-lines rounded-2xl border border-zaltyko-mist/70 bg-white px-5 py-5 shadow-soft lg:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-zaltyko-teal">
          Ingresos y planes
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-zaltyko-navy">Facturación</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zaltyko-text-secondary">
          Gestiona tus suscripciones, facturas y acceso al portal de Stripe.
        </p>
      </header>

      <BillingPanel
        academyId={academyId}
        userId={user.id}
        sportConfigs={sportConfigs.map((config) => ({
          id: config.id,
          name: config.name,
          disciplineName: config.disciplineName,
          branchName: config.branchName,
          terminology: config.terminology,
        }))}
      />
    </div>
  );
}
