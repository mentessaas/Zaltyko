"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, classes, classWeekdays } from "@/db/schema";

export type PublicAcademyDetail = {
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
  schedule: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>>;
};

/**
 * Server action para obtener detalles de una academia pública
 * 
 * @param academyId - ID de la academia
 * @returns Detalles de la academia o null si no existe o no es pública
 */
export async function getPublicAcademy(
  academyId: string
): Promise<PublicAcademyDetail | null> {
  // Obtener academia pública
  const [academy] = await db
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
    .where(
      and(
        eq(academies.id, academyId),
        eq(academies.isPublic, true),
        eq(academies.isSuspended, false)
      )
    )
    .limit(1);

  if (!academy) {
    return null;
  }

  // Obtener horarios públicos del grupo principal
  // Solo clases base (no extra) para no exponer información privada
  const publicSchedule = await db
    .select({
      className: classes.name,
      weekday: classWeekdays.weekday,
      startTime: classes.startTime,
      endTime: classes.endTime,
    })
    .from(classes)
    .innerJoin(classWeekdays, eq(classes.id, classWeekdays.classId))
    .where(
      and(
        eq(classes.academyId, academyId),
        eq(classes.isExtra, false) // Solo clases base
      )
    )
    .limit(20); // Limitar a 20 clases

  // Agrupar horarios por día de la semana
  const scheduleByDay: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>> = {};
  
  for (const schedule of publicSchedule) {
    const weekday = schedule.weekday ?? 0;
    if (!scheduleByDay[weekday]) {
      scheduleByDay[weekday] = [];
    }
    scheduleByDay[weekday].push({
      name: schedule.className ?? "Clase",
      startTime: schedule.startTime ? String(schedule.startTime) : null,
      endTime: schedule.endTime ? String(schedule.endTime) : null,
    });
  }

  return {
    ...academy,
    academyType: String(academy.academyType),
    schedule: scheduleByDay,
  };
}

