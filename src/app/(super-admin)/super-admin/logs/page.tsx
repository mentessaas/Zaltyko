import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getSuperAdminLogsPage } from "@/lib/super-admin";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { SuperAdminLogsTable } from "../components/SuperAdminLogsTable";

export const dynamic = "force-dynamic";

export default async function SuperAdminLogsPage() {
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

  const logs = await getSuperAdminLogsPage({ page: 1, pageSize: 50 });

  return (
    <SuperAdminLogsTable
      initialLogs={logs.items}
      initialTotal={logs.total}
      initialPage={logs.page}
      initialTotalPages={logs.totalPages}
      initialUserId={user?.id ?? devSession?.userId ?? null}
    />
  );
}

