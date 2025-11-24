import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

interface PageProps {
  params: {
    academyId: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  const name = academy?.name ?? "Academia";

  return {
    title: `${name} · Dashboard`,
    description: `Panel de control para la academia ${name}.`,
  };
}

export default async function AcademyDashboard({ params }: PageProps) {
  const { academyId } = params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId))
    )
    .limit(1);

  const allowedProfileRoles = new Set(["owner", "admin", "super_admin"]);
  const allowedMembershipRoles = new Set(["owner"]);

  const hasAccess =
    (profile && allowedProfileRoles.has(profile.role)) ||
    (membership && allowedMembershipRoles.has(membership.role));

  if (!hasAccess) {
    redirect(`/app/${academyId}/athletes`);
  }

  const { academy, data } = await getDashboardData(academyId);

  return (
    <DashboardPage
      academyId={academyId}
      tenantId={academy.tenantId}
      academyName={academy.name}
      academyType={academy.academyType}
      academyCountry={academy.country}
      profileName={profile?.name ?? user.email ?? null}
      initialData={data}
    />
  );
}
