import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getAcademiesPage, getAcademyFilterOptions } from "@/lib/superAdminService";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { SuperAdminAcademiesTable } from "../components/SuperAdminAcademiesTable";
import { academyStatusValues, type AcademyStatus } from "@/db/schema/academies";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;
type AcademyType = (typeof ACADEMY_TYPES)[number];

type PageProps = {
  searchParams: Promise<{
    plan?: string;
    type?: string;
    country?: string;
    status?: string;
    page?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SuperAdminAcademiesPage({ searchParams }: PageProps) {
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

  const params = await searchParams;
  const plan = params.plan?.trim().slice(0, 80) || undefined;
  const type = ACADEMY_TYPES.includes(params.type as AcademyType)
    ? (params.type as AcademyType)
    : undefined;
  const country = params.country?.trim().slice(0, 120) || undefined;
  const status = academyStatusValues.includes(params.status as AcademyStatus)
    ? (params.status as AcademyStatus)
    : undefined;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [{ items, total, page }, filterOptions] = await Promise.all([
    getAcademiesPage({
      page: requestedPage,
      pageSize: 50,
      plan,
      type,
      country,
      status,
    }),
    getAcademyFilterOptions(),
  ]);

  return (
    <SuperAdminAcademiesTable
      initialItems={items}
      initialTotal={total}
      initialPage={page}
      initialFilters={{ plan, type, country, status }}
      initialFilterOptions={filterOptions}
      initialUserId={user?.id ?? devSession?.userId ?? null}
    />
  );
}

