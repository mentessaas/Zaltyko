import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getGlobalStats } from "@/lib/superAdminService";
import { SuperAdminDashboard } from "../components/SuperAdminDashboard";

export const dynamic = "force-dynamic";

export default async function SuperAdminDashboardPage() {
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

  const metrics = await getGlobalStats();

  return <SuperAdminDashboard initialMetrics={metrics} />;
}

