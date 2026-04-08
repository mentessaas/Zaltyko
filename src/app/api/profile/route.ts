import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional().nullable(),
  bio: z.string().max(1000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
});

export async function PATCH(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHENTICATED", "No autenticado", 401);
    }

    const [currentProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!currentProfile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const body = UpdateProfileSchema.parse(await request.json());
    const updates: Record<string, unknown> = {};

    // Actualizar nombre si se proporciona
    if (body.name !== undefined && body.name.trim().length > 0) {
      const trimmedName = body.name.trim();
      if (trimmedName !== currentProfile.name) {
        updates.name = trimmedName;
      }
    }

    // Actualizar email si se proporciona
    if (body.email !== undefined && body.email.trim().length > 0) {
      const trimmedEmail = body.email.trim();
      const currentEmail = user.email;

      if (trimmedEmail !== currentEmail) {
        // Actualizar email en Supabase Auth usando admin client
        // No confirmamos el email automáticamente para requerir verificación
        const adminClient = getSupabaseAdminClient();
        const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
          email: trimmedEmail,
          email_confirm: false, // Requiere verificación
        });

        if (updateError) {
          return apiError("EMAIL_UPDATE_FAILED", updateError.message, 400);
        }

        // Enviar email de verificación
        const { error: verificationError } = await supabase.auth.resend({
          type: "signup",
          email: trimmedEmail,
        });

        if (verificationError) {
          logger.error("Error sending verification email", verificationError);
          // No fallamos si el email de verificación no se puede enviar
          // El usuario puede solicitar uno nuevo desde la UI
        }
      }
    }

    // Actualizar teléfono si se proporciona
    if (body.phone !== undefined) {
      const trimmedPhone = body.phone?.trim() || null;
      if (trimmedPhone !== currentProfile.phone) {
        updates.phone = trimmedPhone;
      }
    }

    // Actualizar biografía si se proporciona
    if (body.bio !== undefined) {
      const trimmedBio = body.bio?.trim() || null;
      if (trimmedBio !== currentProfile.bio) {
        updates.bio = trimmedBio;
      }
    }

    // Actualizar foto de perfil si se proporciona
    if (body.photoUrl !== undefined) {
      const trimmedPhotoUrl = body.photoUrl?.trim() || null;
      if (trimmedPhotoUrl !== currentProfile.photoUrl) {
        updates.photoUrl = trimmedPhotoUrl;
      }
    }

    // Si no hay cambios, retornar error
    if (Object.keys(updates).length === 0 && !body.email) {
      return apiError("NO_CHANGES", "No hay cambios", 400);
    }

    // Actualizar perfil en la base de datos
    const [updatedProfile] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.id, currentProfile.id))
      .returning({
        id: profiles.id,
        userId: profiles.userId,
        name: profiles.name,
        role: profiles.role,
        createdAt: profiles.createdAt,
        phone: profiles.phone,
        bio: profiles.bio,
        photoUrl: profiles.photoUrl,
      });

    // Obtener el email actualizado de Supabase Auth
    const adminClient = getSupabaseAdminClient();
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id);

    return apiSuccess({
      ...updatedProfile,
      email: authUser?.user?.email ?? user.email,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_INPUT", "Entrada inválida", 400);
    }
    logger.error("Error updating profile", error);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
}
