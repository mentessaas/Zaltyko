"use server";

import { and, eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

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
  try {
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
  } catch (error) {
    // Si hay un error de conexión, usar Supabase REST API como fallback
    console.error("Error al obtener academia pública con Drizzle:", error);
    console.log("🔄 Intentando usar Supabase REST API como fallback...");
    
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Supabase URL o Anon Key no configurados");
      }
      
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Obtener academia
      const { data: academy, error: academyError } = await supabase
        .from("academies")
        .select("*")
        .eq("id", academyId)
        .eq("is_public", true)
        .eq("is_suspended", false)
        .single();
      
      if (academyError || !academy) {
        console.error("Error en Supabase REST API:", academyError);
        return null;
      }
      
      // Obtener horarios (simplificado para el fallback)
      const { data: scheduleData } = await supabase
        .from("classes")
        .select(`
          name,
          start_time,
          end_time,
          class_weekdays!inner(weekday)
        `)
        .eq("academy_id", academyId)
        .eq("is_extra", false)
        .limit(20);
      
      // Agrupar horarios por día
      const scheduleByDay: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>> = {};
      
      if (scheduleData) {
        for (const schedule of scheduleData) {
          const weekday = (schedule.class_weekdays as any)?.[0]?.weekday ?? 0;
          if (!scheduleByDay[weekday]) {
            scheduleByDay[weekday] = [];
          }
          scheduleByDay[weekday].push({
            name: schedule.name ?? "Clase",
            startTime: schedule.start_time ? String(schedule.start_time) : null,
            endTime: schedule.end_time ? String(schedule.end_time) : null,
          });
        }
      }
      
      console.log(`✅ Fallback exitoso: Academia ${academy.name} encontrada`);
      
      return {
        id: academy.id,
        name: academy.name,
        academyType: String(academy.academy_type),
        country: academy.country,
        region: academy.region,
        city: academy.city,
        publicDescription: academy.public_description,
        logoUrl: academy.logo_url,
        website: academy.website,
        contactEmail: academy.contact_email,
        contactPhone: academy.contact_phone,
        address: academy.address,
        socialInstagram: academy.social_instagram,
        socialFacebook: academy.social_facebook,
        socialTwitter: academy.social_twitter,
        socialYoutube: academy.social_youtube,
        schedule: scheduleByDay,
      };
    } catch (fallbackError) {
      console.error("Error en fallback de Supabase:", fallbackError);
      return null;
    }
  }
}

