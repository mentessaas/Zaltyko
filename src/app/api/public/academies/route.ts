import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

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
      filters.push(eq(academies.country, country));
    }

    if (region) {
      filters.push(eq(academies.region, region));
    }

    if (city) {
      filters.push(eq(academies.city, city));
    }

    // Contar total de resultados
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(academies)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Obtener academias
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
      })
      .from(academies)
      .where(and(...filters))
      .orderBy(asc(academies.name))
      .limit(limit)
      .offset(offset);

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

