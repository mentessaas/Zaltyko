import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/events/[id]
 * 
 * Obtiene los detalles públicos de un evento específico.
 * Endpoint público (sin autenticación requerida).
 * Solo devuelve eventos con is_public = true
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Obtener evento público
    const [event] = await db
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
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(
        and(
          eq(events.id, id),
          eq(events.isPublic, true)
        )
      )
      .limit(1);

    if (!event) {
      return NextResponse.json(
        { error: "EVENT_NOT_FOUND", message: "Evento no encontrado o no público" },
        { status: 404 }
      );
    }

    // Obtener información de la academia organizadora
    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        logoUrl: academies.logoUrl,
        country: academies.country,
        region: academies.region,
        city: academies.city,
        website: academies.website,
        contactEmail: academies.contactEmail,
        contactPhone: academies.contactPhone,
        socialInstagram: academies.socialInstagram,
      })
      .from(academies)
      .where(eq(academies.id, event.academyId))
      .limit(1);

    return NextResponse.json({
      ...event,
      academy: academy || null,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/events/[id]", method: "GET" });
  }
}

