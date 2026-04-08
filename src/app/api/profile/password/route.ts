import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
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

    const body = ChangePasswordSchema.parse(await request.json());

    // Verificar contraseña actual
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: body.currentPassword,
    });

    if (signInError) {
      return apiError("INVALID_CURRENT_PASSWORD", "La contraseña actual es incorrecta", 400);
    }

    // Actualizar contraseña
    const { error: updateError } = await supabase.auth.updateUser({
      password: body.newPassword,
    });

    if (updateError) {
      return apiError("PASSWORD_UPDATE_FAILED", updateError.message, 400);
    }

    return apiSuccess({ ok: true, message: "Contraseña actualizada correctamente" });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_INPUT", "Entrada inválida", 400);
    }
    logger.error("Error updating password:", error);
    return apiError("INTERNAL_ERROR", error.message, 500);
  }
}
