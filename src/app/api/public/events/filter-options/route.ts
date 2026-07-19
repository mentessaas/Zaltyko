import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { handleApiError } from "@/lib/api-error-handler";

/**
 * GET /api/public/events/filter-options
 * 
 * Devuelve todas las opciones disponibles para los filtros (países, provincias, ciudades, disciplinas)
 * Solo incluye eventos públicos
 */
export async function GET() {
  try {
    // Obtener todos los eventos públicos
    const publicEvents = await db
      .select({
        country: events.country,
        province: events.province,
        city: events.city,
        discipline: events.discipline,
      })
      .from(events)
      .where(eq(events.isPublic, true));

    const countriesSet = new Set<string>();
    const provincesSet = new Set<string>();
    const citiesSet = new Set<string>();
    const disciplinesSet = new Set<string>();

    publicEvents.forEach((event) => {
      // Normalizar países
      if (event.country) {
        const normalizedCountry = event.country.trim();
        if (normalizedCountry) countriesSet.add(normalizedCountry);
      }
      // Normalizar provincias
      if (event.province) {
        const normalizedProvince = event.province.trim();
        if (normalizedProvince) {
          provincesSet.add(normalizedProvince.charAt(0).toUpperCase() + normalizedProvince.slice(1).toLowerCase());
        }
      }
      // Normalizar ciudades
      if (event.city) {
        const normalizedCity = event.city.trim();
        if (normalizedCity) {
          citiesSet.add(normalizedCity.charAt(0).toUpperCase() + normalizedCity.slice(1).toLowerCase());
        }
      }
      // Disciplinas
      if (event.discipline) {
        disciplinesSet.add(event.discipline);
      }
    });

    return NextResponse.json({
      countries: Array.from(countriesSet).sort(),
      provinces: Array.from(provincesSet).sort(),
      cities: Array.from(citiesSet).sort(),
      disciplines: Array.from(disciplinesSet).sort(),
      totalEvents: publicEvents.length,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/events/filter-options", method: "GET" });
  }
}

