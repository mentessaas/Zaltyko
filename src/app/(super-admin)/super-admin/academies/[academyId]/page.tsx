import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
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
    redirect("/app");
  }

  const { academyId } = await params;

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/super-admin/academies/${academyId}`,
    {
      headers: {
        "x-user-id": user.id,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      notFound();
    }
    throw new Error("Failed to fetch academy details");
  }

  const academy = await response.json();

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

