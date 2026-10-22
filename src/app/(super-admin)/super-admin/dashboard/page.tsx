import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getGlobalStats, getRecentEvents } from "@/lib/superAdminService";
import { SuperAdminDashboard } from "../components/SuperAdminDashboard";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";

export const dynamic = "force-dynamic";

export default async function SuperAdminDashboardPage() {
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

  const [metrics, recentEvents] = await Promise.all([
    getGlobalStats(),
    getRecentEvents(10),
  ]);

  return <SuperAdminDashboard initialMetrics={metrics} initialEvents={recentEvents} />;
}
