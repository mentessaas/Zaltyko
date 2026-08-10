import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { checkPwnedPassword } from "@/lib/security/pwned-password";

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

    // Defense-in-depth: rechazar contraseñas comprometidas ANTES de tocar
    // Supabase. El formulario cliente también las rechaza, pero un cliente
    // arbitrario puede saltarse esa validación y llegar aquí con un body
    // construido a mano. HIBP (k-anonymity) sólo envía el prefijo de 5
    // caracteres del hash — la contraseña completa nunca sale del proceso.
    const pwned = await checkPwnedPassword(body.newPassword);
    if (pwned.pwned) {
      return apiError(
        "PASSWORD_PWNED",
        "Esta contraseña aparece en filtraciones públicas conocidas. Elige otra contraseña para mantener tu cuenta segura.",
        400
      );
    }
    if (pwned.unavailable) {
      // Fail-open: la API externa estaba caída. Log para que el equipo de
      // seguridad pueda alertar, pero no bloqueamos al usuario.
      logger.warn("HIBP password check unavailable; allowing password change");
    }

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
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_INPUT", "Entrada inválida", 400);
    }
    logger.error("Error updating password:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}
