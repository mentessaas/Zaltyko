import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getAllUsers } from "@/lib/superAdminService";
import { SuperAdminUsersTable } from "../components/SuperAdminUsersTable";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage() {
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

  const users = await getAllUsers();

  return <SuperAdminUsersTable initialItems={users} />;
}

