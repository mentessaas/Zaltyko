"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import type { PublicEvent } from "@/types/events";

/**
 * Server action para obtener detalles de un evento público
 * 
 * @param eventId - ID del evento
 * @returns Detalles del evento o null si no existe o no es público
 */
export async function getPublicEvent(
  eventId: string
): Promise<(PublicEvent & { academy: { id: string; name: string; logoUrl: string | null; country: string | null; region: string | null; city: string | null; website: string | null; contactEmail: string | null; contactPhone: string | null; socialInstagram: string | null } | null }) | null> {
  // Obtener evento público
  const [event] = await db
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
    .where(
      and(
        eq(events.id, eventId),
        eq(events.isPublic, true)
      )
    )
    .limit(1);

  if (!event) {
    return null;
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

  return {
    ...event,
    level: String(event.level) as any,
    discipline: event.discipline ? (String(event.discipline) as any) : null,
    startDate: event.startDate ? String(event.startDate) : null,
    endDate: event.endDate ? String(event.endDate) : null,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
    updatedAt: event.updatedAt instanceof Date ? event.updatedAt.toISOString() : String(event.updatedAt),
    academyName: academy?.name || "",
    academyLogoUrl: academy?.logoUrl || null,
    academy: academy || null,
  } as PublicEvent & { academy: typeof academy | null };
}

