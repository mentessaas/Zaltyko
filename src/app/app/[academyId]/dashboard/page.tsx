import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";

import { DashboardPageSkeleton } from "@/components/dashboard/DashboardPage";
import { getDashboardData } from "@/lib/dashboard";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { getLegacyOwnerAcademyAccess } from "@/lib/auth/legacy-academy-access";
import { createClient } from "@/lib/supabase/server";

const DashboardPage = nextDynamic(
  () =>
    import("@/components/dashboard/DashboardPage").then((module) => ({
      default: module.DashboardPage,
    })),
  { loading: () => <DashboardPageSkeleton /> }
);

interface PageProps {
  params: Promise<{ academyId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Dashboard · Zaltyko",
    description: "Panel de gestión de la academia.",
  };
}

export default async function AcademyDashboard({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const devSession =
    process.env.NODE_ENV === "production"
      ? null
      : await getDevSessionFromCookieStore(cookieStore);
  const effectiveUserId = user?.id ?? devSession?.userId ?? null;

  if (!effectiveUserId) {
    redirect(`/auth/login?next=/app/${academyId}/dashboard`);
  }

  const access = await getLegacyOwnerAcademyAccess(effectiveUserId, academyId);
  if (!access?.allowed || !access.academy) notFound();

  const dashboardData = await getDashboardData(academyId);

  return (
    <DashboardPage
      academyId={academyId}
      tenantId={access.academy.tenantId}
      academyName={dashboardData.academy.name}
      academyType={dashboardData.academy.academyType}
      academyCountry={dashboardData.academy.country}
      profileName={access.profile.name ?? user?.email ?? null}
      initialData={dashboardData.data}
    />
  );
}
