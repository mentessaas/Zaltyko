import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Plus, Users, UserCog, Calendar, Building2, ArrowUpDown, Eye, Pencil, X } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/shared/EmptyState";

type SortField = "name" | "level" | "status" | "age" | "academyName" | "guardianCount";
type SortDirection = "asc" | "desc";

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

  let tenantId = profile.tenantId;

  // If no tenantId, try to get from user's academies via memberships
  if (!tenantId) {
    try {
      const userAcademies = await db
        .select({
          tenantId: academies.tenantId,
        })
        .from(memberships)
        .innerJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, profile.id))
        .limit(1);

      if (userAcademies.length > 0) {
        tenantId = userAcademies[0].tenantId;
      }
    } catch (error) {
      console.error("Error getting tenant from academies:", error);
    }
  }

  // If still no tenantId, redirect unless user is super_admin
  if (!tenantId && profile.role !== "super_admin") {
    redirect("/dashboard");
  }

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

  // Calculate summary stats
  const agesWithValue = list.filter(a => a.age !== null).map(a => a.age as number);
  const avgAge = agesWithValue.length > 0
    ? Math.round(agesWithValue.reduce((a, b) => a + b, 0) / agesWithValue.length)
    : 0;

  // Calculate new athletes this month
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = list.filter(a => {
    // We don't have createdAt in the query, so we can't calculate this without modifying the query
    // For now, we'll show total with families as additional metric
    return true;
  }).length;

  const stats = {
    total: list.length,
    active: list.filter(a => a.status === "active").length,
    inactive: list.filter(a => a.status === "inactive").length,
    trial: list.filter(a => a.status === "trial").length,
    avgAge,
    withFamilies: list.filter(a => Number(a.guardianCount ?? 0) > 0).length,
  };

  // Calculate level distribution
  const levelDistribution = list.reduce((acc, athlete) => {
    const level = athlete.level ?? "Sin nivel";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const levelStats = Object.entries(levelDistribution)
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count);

  // Pagination
  // Sorting
  const sortField: SortField = (searchParams.sort as SortField) || "name";
  const sortDirection: SortDirection = (searchParams.dir as SortDirection) || "asc";

  // Sort the list
  const sortedList = [...list].sort((a, b) => {
    let aVal: string | number | null = a[sortField] ?? "";
    let bVal: string | number | null = b[sortField] ?? "";

    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();

    if (aVal === null || aVal === "") return 1;
    if (bVal === null || bVal === "") return -1;

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Pagination
  const page = typeof searchParams.page === "string" ? Number(searchParams.page) : 1;
  const perPage = 20;
  const totalPages = Math.ceil(sortedList.length / perPage);
  const paginatedList = sortedList.slice((page - 1) * perPage, page * perPage);

  // Active filters for display
  const activeFilters = [];
  if (searchTerm) activeFilters.push({ key: "q", label: `Busqueda: "${searchTerm}"` });
  if (statusParam) activeFilters.push({ key: "status", label: `Estado: ${statusParam}` });
  if (levelParam) activeFilters.push({ key: "level", label: `Nivel: ${levelParam}` });
  if (academyParam) activeFilters.push({ key: "academy", label: `Academia: ${userAcademies.find(a => a.id === academyParam)?.name || academyParam}` });
  if (minAgeParam !== undefined) activeFilters.push({ key: "minAge", label: `Edad min: ${minAgeParam}` });
  if (maxAgeParam !== undefined) activeFilters.push({ key: "maxAge", label: `Edad max: ${maxAgeParam}` });

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <p className="text-sm font-medium text-emerald-700">Total Atletas</p>
          <p className="text-3xl font-bold text-emerald-800">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-sm font-medium text-blue-700">Activos</p>
          <p className="text-3xl font-bold text-blue-800">{stats.active}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <p className="text-sm font-medium text-amber-700">En Prueba</p>
          <p className="text-3xl font-bold text-amber-800">{stats.trial}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
          <p className="text-sm font-medium text-gray-700">Inactivos</p>
          <p className="text-3xl font-bold text-gray-800">{stats.inactive}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl p-4 border border-violet-200">
          <p className="text-sm font-medium text-violet-700">Edad Promedio</p>
          <p className="text-3xl font-bold text-violet-800">{stats.avgAge} <span className="text-lg font-normal">años</span></p>
        </div>
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl p-4 border border-cyan-200">
          <p className="text-sm font-medium text-cyan-700">Con Familia</p>
          <p className="text-3xl font-bold text-cyan-800">{stats.withFamilies}</p>
        </div>
      </div>

      {/* Level Distribution Chart */}
      {levelStats.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold">Distribución por Nivel</h3>
          <div className="flex flex-wrap gap-3">
            {levelStats.map(({ level, count }) => {
              const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={level} className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
                  <span className="font-medium">{level}</span>
                  <span className="text-muted-foreground">({count})</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Atletas" },
        ]}
        title="Atletas"
        description="Gestiona atletas por nivel, estado y familia. Filtra la vista para detectar riesgos o planificar evaluaciones."
        icon={Users}
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/dashboard/athletes/new">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo atleta
              </Link>
            </Button>
            <ImportExportPanel tenantId={tenantId ?? undefined} />
          </div>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
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
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Filtros activos:</span>
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800"
            >
              {filter.label}
              <Link
                href={`?${new URLSearchParams(
                  Object.entries(searchParams)
                    .filter(([key]) => key !== filter.key && key !== "page")
                    .reduce((acc, [key, val]) => {
                      if (val && typeof val === "string") acc[key] = val;
                      return acc;
                    }, {} as Record<string, string>)
                ).toString()}`}
                className="ml-1 hover:text-emerald-600"
              >
                <X className="h-3 w-3" />
              </Link>
            </span>
          ))}
          <Link
            href="?page=1"
            className="text-sm text-muted-foreground hover:text-emerald-600 underline"
          >
            Limpiar todo
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card shadow">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "name",
                    dir: sortField === "name" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Nombre
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "level",
                    dir: sortField === "level" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Nivel
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "status",
                    dir: sortField === "status" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Estado
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium text-right">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "age",
                    dir: sortField === "age" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center justify-end gap-1 hover:text-foreground"
                >
                  Edad
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "academyName",
                    dir: sortField === "academyName" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Academia
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium text-right">
                <Link
                  href={`?${new URLSearchParams({
                    ...searchParams,
                    sort: "guardianCount",
                    dir: sortField === "guardianCount" && sortDirection === "asc" ? "desc" : "asc",
                  } as Record<string, string>).toString()}`}
                  className="flex items-center justify-end gap-1 hover:text-foreground"
                >
                  Familia
                  <ArrowUpDown className="h-3 w-3" />
                </Link>
              </th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background text-foreground">
            {paginatedList.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title={searchTerm || statusParam || levelParam || academyParam || minAgeParam || maxAgeParam ? "Sin resultados" : "No hay atletas"}
                    description={
                      searchTerm || statusParam || levelParam || academyParam || minAgeParam || maxAgeParam
                        ? "No se encontraron atletas con los filtros actuales. Prueba a modificar los criterios de búsqueda."
                        : "Aún no has creado ningún atleta. Crea tu primer atleta para gestionar tu academia."
                    }
                    action={
                      !searchTerm && !statusParam && !levelParam && !academyParam && !minAgeParam && !maxAgeParam
                        ? { label: "Crear primer atleta", href: "/dashboard/athletes/new" }
                        : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              paginatedList.map((row) => (
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
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      row.status === "active" ? "bg-emerald-100 text-emerald-800" :
                      row.status === "inactive" ? "bg-gray-100 text-gray-800" :
                      row.status === "trial" ? "bg-amber-100 text-amber-800" :
                      "bg-slate-100 text-slate-800"
                    }`}>
                      {row.status === "active" ? "Activo" :
                       row.status === "inactive" ? "Inactivo" :
                       row.status === "trial" ? "Prueba" : row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.age ?? "—"}</td>
                  <td className="px-4 py-3">{row.academyName ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.guardianCount ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/athletes/${row.id}`}
                        className="rounded p-1 hover:bg-muted"
                        title="Ver"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Link>
                      <Link
                        href={`/dashboard/athletes/${row.id}/edit`}
                        className="rounded p-1 hover:bg-muted"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * perPage + 1} - {Math.min(page * perPage, sortedList.length)} de {sortedList.length}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


