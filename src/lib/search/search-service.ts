import { db } from "@/db";
import { athletes, classes, coaches, groups, academies } from "@/db/schema";
import { eq, and, or, ilike, sql } from "drizzle-orm";

export interface SearchResult {
  type: "athlete" | "class" | "coach" | "group" | "academy";
  id: string;
  name: string;
  description?: string;
  url: string;
}

/**
 * Búsqueda global en la academia
 */
export async function globalSearch(
  academyId: string,
  tenantId: string,
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const searchTerm = `%${query}%`;
  const results: SearchResult[] = [];

  // Buscar atletas
  const athletesResults = await db
    .select({
      id: athletes.id,
      name: athletes.name,
    })
    .from(athletes)
    .where(
      and(
        eq(athletes.academyId, academyId),
        eq(athletes.tenantId, tenantId),
        ilike(athletes.name, searchTerm)
      )
    )
    .limit(limit);

  results.push(
    ...athletesResults.map((a) => ({
      type: "athlete" as const,
      id: a.id,
      name: a.name || "Sin nombre",
      url: `/app/${academyId}/athletes/${a.id}`,
    }))
  );

  // Buscar clases
  const classesResults = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.tenantId, tenantId),
        ilike(classes.name, searchTerm)
      )
    )
    .limit(limit);

  results.push(
    ...classesResults.map((c) => ({
      type: "class" as const,
      id: c.id,
      name: c.name || "Sin nombre",
      url: `/app/${academyId}/classes/${c.id}`,
    }))
  );

  // Buscar coaches
  const coachesResults = await db
    .select({
      id: coaches.id,
      name: coaches.name,
    })
    .from(coaches)
    .where(
      and(
        eq(coaches.academyId, academyId),
        eq(coaches.tenantId, tenantId),
        ilike(coaches.name, searchTerm)
      )
    )
    .limit(limit);

  results.push(
    ...coachesResults.map((c) => ({
      type: "coach" as const,
      id: c.id,
      name: c.name || "Sin nombre",
      url: `/app/${academyId}/coaches/${c.id}`,
    }))
  );

  // Buscar grupos
  const groupsResults = await db
    .select({
      id: groups.id,
      name: groups.name,
    })
    .from(groups)
    .where(
      and(
        eq(groups.academyId, academyId),
        eq(groups.tenantId, tenantId),
        ilike(groups.name, searchTerm)
      )
    )
    .limit(limit);

  results.push(
    ...groupsResults.map((g) => ({
      type: "group" as const,
      id: g.id,
      name: g.name || "Sin nombre",
      url: `/app/${academyId}/groups/${g.id}`,
    }))
  );

  return results.slice(0, limit);
}

