import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getUsersPage } from "@/lib/superAdminService";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { SuperAdminUsersTable } from "../components/SuperAdminUsersTable";

const USER_ROLES = ["owner", "admin", "coach", "athlete", "parent", "super_admin"] as const;
type UserRole = (typeof USER_ROLES)[number];

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams: Promise<{
    role?: SearchParamValue;
    status?: SearchParamValue;
    q?: SearchParamValue;
    page?: SearchParamValue;
  }>;
};

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage({ searchParams }: PageProps) {
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
  const roleParam = firstSearchParam(params.role);
  const roleFilter = USER_ROLES.includes(roleParam as UserRole)
    ? (roleParam as UserRole)
    : undefined;
  const statusParam = firstSearchParam(params.status);
  const statusFilter =
    statusParam === "active" || statusParam === "suspended"
      ? statusParam
      : undefined;
  const search = firstSearchParam(params.q)?.trim().slice(0, 160) ?? "";
  const requestedPage = Math.max(1, Number.parseInt(firstSearchParam(params.page) ?? "1", 10) || 1);
  const result = await getUsersPage({
    page: requestedPage,
    pageSize: 50,
    role: roleFilter,
    status: statusFilter,
    search: search || undefined,
  });

  return (
    <SuperAdminUsersTable
      initialItems={result.items}
      initialTotal={result.total}
      initialPage={result.page}
      initialFilters={{
        role: roleFilter,
        status: statusFilter,
        search: search || undefined,
      }}
      initialUserId={user?.id ?? devSession?.userId ?? null}
    />
  );
}

