"use server";

import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;

const GetPublicAcademiesSchema = z.object({
  search: z.string().optional(),
  type: z.enum(ACADEMY_TYPES).optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(200).default(50),
});

export type GetPublicAcademiesInput = z.infer<typeof GetPublicAcademiesSchema>;

export type PublicAcademy = {
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
};

export type GetPublicAcademiesResult = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: PublicAcademy[];
};

/**
 * Server action para obtener academias públicas con filtros
 * 
 * @param input - Filtros de búsqueda
 * @returns Lista paginada de academias públicas
 */
export async function getPublicAcademies(
  input: GetPublicAcademiesInput
): Promise<GetPublicAcademiesResult> {
  const parsed = GetPublicAcademiesSchema.parse(input);
  const { search, type, country, region, city, page, limit } = parsed;

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

  return {
    total,
    page,
    pageSize: limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    items: items.map((item) => ({
      ...item,
      academyType: String(item.academyType),
    })),
  };
}

