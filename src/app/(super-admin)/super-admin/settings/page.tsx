import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function SuperAdminSettingsPage() {
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
      <h1 className="text-2xl font-semibold text-white">Configuración global</h1>
      <p className="mt-3">
        Esta sección permitirá actualizar textos de onboarding, límites de planes y parámetros
        generales del SaaS. De momento se muestra como adelanto visual.
      </p>
    </div>
  );
}

