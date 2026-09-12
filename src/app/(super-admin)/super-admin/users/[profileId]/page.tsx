import { cookies, headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { SuperAdminUserDetail } from "../../components/SuperAdminUserDetail";

export const dynamic = "force-dynamic";

export default async function SuperAdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
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

  const { profileId } = await params;
  const { returnTo } = await searchParams;
  const backHref =
    returnTo === "/super-admin/users" || returnTo?.startsWith("/super-admin/users?")
      ? returnTo
      : "/super-admin/users";
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const appOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const response = await fetch(
    `${appOrigin}/api/super-admin/users/${profileId}`,
    {
      headers: {
        cookie: cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; "),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      notFound();
    }
    throw new Error("Failed to fetch user details");
  }

  const { data: userData } = await response.json();

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

