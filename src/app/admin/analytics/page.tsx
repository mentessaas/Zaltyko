import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/authz/super-admin";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await isSuperAdmin(user.id))) notFound();
  return <AnalyticsDashboard />;
}
