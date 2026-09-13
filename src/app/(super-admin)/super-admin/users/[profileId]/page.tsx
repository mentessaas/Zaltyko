import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getSuperAdminUserDetail } from "@/lib/superAdminUserService";
import { SuperAdminUserDetail } from "../../components/SuperAdminUserDetail";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SuperAdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ returnTo?: SearchParamValue }>;
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

  const { profileId } = await params;
  const { returnTo } = await searchParams;
  const safeReturnTo = firstSearchParam(returnTo);
  const backHref =
    safeReturnTo === "/super-admin/users" || safeReturnTo?.startsWith("/super-admin/users?")
      ? safeReturnTo
      : "/super-admin/users";
  const userData = await getSuperAdminUserDetail(profileId);
  if (!userData) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Volver a usuarios
        </Link>
      </div>
      <SuperAdminUserDetail
        initialUser={userData}
        userId={user?.id ?? devSession?.userId ?? ""}
        backHref={backHref}
      />
    </div>
  );
}
