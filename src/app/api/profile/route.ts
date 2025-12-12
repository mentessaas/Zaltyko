import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const [currentProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!currentProfile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
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
          return NextResponse.json(
            { error: "EMAIL_UPDATE_FAILED", message: updateError.message },
            { status: 400 }
          );
        }

        // Enviar email de verificación
        const { error: verificationError } = await supabase.auth.resend({
          type: "signup",
          email: trimmedEmail,
        });

        if (verificationError) {
          console.error("Error sending verification email:", verificationError);
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
      return NextResponse.json({ error: "NO_CHANGES" }, { status: 400 });
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

    return NextResponse.json({
      ...updatedProfile,
      email: authUser?.user?.email ?? user.email,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_INPUT", details: error.errors }, { status: 400 });
    }
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message }, { status: 500 });
  }
}

