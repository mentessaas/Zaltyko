"use server";

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import type { EventFilters, PublicEventListResult, PublicEvent } from "@/types/events";

const EVENT_LEVELS = ["internal", "local", "national", "international"] as const;
const EVENT_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour"] as const;

const GetPublicEventsSchema = z.object({
  search: z.string().optional(),
  discipline: z.enum(EVENT_DISCIPLINES).optional(),
  level: z.enum(EVENT_LEVELS).optional(),
  eventType: z.enum(["competitions", "courses", "camps", "workshops", "clinics", "evaluations", "other"]).optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(200).default(50),
});

export type GetPublicEventsInput = z.infer<typeof GetPublicEventsSchema>;

/**
 * Server action para obtener eventos públicos con filtros
 * 
 * @param input - Filtros de búsqueda
 * @returns Lista paginada de eventos públicos
 */
export async function getPublicEvents(
  input: EventFilters
): Promise<PublicEventListResult> {
  const parsed = GetPublicEventsSchema.parse(input);
  const { search, discipline, level, eventType, country, province, city, startDate, endDate, page, limit } = parsed;

  // Construir filtros - solo eventos públicos
  const filters: ReturnType<typeof eq | typeof ilike | typeof sql>[] = [
    eq(events.isPublic, true),
  ];

  if (search) {
    const searchFilter = or(
      ilike(events.title, `%${search}%`),
      ilike(events.description, `%${search}%`)
    );
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  if (discipline) {
    filters.push(eq(events.discipline, discipline));
  }

  if (level) {
    filters.push(eq(events.level, level));
  }

  if (eventType) {
    filters.push(eq(events.eventType, eventType));
  }

  if (country) {
    const normalizedCountry = country.trim().toLowerCase();
    const countryFilter = or(
      sql`LOWER(TRIM(${events.countryCode})) = LOWER(TRIM(${normalizedCountry}))`,
      sql`LOWER(TRIM(${events.country})) = LOWER(TRIM(${normalizedCountry}))`
    );
    if (countryFilter) {
      filters.push(countryFilter);
    }
  }

  if (province) {
    const normalizedProvince = province.trim().toLowerCase();
    const provinceFilter = or(
      sql`LOWER(TRIM(${events.provinceName})) = LOWER(TRIM(${normalizedProvince}))`,
      sql`LOWER(TRIM(${events.province})) = LOWER(TRIM(${normalizedProvince}))`
    );
    if (provinceFilter) {
      filters.push(provinceFilter);
    }
  }

  if (city) {
    const normalizedCity = city.trim().toLowerCase();
    const cityFilter = or(
      sql`LOWER(TRIM(${events.cityName})) = LOWER(TRIM(${normalizedCity}))`,
      sql`LOWER(TRIM(${events.city})) = LOWER(TRIM(${normalizedCity}))`
    );
    if (cityFilter) {
      filters.push(cityFilter);
    }
  }

  if (startDate) {
    filters.push(sql`${events.startDate} >= ${startDate}::date`);
  }

  if (endDate) {
    filters.push(sql`${events.endDate} <= ${endDate}::date`);
  }

  // Contar total de resultados
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(...filters));

  const total = Number(countResult?.count ?? 0);
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  // Obtener eventos
  const eventItems = await db
    .select({
      id: events.id,
      tenantId: events.tenantId,
      academyId: events.academyId,
      title: events.title,
      description: events.description,
      category: events.category,
      isPublic: events.isPublic,
      level: events.level,
      discipline: events.discipline,
      eventType: events.eventType,
      startDate: events.startDate,
      endDate: events.endDate,
      registrationStartDate: events.registrationStartDate,
      registrationEndDate: events.registrationEndDate,
      countryCode: events.countryCode,
      countryName: events.countryName,
      provinceName: events.provinceName,
      cityName: events.cityName,
      // Mantener campos antiguos para compatibilidad
      country: events.country,
      province: events.province,
      city: events.city,
      contactEmail: events.contactEmail,
      contactPhone: events.contactPhone,
      contactInstagram: events.contactInstagram,
      contactWebsite: events.contactWebsite,
      images: events.images,
      attachments: events.attachments,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .where(and(...filters))
    .orderBy(desc(events.startDate), desc(events.createdAt))
    .limit(limit)
    .offset(offset);

  // Obtener información de academias para los eventos
  const academyIds = Array.from(new Set(eventItems.map(e => e.academyId)));
  const academyData = academyIds.length > 0 ? await db
    .select({
      id: academies.id,
      name: academies.name,
      logoUrl: academies.logoUrl,
    })
    .from(academies)
    .where(inArray(academies.id, academyIds))
    .then(academies => {
      const map = new Map(academies.map(a => [a.id, a]));
      return map;
    }) : new Map();

  // Combinar datos
  const transformedItems = eventItems.map((event) => {
    const academy = academyData.get(event.academyId);
    return {
      ...event,
      academyName: academy?.name || null,
      academyLogoUrl: academy?.logoUrl || null,
    };
  });

  return {
    total,
    page,
    pageSize: limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    items: transformedItems.map((item) => ({
      ...item,
      level: String(item.level) as any,
      discipline: item.discipline ? (String(item.discipline) as any) : null,
      startDate: item.startDate ? String(item.startDate) : null,
      endDate: item.endDate ? String(item.endDate) : null,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
    })) as PublicEvent[],
  };
}

