import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getAllUsers } from "@/lib/superAdminService";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { SuperAdminUsersTable } from "../components/SuperAdminUsersTable";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage() {
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

  const users = await getAllUsers();

  return <SuperAdminUsersTable initialItems={users} />;
}

