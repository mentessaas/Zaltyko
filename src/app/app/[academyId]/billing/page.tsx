import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CreditCard } from "lucide-react";

import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { BillingPanel } from "@/components/billing/BillingPanel";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { PageHeader } from "@/components/ui/page-header";
import { AccessDenied } from "@/components/ui/access-denied";

/**
 * AcademyBillingPage - Vista principal de planes y cobros
 * 
 * Permite gestionar la suscripción actual, ver límites de atletas/clases, y acceder
 * al portal de Stripe para actualizar planes o ver recibos de suscripción.
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

  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.academyId, academyId), eq(memberships.userId, user.id)))
    .limit(1);

  const canSeeBilling =
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    profile.role === "owner" ||
    membership?.role === "owner";

  if (!canSeeBilling) {
    // PR 12 (Operate P2): antes redirigía silenciosamente al home del rol.
    // Ahora muestra AccessDenied para que el coach/parent/athlete sepa
    // por qué no ve la sección, con CTA a su home real.
    const isCoach = profile.role === "coach";
    const homeHref = isCoach ? `/app/${academyId}/coach` : `/app/${academyId}/dashboard`;
    const roleLabel = isCoach ? "coach" : profile.role;
    return (
      <div className="mx-auto max-w-[1500px] space-y-6">
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: `/app/${academyId}/dashboard` },
            { label: "Planes y cobros" },
          ]}
          title="Planes y cobros"
          icon={<CreditCard className="h-5 w-5" strokeWidth={1.8} />}
        />
        <AccessDenied
          variant="billing"
          title="Esta sección es solo para administradores"
          description={`Tu rol actual (${roleLabel}) no tiene acceso a planes y cobros. Solo el owner o administradores de la academia pueden gestionarlos.`}
          ctaLabel={isCoach ? "Volver a mi panel de coach" : "Volver a mi dashboard"}
          ctaHref={homeHref}
        />
      </div>
    );
  }

  const sportConfigs = await getAcademySportConfigOptions(academyId);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Planes y cobros" },
        ]}
        title="Planes y cobros"
        description="Gestiona tu plan SaaS, los recibos de suscripción y el control interno de cuotas de la academia."
        icon={<CreditCard className="h-5 w-5" strokeWidth={1.8} />}
      />

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
