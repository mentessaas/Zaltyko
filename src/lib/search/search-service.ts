import { db } from "@/db";
import { athletes, classes, coaches, groups, academies, events } from "@/db/schema";
import { eq, and, or, ilike, sql } from "drizzle-orm";

export type SearchResultType = "athlete" | "class" | "coach" | "group" | "academy" | "event";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  type?: SearchResultType;
  limit?: number;
  includeAllTypes?: boolean;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  type?: SearchResultType;
}

/**
 * Genera un pattern para búsqueda fuzzy (tolerante a typos)
 * Convierte el término a un patrón ILIKE con wildcards
 */
function generateFuzzyPattern(query: string): string {
  // Eliminar caracteres especiales y crear un patrón flexible
  const sanitized = query.replace(/[%_]/g, "").trim();
  if (sanitized.length < 2) return `%${sanitized}%`;

  // Para búsquedas más largas, usamos un patrón que permite errores menores
  // Dividir en palabras y buscar cada una
  const words = sanitized.split(/\s+/);
  if (words.length > 1) {
    return `%${words.map(w => `${w}%`).join("%")}%`;
  }

  return `%${sanitized}%`;
}

/**
 * Búsqueda global en la academia con soporte para filtros y fuzzy search
 */
export async function globalSearch(
  academyId: string,
  tenantId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { type, limit = 20, includeAllTypes = true } = options;

  if (!query || query.length < 2) {
    return [];
  }

  const searchTerm = generateFuzzyPattern(query);
  const results: SearchResult[] = [];
  const limitPerType = Math.ceil(limit / 4); // Distribuir límites entre tipos

  // Buscar atletas
  if (!type || type === "athlete") {
    const athletesResults = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        status: athletes.status,
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.academyId, academyId),
          eq(athletes.tenantId, tenantId),
          ilike(athletes.name, searchTerm)
        )
      )
      .limit(limitPerType);

    results.push(
      ...athletesResults.map((a) => ({
        type: "athlete" as const,
        id: a.id,
        name: a.name || "Sin nombre",
        description: a.level || a.status || undefined,
        url: `/app/${academyId}/athletes/${a.id}`,
        metadata: { level: a.level, status: a.status, groupId: a.groupId },
      }))
    );
  }

  // Buscar clases
  if (!type || type === "class") {
    const classesResults = await db
      .select({
        id: classes.id,
        name: classes.name,
        weekday: classes.weekday,
        startTime: classes.startTime,
        endTime: classes.endTime,
        capacity: classes.capacity,
      })
      .from(classes)
      .where(
        and(
          eq(classes.academyId, academyId),
          eq(classes.tenantId, tenantId),
          ilike(classes.name, searchTerm)
        )
      )
      .limit(limitPerType);

    results.push(
      ...classesResults.map((c) => ({
        type: "class" as const,
        id: c.id,
        name: c.name || "Sin nombre",
        description: c.weekday !== null ? `Día: ${c.weekday}, Horario: ${c.startTime}-${c.endTime}` : undefined,
        url: `/app/${academyId}/classes/${c.id}`,
        metadata: { weekday: c.weekday, startTime: c.startTime, endTime: c.endTime, capacity: c.capacity },
      }))
    );
  }

  // Buscar coaches
  if (!type || type === "coach") {
    const coachesResults = await db
      .select({
        id: coaches.id,
        name: coaches.name,
        email: coaches.email,
        bio: coaches.bio,
        specialties: coaches.specialties,
      })
      .from(coaches)
      .where(
        and(
          eq(coaches.academyId, academyId),
          eq(coaches.tenantId, tenantId),
          or(
            ilike(coaches.name, searchTerm),
            ilike(coaches.email || sql`NULL`, searchTerm),
            ilike(coaches.bio || sql`NULL`, searchTerm)
          )
        )
      )
      .limit(limitPerType);

    results.push(
      ...coachesResults.map((c) => ({
        type: "coach" as const,
        id: c.id,
        name: c.name || "Sin nombre",
        description: c.bio || c.email || undefined,
        url: `/app/${academyId}/coaches/${c.id}`,
        metadata: { specialties: c.specialties },
      }))
    );
  }

  // Buscar grupos
  if (!type || type === "group") {
    const groupsResults = await db
      .select({
        id: groups.id,
        name: groups.name,
        discipline: groups.discipline,
        level: groups.level,
        color: groups.color,
      })
      .from(groups)
      .where(
        and(
          eq(groups.academyId, academyId),
          eq(groups.tenantId, tenantId),
          or(
            ilike(groups.name, searchTerm),
            ilike(groups.discipline || sql`NULL`, searchTerm)
          )
        )
      )
      .limit(limitPerType);

    results.push(
      ...groupsResults.map((g) => ({
        type: "group" as const,
        id: g.id,
        name: g.name || "Sin nombre",
        description: g.discipline || g.level || undefined,
        url: `/app/${academyId}/groups/${g.id}`,
        metadata: { discipline: g.discipline, level: g.level, color: g.color },
      }))
    );
  }

  // Buscar eventos
  if (!type || type === "event") {
    const eventsResults = await db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        startDate: events.startDate,
        eventType: events.eventType,
      })
      .from(events)
      .where(
        and(
          eq(events.academyId, academyId),
          eq(events.tenantId, tenantId),
          or(
            ilike(events.title, searchTerm),
            ilike(events.description || sql`NULL`, searchTerm)
          )
        )
      )
      .limit(limitPerType);

    results.push(
      ...eventsResults.map((e) => ({
        type: "event" as const,
        id: e.id,
        name: e.title || "Sin título",
        description: e.description || undefined,
        url: `/app/${academyId}/events/${e.id}`,
        metadata: { startDate: e.startDate, eventType: e.eventType },
      }))
    );
  }

  // Buscar academias (solo si se pide explícitamente o si es búsqueda global)
  if (includeAllTypes && (!type || type === "academy")) {
    const academiesResults = await db
      .select({
        id: academies.id,
        name: academies.name,
        address: academies.address,
      })
      .from(academies)
      .where(
        and(
          eq(academies.tenantId, tenantId),
          or(
            ilike(academies.name, searchTerm),
            ilike(academies.address || sql`NULL`, searchTerm)
          )
        )
      )
      .limit(limitPerType);

    results.push(
      ...academiesResults.map((a) => ({
        type: "academy" as const,
        id: a.id,
        name: a.name || "Sin nombre",
        description: a.address || undefined,
        url: `/app/${a.id}/dashboard`,
      }))
    );
  }

  return results.slice(0, limit);
}

/**
 * Obtiene los tipos disponibles para filtrar
 */
export function getSearchableTypes(): { value: SearchResultType; label: string; icon: string }[] {
  return [
    { value: "athlete", label: "Atletas", icon: "user" },
    { value: "coach", label: "Entrenadores", icon: "graduation-cap" },
    { value: "class", label: "Clases", icon: "book-open" },
    { value: "group", label: "Grupos", icon: "users" },
    { value: "event", label: "Eventos", icon: "calendar" },
    { value: "academy", label: "Academias", icon: "building" },
  ];
}
