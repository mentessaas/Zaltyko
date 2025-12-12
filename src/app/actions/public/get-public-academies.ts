"use server";

import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { createClient } from "@supabase/supabase-js";

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

  // Intentar primero con Drizzle, si falla usar Supabase REST API
  let useFallback = false;
  
  try {
    // Contar total de resultados
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(academies)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    
    // Si el total es 0 pero sabemos que hay academias, puede ser un problema de conexión
    // Intentar el fallback si total es 0 y no hay filtros de búsqueda
    if (total === 0 && !search && !type && !country && !region && !city) {
      console.log("⚠️  Total es 0 sin filtros, puede ser problema de conexión. Usando fallback...");
      useFallback = true;
      throw new Error("Connection issue - using fallback");
    }
    
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
  } catch (error) {
    // Si hay un error de conexión a la base de datos, intentar usar Supabase REST API como fallback
    console.error("Error al obtener academias públicas con Drizzle:", error);
    console.log("🔄 Intentando usar Supabase REST API como fallback...");
    
    try {
      // Usar anon key para consultas públicas (no requiere service role)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase URL o Anon Key no configurados");
      }
      
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Construir query con filtros
      let query = supabase
        .from("academies")
        .select("*", { count: "exact" })
        .eq("is_public", true)
        .eq("is_suspended", false);
      
      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
      if (type) {
        query = query.eq("academy_type", type);
      }
      if (country) {
        query = query.ilike("country", country);
      }
      if (region) {
        query = query.ilike("region", region);
      }
      if (city) {
        query = query.ilike("city", city);
      }
      
      // Aplicar paginación
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
      query = query.order("name", { ascending: true });
      
      const { data, error: supabaseError, count } = await query;
      
      if (supabaseError) {
        console.error("Error en Supabase REST API:", supabaseError);
        throw supabaseError;
      }
      
      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit);
      
      console.log(`✅ Fallback exitoso: ${data?.length ?? 0} academias encontradas`);
      
      return {
        total,
        page,
        pageSize: limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        items: (data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          academyType: String(item.academy_type),
          country: item.country,
          region: item.region,
          city: item.city,
          publicDescription: item.public_description,
          logoUrl: item.logo_url,
          website: item.website,
          contactEmail: item.contact_email,
          contactPhone: item.contact_phone,
          address: item.address,
          socialInstagram: item.social_instagram,
          socialFacebook: item.social_facebook,
          socialTwitter: item.social_twitter,
          socialYoutube: item.social_youtube,
        })),
      };
    } catch (fallbackError) {
      // Si el fallback también falla, retornar resultados vacíos
      console.error("Error en fallback de Supabase:", fallbackError);
      
      return {
        total: 0,
        page,
        pageSize: limit,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        items: [],
      };
    }
  }

}

