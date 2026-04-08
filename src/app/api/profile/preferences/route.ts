import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const UpdatePreferencesSchema = z.object({
  timezone: z.string().optional(),
  language: z.string().optional(),
  emailNotifications: z.record(z.boolean()).optional(),
});

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const body = UpdatePreferencesSchema.parse(await request.json());
    const updates: Record<string, unknown> = {};

    if (body.timezone !== undefined) {
      updates.timezone = body.timezone;
    }

    if (body.language !== undefined) {
      updates.language = body.language;
    }

    if (body.emailNotifications !== undefined) {
      updates.emailNotifications = body.emailNotifications;
    }

    if (Object.keys(updates).length === 0) {
      return apiError("NO_CHANGES", "No hay cambios", 400);
    }

    updates.updatedAt = new Date();

    await db
      .insert(userPreferences)
      .values({
        userId: profile.id as any,
        tenantId: profile.tenantId as any,
        ...updates,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: updates,
      });

    const [updated] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id as any))
      .limit(1);

    return apiSuccess(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_INPUT", "Entrada inválida", 400);
    }
    logger.error("Error updating preferences:", error);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, profile.id as any))
      .limit(1);

    return apiSuccess(preferences || null);
  } catch (error: any) {
    logger.error("Error fetching preferences:", error);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
}
