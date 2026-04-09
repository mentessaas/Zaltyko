import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { db } from "@/db";
import { profiles, academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.safeParse(await request.json());

    if (!body.success) {
      return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
    }

    const { academyId, userId } = body.data;

    // Obtener usuario y perfil
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    // Obtener información de la academia
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    const academyName = academy?.name || "tu academia";

    // Enviar email de bienvenida
    await sendEmail({
      to: user.email!,
      subject: `Bienvenido a Zaltyko, ${profile.name || "Usuario"}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0D47A1 0%, #1976D2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Bienvenido a Zaltyko!</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Hola <strong>${profile.name || "Usuario"}</strong>,
            </p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              Estamos emocionados de tenerte en Zaltyko! Tu academia <strong>${academyName}</strong> está lista para comenzar.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0D47A1;">
              <h2 style="color: #0D47A1; margin-top: 0; font-size: 20px;">Proximos pasos recomendados:</h2>
              <ul style="list-style: none; padding: 0;">
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  ✓ Crea tu primer grupo de entrenamiento
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  ✓ Añade atletas a tu academia
                </li>
                <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                  ✓ Invita a tus entrenadores
                </li>
                <li style="padding: 8px 0;">
                  ✓ Configura tus métodos de pago
                </li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${config.appUrl}/app/${academyId}/dashboard"
                 style="display: inline-block; background: #0D47A1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Ir a mi dashboard
              </a>
            </div>

            <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #1565c0;">
                <strong>Tip:</strong> Completa el checklist de onboarding para aprovechar al máximo todas las funcionalidades de Zaltyko.
              </p>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Si tienes alguna pregunta, no dudes en contactarnos en
              <a href="mailto:${config.brevo.supportEmail}" style="color: #0D47A1;">${config.brevo.supportEmail}</a>
            </p>

            <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
              Que tengas un excelente dia!<br>
              <strong>El equipo de Zaltyko</strong>
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #9ca3af;">
              Este es un correo automático. Por favor no respondas a este mensaje.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
Bienvenido a Zaltyko!

Hola ${profile.name || "Usuario"},

Estamos emocionados de tenerte en Zaltyko! Tu academia ${academyName} está lista para comenzar.

Proximos pasos recomendados:
- Crea tu primer grupo de entrenamiento
- Añade atletas a tu academia
- Invita a tus entrenadores
- Configura tus métodos de pago

Accede a tu dashboard: ${config.appUrl}/app/${academyId}/dashboard

Si tienes alguna pregunta, contacta a ${config.brevo.supportEmail}

Que tengas un excelente dia!
El equipo de Zaltyko
      `,
      replyTo: config.brevo.supportEmail,
    });

    return apiSuccess({ ok: true, message: "Email de bienvenida enviado" });
  } catch (error: any) {
    logger.error("Error sending welcome email", error);
    return apiError("EMAIL_SEND_FAILED", error?.message ?? "Error al enviar el email", 500);
  }
}
