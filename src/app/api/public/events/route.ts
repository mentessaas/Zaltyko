import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = "force-dynamic";

const EVENT_LEVELS = ["internal", "local", "national", "international"] as const;
const EVENT_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour"] as const;

const QuerySchema = z.object({
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  discipline: z.enum(EVENT_DISCIPLINES).optional(),
  level: z.enum(EVENT_LEVELS).optional(),
  eventType: z.enum(["competitions", "courses", "camps", "workshops", "clinics", "evaluations", "other"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
});

/**
 * GET /api/public/events
 * 
 * Lista eventos públicos con filtros opcionales.
 * Endpoint público (sin autenticación requerida).
 * 
 * Query params:
 * - search: Búsqueda por título/descripción
 * - discipline: Disciplina del evento
 * - level: Nivel del evento (internal, local, national, international)
 * - country: País
 * - province: Provincia
 * - city: Ciudad
 * - startDate: Fecha inicio (YYYY-MM-DD)
 * - endDate: Fecha fin (YYYY-MM-DD)
 * - page: Número de página (default: 1)
 * - limit: Tamaño de página (default: 50, max: 1000)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_FILTERS",
          message: "Los filtros proporcionados no son válidos",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { country, province, city, discipline, level, eventType, startDate, endDate, search, page, limit } = parsed.data;

    // Construir filtros - solo eventos públicos
    const filters: SQL[] = [
      eq(events.isPublic, true),
    ];

    if (search) {
      filters.push(
        or(
          ilike(events.title, `%${search}%`),
          ilike(events.description, `%${search}%`)
        )!
      );
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
      // Intentar usar countryCode primero, luego country
      const normalizedCountry = country.trim().toLowerCase();
      filters.push(
        or(
          sql`LOWER(TRIM(${events.countryCode})) = LOWER(TRIM(${normalizedCountry}))`,
          sql`LOWER(TRIM(${events.country})) = LOWER(TRIM(${normalizedCountry}))`
        )!
      );
    }

    if (province) {
      const normalizedProvince = province.trim().toLowerCase();
      filters.push(
        or(
          sql`LOWER(TRIM(${events.provinceName})) = LOWER(TRIM(${normalizedProvince}))`,
          sql`LOWER(TRIM(${events.province})) = LOWER(TRIM(${normalizedProvince}))`
        )!
      );
    }

    if (city) {
      const normalizedCity = city.trim().toLowerCase();
      filters.push(
        or(
          sql`LOWER(TRIM(${events.cityName})) = LOWER(TRIM(${normalizedCity}))`,
          sql`LOWER(TRIM(${events.city})) = LOWER(TRIM(${normalizedCity}))`
        )!
      );
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
        title: events.title,
        description: events.description,
        category: events.category,
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
        academyId: events.academyId,
        createdAt: events.createdAt,
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

    return NextResponse.json({
      total,
      page,
      pageSize: limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items: transformedItems,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/events", method: "GET" });
  }
}

