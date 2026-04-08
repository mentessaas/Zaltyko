import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences, profiles } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  emailNotifications: z.record(z.boolean()).optional(),
});

export const PUT = async (request: Request) => {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const body = updateSchema.parse(await request.json());

    // Obtener preferencias actuales
    const [currentPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id as any))
      .limit(1);

    const updatedEmailNotifications = currentPrefs?.emailNotifications
      ? { ...currentPrefs.emailNotifications, ...body.emailNotifications }
      : body.emailNotifications || {};

    if (currentPrefs) {
      // Actualizar preferencias existentes
      await db
        .update(userPreferences)
        .set({
          emailNotifications: updatedEmailNotifications,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, profile.id as any));
    } else {
      // Crear nuevas preferencias
      await db.insert(userPreferences).values({
        userId: profile.id as any,
        tenantId: profile.tenantId as any,
        emailNotifications: updatedEmailNotifications,
      });
    }

    return apiSuccess({ ok: true });
  } catch (error: any) {
    console.error("Error updating email preferences:", error);
    return apiError("UPDATE_FAILED", error.message, 500);
  }
};

export const GET = async (request: Request) => {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const [prefs] = await db
      .select({
        emailNotifications: userPreferences.emailNotifications,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id as any))
      .limit(1);

    return apiSuccess({
      emailNotifications: prefs?.emailNotifications || {},
    });
  } catch (error: any) {
    console.error("Error fetching email preferences:", error);
    return apiError("FETCH_FAILED", error.message, 500);
  }
};
