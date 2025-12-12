import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  athletes,
  guardianAthletes,
  memberships,
  profiles,
} from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { createClient } from "@/lib/supabase/server";
import ImportExportPanel from "@/components/athletes/ImportExportPanel";

interface AthletesPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function calculateAge(dob: Date | null): number | null {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function AthletesPage({ searchParams }: AthletesPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  if (!profile.tenantId && profile.role !== "super_admin") {
    redirect("/dashboard");
  }

  const tenantId = profile.tenantId;

  const searchTerm =
    typeof searchParams.q === "string" && searchParams.q.trim().length > 0
      ? searchParams.q.trim()
      : undefined;
  const statusParam =
    typeof searchParams.status === "string" &&
    (athleteStatusOptions as readonly string[]).includes(searchParams.status)
      ? (searchParams.status as (typeof athleteStatusOptions)[number])
      : undefined;
  const levelParam =
    typeof searchParams.level === "string" && searchParams.level.trim().length > 0
      ? searchParams.level.trim()
      : undefined;
  const academyParam =
    typeof searchParams.academy === "string" && searchParams.academy !== ""
      ? searchParams.academy
      : undefined;
  const minAgeParam =
    typeof searchParams.minAge === "string" && searchParams.minAge !== ""
      ? Number(searchParams.minAge)
      : undefined;
  const maxAgeParam =
    typeof searchParams.maxAge === "string" && searchParams.maxAge !== ""
      ? Number(searchParams.maxAge)
      : undefined;

  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, user.id))
    .groupBy(academies.id, academies.name)
    .orderBy(asc(academies.name));

  const academyIdsAllowed = userAcademies.map((academy) => academy.id);

  if (academyParam && tenantId && !academyIdsAllowed.includes(academyParam)) {
    redirect("/dashboard/athletes");
  }

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianCount = sql<number>`count(distinct ${guardianAthletes.id})`;

  const conditions = [
    tenantId ? eq(athletes.tenantId, tenantId) : undefined,
    academyParam ? eq(athletes.academyId, academyParam) : undefined,
    statusParam ? eq(athletes.status, statusParam) : undefined,
    levelParam ? eq(athletes.level, levelParam) : undefined,
    searchTerm ? ilike(athletes.name, `%${searchTerm}%`) : undefined,
    typeof minAgeParam === "number"
      ? sql`(${ageExpr}) IS NULL OR (${ageExpr}) >= ${minAgeParam}`
      : undefined,
    typeof maxAgeParam === "number"
      ? sql`(${ageExpr}) IS NULL OR (${ageExpr}) <= ${maxAgeParam}`
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof sql>>;

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of conditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const athleteRows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      academyName: academies.name,
      academyId: athletes.academyId,
      age: ageExpr,
      guardianCount,
    })
    .from(athletes)
    .leftJoin(academies, eq(athletes.academyId, academies.id))
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause)
    .groupBy(athletes.id, academies.name)
    .orderBy(asc(athletes.name))
    .limit(200);

  const levels = await db
    .selectDistinct({ level: athletes.level })
    .from(athletes)
    .where(tenantId ? eq(athletes.tenantId, tenantId) : undefined)
    .orderBy(asc(athletes.level));

  const list = athleteRows.map((row) => ({
    ...row,
    age: row.age ?? calculateAge(row.dob ? new Date(row.dob) : null),
  }));

  return (
    <div className="space-y-8 p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Atletas</h1>
          <p className="text-muted-foreground">
            Gestiona atletas por nivel, estado y familia. Filtra la vista para detectar riesgos o
            planificar evaluaciones.
          </p>
          <form className="flex flex-wrap gap-3" method="get">
            <input
              type="search"
              name="q"
              placeholder="Buscar por nombre"
              defaultValue={searchTerm ?? ""}
              className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <select
              name="status"
              defaultValue={statusParam ?? ""}
              className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Estado</option>
              {athleteStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              name="level"
              defaultValue={levelParam ?? ""}
              className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Nivel</option>
              {levels
                .map((entry) => entry.level)
                .filter((level): level is string => Boolean(level))
                .map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
            </select>
            <select
              name="academy"
              defaultValue={academyParam ?? ""}
              className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Academia</option>
              {userAcademies.map((academy) => (
                <option key={academy.id} value={academy.id}>
                  {academy.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="minAge"
              min={0}
              placeholder="Edad mínima"
              defaultValue={minAgeParam ?? ""}
              className="w-[110px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <input
              type="number"
              name="maxAge"
              min={0}
              placeholder="Edad máxima"
              defaultValue={maxAgeParam ?? ""}
              className="w-[110px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <button
              type="submit"
              className="rounded-md bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:from-emerald-300 hover:to-lime-200"
            >
              Filtrar
            </button>
          </form>
        </div>
        <ImportExportPanel tenantId={tenantId ?? undefined} />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Nivel</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Edad</th>
              <th className="px-4 py-3 font-medium">Academia</th>
              <th className="px-4 py-3 font-medium text-right">Familia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background text-foreground">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No se encontraron atletas con los filtros actuales.
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/athletes/${row.id}`}
                      className="font-medium text-emerald-500 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.level ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.age ?? "—"}</td>
                  <td className="px-4 py-3">{row.academyName ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.guardianCount ?? 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


