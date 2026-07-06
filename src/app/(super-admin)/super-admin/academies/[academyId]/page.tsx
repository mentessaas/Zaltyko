import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getSuperAdminAcademyDetail } from "@/lib/superAdminService";
import { SuperAdminAcademyDetail } from "../../components/SuperAdminAcademyDetail";

export const dynamic = "force-dynamic";

export default async function SuperAdminAcademyDetailPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
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
    return <AcademyDetailState title="Sin permisos" description="Tu usuario no tiene permisos de super-admin." />;
  }

  const { academyId } = await params;

  let academy;
  try {
    academy = await getSuperAdminAcademyDetail(academyId);
  } catch (error) {
    console.error("Failed to load super-admin academy detail", error);
    return (
      <AcademyDetailState
        title="Error interno"
        description="No se pudo cargar el detalle de la academia. Revisa los logs del servidor antes de operar esta cuenta."
      />
    );
  }

  if (!academy) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/super-admin/academies"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Volver a academias
        </Link>
      </div>
      <SuperAdminAcademyDetail initialAcademy={academy} userId={user.id} />
    </div>
  );
}

function AcademyDetailState({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/academies"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Volver a academias
      </Link>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="font-display text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/70">{description}</p>
      </section>
    </div>
  );
}
