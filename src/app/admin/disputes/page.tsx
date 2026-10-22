import { notFound } from "next/navigation";

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/authz/super-admin";
import { DisputesDashboard } from "@/components/admin/DisputesDashboard";

export default async function AdminDisputesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await isSuperAdmin(user.id))) notFound();

  return <DisputesDashboard />;
}
