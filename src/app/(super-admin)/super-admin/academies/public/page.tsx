import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { PublicAcademiesTable } from "@/components/admin/PublicAcademiesTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams: Promise<{
    visibility?: SearchParamValue;
    search?: SearchParamValue;
    page?: SearchParamValue;
  }>;
};

function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

export default async function SuperAdminPublicAcademiesPage({ searchParams }: PageProps) {
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
  const visibilityParam = firstSearchParam(params.visibility);
  const visibility =
    visibilityParam === "public" || visibilityParam === "private"
      ? visibilityParam
      : "all";
  const search = firstSearchParam(params.search)?.trim().slice(0, 160) ?? "";
  const escapedSearch = search.replace(/[\\%_]/g, "\\$&");
  const searchCondition = escapedSearch
    ? or(
        ilike(academies.name, `%${escapedSearch}%`),
        ilike(academies.country, `%${escapedSearch}%`),
        ilike(academies.region, `%${escapedSearch}%`),
        ilike(academies.city, `%${escapedSearch}%`)
      )
    : undefined;
  const conditions = [
    visibility === "public"
      ? eq(academies.isPublic, true)
      : visibility === "private"
        ? eq(academies.isPublic, false)
        : undefined,
    searchCondition,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [totalRow, visibilityRows] = await Promise.all([
    db
      .select({ total: count(academies.id) })
      .from(academies)
      .where(where),
    db
      .select({ isPublic: academies.isPublic, total: count(academies.id) })
      .from(academies)
      .where(searchCondition)
      .groupBy(academies.isPublic),
  ]);
  const total = Number(totalRow[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(parsePage(firstSearchParam(params.page)), totalPages);

  const items = await db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      region: academies.region,
      city: academies.city,
      publicDescription: academies.publicDescription,
      logoUrl: academies.logoUrl,
      website: academies.website,
      contactEmail: academies.contactEmail,
      contactPhone: academies.contactPhone,
      address: academies.address,
      socialInstagram: academies.socialInstagram,
      socialFacebook: academies.socialFacebook,
      socialTwitter: academies.socialTwitter,
      socialYoutube: academies.socialYoutube,
      isPublic: academies.isPublic,
    })
    .from(academies)
    .where(where)
    .orderBy(asc(academies.name), asc(academies.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const visibilityCounts = visibilityRows.reduce(
    (result, row) => {
      if (row.isPublic) result.public += Number(row.total ?? 0);
      else result.private += Number(row.total ?? 0);
      return result;
    },
    { public: 0, private: 0 }
  );

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Gestión de Academias Públicas</h1>
        <p className="mt-2 text-white/70">
          Controla el directorio público con búsqueda, visibilidad y cambios auditables.
        </p>
      </div>

      <PublicAcademiesTable
        academies={items.map((item) => ({
          ...item,
          academyType: String(item.academyType),
        })) as any}
        initialFilter={visibility}
        initialSearch={search}
        total={total}
        page={page}
        totalPages={totalPages}
        visibilityCounts={visibilityCounts}
      />
    </div>
  );
}
