import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function SuperAdminBillingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile || profile.role !== "super_admin") {
    redirect("/app");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 font-sans text-sm text-white/70">
      <h1 className="font-display text-2xl font-semibold text-white">Facturación global</h1>
      <p className="mt-3 font-sans">
        Aquí centralizaremos reportes financieros, exportaciones y sincronización avanzada con
        Stripe. La implementación está planificada para el siguiente sprint.
      </p>
    </div>
  );
}

