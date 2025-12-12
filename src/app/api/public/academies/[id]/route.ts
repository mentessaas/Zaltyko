import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { db } from "@/db";
import { academies, classes, classWeekdays } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/academies/[id]
 * 
 * Obtiene los detalles públicos de una academia específica.
 * Endpoint público (sin autenticación requerida).
 * 
 * Incluye:
 * - Información básica de la academia
 * - Horarios públicos del grupo principal (solo títulos y días, sin datos privados)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    let academy: {
      id: string;
      name: string;
      academyType: string;
      country: string | null;
      region: string | null;
      city: string | null;
      publicDescription: string | null;
      logoUrl: string | null;
    } | null = null;

    let publicSchedule: Array<{
      className: string | null;
      weekday: number | null;
      startTime: string | null;
      endTime: string | null;
    }> = [];

    try {
      // Intentar obtener academia con Drizzle
      const [academyResult] = await db
        .select({
          id: academies.id,
          name: academies.name,
          academyType: academies.academyType,
          country: academies.country,
          region: academies.region,
          city: academies.city,
          publicDescription: academies.publicDescription,
          logoUrl: academies.logoUrl,
        })
        .from(academies)
        .where(
          and(
            eq(academies.id, id),
            eq(academies.isPublic, true),
            eq(academies.isSuspended, false)
          )
        )
        .limit(1);

      academy = academyResult ? {
        ...academyResult,
        academyType: String(academyResult.academyType),
      } : null;

      // Intentar obtener horarios con Drizzle
      if (academy) {
        const scheduleResult = await db
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
              eq(classes.academyId, id),
              eq(classes.isExtra, false)
            )
          )
          .limit(20);

        publicSchedule = scheduleResult.map(s => ({
          className: s.className,
          weekday: s.weekday,
          startTime: s.startTime ? String(s.startTime) : null,
          endTime: s.endTime ? String(s.endTime) : null,
        }));
      }
    } catch (dbError) {
      // Si falla, usar Supabase REST API como fallback
      console.error("Error al obtener academia con Drizzle:", dbError);
      console.log("🔄 Intentando usar Supabase REST API como fallback...");
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        const { data: academyData, error: supabaseError } = await supabase
          .from("academies")
          .select("*")
          .eq("id", id)
          .eq("is_public", true)
          .eq("is_suspended", false)
          .single();
        
        if (!supabaseError && academyData) {
          academy = {
            id: academyData.id,
            name: academyData.name,
            academyType: String(academyData.academy_type),
            country: academyData.country,
            region: academyData.region,
            city: academyData.city,
            publicDescription: academyData.public_description,
            logoUrl: academyData.logo_url,
          };
          console.log(`✅ Fallback exitoso: Academia ${academy.name} encontrada`);
          
          // Obtener horarios (simplificado para el fallback)
          const { data: scheduleData } = await supabase
            .from("classes")
            .select(`
              name,
              start_time,
              end_time,
              class_weekdays!inner(weekday)
            `)
            .eq("academy_id", id)
            .eq("is_extra", false)
            .limit(20);
          
          if (scheduleData) {
            publicSchedule = scheduleData.map((s: any) => ({
              className: s.name,
              weekday: s.class_weekdays?.[0]?.weekday ?? null,
              startTime: s.start_time ? String(s.start_time) : null,
              endTime: s.end_time ? String(s.end_time) : null,
            }));
          }
        }
      }
    }

    if (!academy) {
      return NextResponse.json(
        { error: "ACADEMY_NOT_FOUND", message: "Academia no encontrada o no pública" },
        { status: 404 }
      );
    }

    // Agrupar horarios por día de la semana
    const scheduleByDay: Record<number, Array<{ name: string; startTime: string | null; endTime: string | null }>> = {};
    
    for (const schedule of publicSchedule) {
      const weekday = schedule.weekday ?? 0;
      if (!scheduleByDay[weekday]) {
        scheduleByDay[weekday] = [];
      }
      scheduleByDay[weekday].push({
        name: schedule.className ?? "Clase",
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    }

    return NextResponse.json({
      ...academy,
      schedule: scheduleByDay,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/academies/[id]", method: "GET" });
  }
}
