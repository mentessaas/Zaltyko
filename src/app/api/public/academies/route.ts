import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;

const QuerySchema = z.object({
  search: z.string().optional(),
  type: z.enum(ACADEMY_TYPES).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
});

/**
 * GET /api/public/academies
 * 
 * Lista academias públicas con filtros opcionales.
 * Endpoint público (sin autenticación requerida).
 * 
 * Query params:
 * - search: Búsqueda por nombre
 * - type: Tipo de academia (artistica, ritmica, trampolin, general, parkour, danza)
 * - country: País
 * - region: Región
 * - city: Ciudad
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

    const { search, type, country, region, city, page, limit } = parsed.data;

    // Construir filtros
    const filters: ReturnType<typeof eq | typeof ilike>[] = [
      eq(academies.isPublic, true),
      eq(academies.isSuspended, false),
    ];

    if (search) {
      filters.push(ilike(academies.name, `%${search}%`));
    }

    if (type) {
      filters.push(eq(academies.academyType, type));
    }

    if (country) {
      // Normalizar país: puede venir como "es", "ES", "España", etc.
      // Buscar case-insensitive usando comparación con LOWER
      const normalizedCountry = country.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${academies.country})) = LOWER(TRIM(${normalizedCountry}))`);
    }

    if (region) {
      // Normalizar región: puede venir como "andalucia", "Andalucía", etc.
      // Buscar case-insensitive usando comparación con LOWER
      const normalizedRegion = region.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${academies.region})) = LOWER(TRIM(${normalizedRegion}))`);
    }

    if (city) {
      // Normalizar ciudad: puede venir como "malaga", "Málaga", etc.
      // Buscar case-insensitive usando comparación con LOWER
      const normalizedCity = city.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${academies.city})) = LOWER(TRIM(${normalizedCity}))`);
    }

    // Contar total de resultados
    let total = 0;
    let items: Array<{
      id: string;
      name: string;
      academyType: string;
      country: string | null;
      region: string | null;
      city: string | null;
      publicDescription: string | null;
      logoUrl: string | null;
      website: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      address: string | null;
      socialInstagram: string | null;
      socialFacebook: string | null;
      socialTwitter: string | null;
      socialYoutube: string | null;
    }> = [];

    try {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(academies)
        .where(and(...filters));

      total = Number(countResult?.count ?? 0);
      const offset = (page - 1) * limit;

      // Obtener academias
      items = await db
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
        })
        .from(academies)
        .where(and(...filters))
        .orderBy(asc(academies.name))
        .limit(limit)
        .offset(offset);
    } catch (dbError) {
      // Si hay un error de conexión a la base de datos, retornar resultados vacíos
      // Esto permite que la API responda sin fallar completamente
      console.error("Error al consultar base de datos:", dbError);
      // Continuar con valores por defecto (total=0, items=[])
    }

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      total,
      page,
      pageSize: limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/academies", method: "GET" });
  }
}

