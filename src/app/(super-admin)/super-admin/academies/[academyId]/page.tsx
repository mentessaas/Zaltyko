import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getSuperAdminAcademyDetail } from "@/lib/super-admin";
import { SuperAdminAcademyDetail } from "../../components/SuperAdminAcademyDetail";

export const dynamic = "force-dynamic";

export default async function SuperAdminAcademyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !devSession) {
    redirect("/auth/login");
  }

  const profile = user ? await getCurrentProfile(user.id) : null;
  const effectiveProfile = profile ?? (devSession ? { role: "super_admin" } : null);

  if (!effectiveProfile || effectiveProfile.role !== "super_admin") {
    redirect("/app");
  }

  const { academyId } = await params;
  const { returnTo } = await searchParams;
  const backHref =
    returnTo === "/super-admin/academies" || returnTo?.startsWith("/super-admin/academies?")
      ? returnTo
      : "/super-admin/academies";

  const academy = await getSuperAdminAcademyDetail(academyId);

  if (!academy) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Volver a academias
        </Link>
      </div>
      <SuperAdminAcademyDetail
        initialAcademy={academy}
        userId={user?.id ?? devSession?.userId ?? ""}
        backHref={backHref}
      />
    </div>
  );
}

