import { NextResponse } from "next/server";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * GET /api/public/academies/filter-options
 * 
 * Devuelve todas las opciones disponibles para los filtros (países, regiones, ciudades)
 * Incluye academias públicas y no públicas para tener opciones completas
 */
export async function GET() {
  try {
    // Obtener todas las academias no suspendidas
    const allAcademies = await db
      .select({
        country: academies.country,
        region: academies.region,
        city: academies.city,
        isPublic: academies.isPublic,
      })
      .from(academies)
      .where(eq(academies.isSuspended, false));

    const countriesSet = new Set<string>();
    const regionsSet = new Set<string>();
    const citiesSet = new Set<string>();

    // Filtrar solo academias públicas
    const publicAcademies = allAcademies.filter((academy) => academy.isPublic === true);

    // Si no hay academias públicas, usar todas las no suspendidas para tener opciones
    const academiesToUse = publicAcademies.length > 0 ? publicAcademies : allAcademies;

    academiesToUse.forEach((academy) => {
      // Normalizar países (mayúsculas)
      if (academy.country) {
        const normalizedCountry = academy.country.trim().toUpperCase();
        if (normalizedCountry) countriesSet.add(normalizedCountry);
      }
      // Normalizar regiones (capitalizar primera letra)
      if (academy.region) {
        const normalizedRegion = academy.region.trim();
        if (normalizedRegion) {
          regionsSet.add(normalizedRegion.charAt(0).toUpperCase() + normalizedRegion.slice(1).toLowerCase());
        }
      }
      // Normalizar ciudades (capitalizar primera letra)
      if (academy.city) {
        const normalizedCity = academy.city.trim();
        if (normalizedCity) {
          citiesSet.add(normalizedCity.charAt(0).toUpperCase() + normalizedCity.slice(1).toLowerCase());
        }
      }
    });

    return NextResponse.json({
      countries: Array.from(countriesSet).sort(),
      regions: Array.from(regionsSet).sort(),
      cities: Array.from(citiesSet).sort(),
      totalAcademies: allAcademies.length,
      publicAcademies: publicAcademies.length,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/academies/filter-options", method: "GET" });
  }
}

