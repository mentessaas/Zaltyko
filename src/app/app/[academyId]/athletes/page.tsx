import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, guardianAthletes, groups } from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";

import { AthletesTableView } from "@/components/athletes/AthletesTableView";

interface PageProps {
  params: {
    academyId: string;
  };
  searchParams: Record<string, string | string[] | undefined>;
}

function calculateAge(dob: Date | string | null): number | null {
  if (!dob) return null;
  const date = typeof dob === "string" ? new Date(dob) : dob;
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

export default async function AcademyAthletesPage({ params, searchParams }: PageProps) {
  const { academyId } = params;

  const [academy] = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const statusFilter =
    typeof searchParams.status === "string" &&
    (athleteStatusOptions as readonly string[]).includes(searchParams.status)
      ? (searchParams.status as (typeof athleteStatusOptions)[number])
      : undefined;

  const levelFilter =
    typeof searchParams.level === "string" && searchParams.level.trim().length > 0
      ? searchParams.level.trim()
      : undefined;

  const searchQuery =
    typeof searchParams.q === "string" && searchParams.q.trim().length > 0
      ? searchParams.q.trim()
      : undefined;

  const groupFilter =
    typeof searchParams.group === "string" && searchParams.group.trim().length > 0
      ? searchParams.group.trim()
      : undefined;

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianCount = sql<number>`count(distinct ${guardianAthletes.id})`;

  const conditions = [
    eq(athletes.academyId, academyId),
    statusFilter ? eq(athletes.status, statusFilter) : undefined,
    levelFilter ? eq(athletes.level, levelFilter) : undefined,
    searchQuery ? ilike(athletes.name, `%${searchQuery}%`) : undefined,
    groupFilter ? eq(athletes.groupId, groupFilter) : undefined,
  ].filter(Boolean) as any[];

  const whereClause = conditions.reduce<any>(
    (accumulator, condition) => (accumulator ? and(accumulator, condition) : condition),
    undefined
  );

  const rows = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      age: ageExpr,
      guardianCount,
      createdAt: athletes.createdAt,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
    })
    .from(athletes)
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause)
    .groupBy(athletes.id, groups.name, groups.color)
    .orderBy(asc(athletes.name))
    .limit(200);

  const levelRows = await db
    .selectDistinct({ level: athletes.level })
    .from(athletes)
    .where(eq(athletes.academyId, academyId))
    .orderBy(asc(athletes.level));

  const levels = levelRows
    .map((entry) => entry.level)
    .filter((value): value is string => Boolean(value));

  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      color: groups.color,
    })
    .from(groups)
    .where(eq(groups.academyId, academyId))
    .orderBy(asc(groups.name));

  const list = rows.map((row) => ({
    id: row.id,
    name: row.name,
    level: row.level ?? null,
    status: row.status as (typeof athleteStatusOptions)[number],
    age: row.age ?? calculateAge(row.dob),
    dob: row.dob ? (row.dob instanceof Date ? row.dob.toISOString() : row.dob) : null,
    guardianCount: Number(row.guardianCount ?? 0),
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    groupId: row.groupId,
    groupName: row.groupName,
    groupColor: row.groupColor,
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Atletas</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona atletas, contactos familiares y niveles de entrenamiento.
        </p>
        <p className="text-xs text-muted-foreground">
          ¿Necesitas importar datos? Usa el{" "}
          <Link href="/dashboard/athletes" className="text-primary underline">
            módulo clásico
          </Link>{" "}
          mientras migramos las herramientas aquí.
        </p>
      </header>

      <AthletesTableView
        academyId={academy.id}
        athletes={list}
        levels={levels}
        filters={{
          status: statusFilter,
          level: levelFilter,
          q: searchQuery,
          groupId: groupFilter,
        }}
        groups={groupRows.map((group) => ({
          id: group.id,
          name: group.name ?? "Grupo sin nombre",
          color: group.color ?? null,
        }))}
      />
    </div>
  );
}


