"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

const ToggleVisibilitySchema = z.object({
  academyId: z.string().uuid(),
  isPublic: z.boolean(),
});

export type ToggleVisibilityInput = z.infer<typeof ToggleVisibilitySchema>;

export type ToggleVisibilityResult = {
  success: boolean;
  error?: string;
};

/**
 * Server action para activar/desactivar visibilidad pública de una academia
 * Solo accesible por super_admin
 * 
 * @param input - Datos para cambiar visibilidad
 * @returns Resultado de la operación
 */
export async function toggleAcademyVisibility(
  input: ToggleVisibilityInput
): Promise<ToggleVisibilityResult> {
  const parsed = ToggleVisibilitySchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
    };
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return {
      success: false,
      error: "UNAUTHENTICATED",
    };
  }

  const profile = await getCurrentProfile(user.id);
  if (!profile) {
    return {
      success: false,
      error: "PROFILE_NOT_FOUND",
    };
  }

  // Solo super_admin puede cambiar visibilidad
  if (profile.role !== "super_admin") {
    return {
      success: false,
      error: "FORBIDDEN",
    };
  }

  const { academyId, isPublic } = parsed.data;

  try {
    // Verificar que la academia existe
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return {
        success: false,
        error: "ACADEMY_NOT_FOUND",
      };
    }

    // Actualizar visibilidad
    await db
      .update(academies)
      .set({ isPublic })
      .where(eq(academies.id, academyId));

    // Revalidar rutas públicas
    revalidatePath("/academias");
    revalidatePath(`/academias/${academyId}`);
    revalidatePath("/super-admin/academies/public");

    return {
      success: true,
    };
  } catch (error: any) {
    console.error("Error toggling academy visibility:", error);
    return {
      success: false,
      error: error.message ?? "Error al cambiar visibilidad",
    };
  }
}

