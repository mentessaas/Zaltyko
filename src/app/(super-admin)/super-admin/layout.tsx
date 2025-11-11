import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { SuperAdminSidebar } from "./components/SuperAdminSidebar";
import { SuperAdminHeader } from "./components/SuperAdminHeader";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
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
    <div className="min-h-screen bg-[#0f172a]">
      <div className="flex min-h-screen">
        <SuperAdminSidebar />
        <div className="flex flex-1 flex-col bg-slate-950/40">
          <SuperAdminHeader userName={profile.name ?? user.email ?? null} userEmail={user.email} />
          <main className="flex-1 overflow-y-auto bg-slate-950/60 px-6 py-8 text-slate-100">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

