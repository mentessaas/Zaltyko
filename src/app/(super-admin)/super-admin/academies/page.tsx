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

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams: Promise<{
    plan?: SearchParamValue;
    type?: SearchParamValue;
    country?: SearchParamValue;
    status?: SearchParamValue;
    page?: SearchParamValue;
  }>;
};

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

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
  const plan = firstSearchParam(params.plan)?.trim().slice(0, 80) || undefined;
  const typeParam = firstSearchParam(params.type);
  const type = ACADEMY_TYPES.includes(typeParam as AcademyType)
    ? (typeParam as AcademyType)
    : undefined;
  const country = firstSearchParam(params.country)?.trim().slice(0, 120) || undefined;
  const statusParam = firstSearchParam(params.status);
  const status = academyStatusValues.includes(statusParam as AcademyStatus)
    ? (statusParam as AcademyStatus)
    : undefined;
  const requestedPage = Math.max(1, Number.parseInt(firstSearchParam(params.page) ?? "1", 10) || 1);

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

