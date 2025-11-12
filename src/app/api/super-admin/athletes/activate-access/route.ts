import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";

const ActivateAthleteSchema = z.object({
  profileId: z.string().uuid(),
  email: z.string().email().optional(),
  sendInvitation: z.boolean().default(true),
});

/**
 * Función para activar acceso de un atleta
 */
export async function activateAthleteAccess(
  profileId: string,
  email?: string,
  sendInvitation: boolean = true
): Promise<{ ok: boolean; userId: string; email: string; error?: string }> {
  const adminClient = getSupabaseAdminClient();

  // Obtener el perfil del atleta
  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      role: profiles.role,
      tenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      canLogin: profiles.canLogin,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    return { ok: false, userId: "", email: "", error: "PROFILE_NOT_FOUND" };
  }

  if (profile.role !== "athlete") {
    return { ok: false, userId: "", email: "", error: "NOT_AN_ATHLETE" };
  }

  // Obtener el usuario de auth
  const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(profile.userId);

  if (authError || !authUser?.user) {
    return { ok: false, userId: profile.userId, email: "", error: "AUTH_USER_NOT_FOUND" };
  }

  const targetEmail = email ?? authUser.user.email ?? "";

  if (!targetEmail) {
    return { ok: false, userId: profile.userId, email: "", error: "EMAIL_REQUIRED" };
  }

  // Actualizar el email del usuario si es diferente
  if (targetEmail !== authUser.user.email) {
    await adminClient.auth.admin.updateUserById(profile.userId, {
      email: targetEmail,
      email_confirm: true,
    });
  }

  // Activar canLogin en el perfil
  await db
    .update(profiles)
    .set({ canLogin: true })
    .where(eq(profiles.id, profileId));

  // Enviar correo de invitación si se solicita
  if (sendInvitation) {
    try {
      // Generar token de reset de contraseña
      const { data: resetData } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
      });

      const resetLink = resetData?.properties?.action_link ?? `${config.appUrl}/auth/reset-password`;
      
      await sendEmail({
        to: targetEmail,
        subject: "Activa tu cuenta de atleta - Zaltyko",
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">¡Bienvenido a Zaltyko!</h2>
            <p>Hola ${profile.name ?? "Atleta"},</p>
            <p>Tu cuenta de atleta ha sido activada. Ahora puedes acceder a tu perfil y ver tus clases, sesiones y evaluaciones.</p>
            <p>Para comenzar, necesitas establecer una contraseña. Haz clic en el siguiente enlace:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #0D47A1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
                Establecer contraseña
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Si no solicitaste esta activación, puedes ignorar este correo.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si tienes alguna pregunta, contacta a tu academia o a nuestro equipo de soporte en ${config.mailgun.supportEmail}
            </p>
          </div>
        `,
        text: `Tu cuenta de atleta ha sido activada. Visita ${resetLink} para establecer tu contraseña.`,
        replyTo: config.mailgun.supportEmail,
      });
    } catch (emailError) {
      console.error("Error enviando correo de activación:", emailError);
      // No fallar si el correo no se puede enviar
    }
  }

  return {
    ok: true,
    userId: profile.userId,
    email: targetEmail,
  };
}

/**
 * Endpoint para activar acceso de un atleta
 * POST /api/super-admin/athletes/activate-access
 */
export const POST = withSuperAdmin(async (request) => {
  const body = ActivateAthleteSchema.parse(await request.json());

  try {
    const result = await activateAthleteAccess(
      body.profileId,
      body.email,
      body.sendInvitation
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: getErrorMessage(result.error),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Acceso de atleta activado correctamente",
      userId: result.userId,
      email: result.email,
    });
  } catch (error: any) {
    console.error("Error activando acceso de atleta:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "ACTIVATION_FAILED",
        message: error?.message ?? "Error al activar acceso del atleta",
      },
      { status: 500 }
    );
  }
});

function getErrorMessage(error?: string): string {
  switch (error) {
    case "PROFILE_NOT_FOUND":
      return "Perfil de atleta no encontrado";
    case "NOT_AN_ATHLETE":
      return "El perfil no corresponde a un atleta";
    case "AUTH_USER_NOT_FOUND":
      return "Usuario de autenticación no encontrado";
    case "EMAIL_REQUIRED":
      return "Se requiere un correo electrónico para activar el acceso";
    default:
      return "Error desconocido";
  }
}
