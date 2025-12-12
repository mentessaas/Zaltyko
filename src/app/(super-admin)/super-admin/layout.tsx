import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { SuperAdminSidebar } from "./components/SuperAdminSidebar";
import { GlobalTopNav } from "@/components/navigation/GlobalTopNav";
import { ToastProvider } from "@/components/ui/toast-provider";
import { AutoBreadcrumb } from "@/components/navigation/AutoBreadcrumb";

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
    <ToastProvider>
      <div className="min-h-screen overflow-x-hidden bg-zaltyko-primary-dark">
        <GlobalTopNav
          userRole={profile.role}
          userName={profile.name}
          userEmail={user.email ?? null}
          profileId={profile.id}
        />
        <div className="flex min-h-[calc(100vh-4rem)] overflow-hidden">
          <SuperAdminSidebar />
          <div className="flex min-w-0 flex-1 flex-col bg-zaltyko-primary-dark/40">
            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zaltyko-primary-dark/60 px-4 py-6 text-white sm:px-6 sm:py-8">
              <div className="mx-auto w-full max-w-6xl">
                <AutoBreadcrumb />
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

