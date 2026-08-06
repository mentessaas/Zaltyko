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
    redirect(profile.role === "coach" ? `/app/${academyId}/coach` : `/app/${academyId}/dashboard`);
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
