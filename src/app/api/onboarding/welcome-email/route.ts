import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/config";
import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { isAcademyBlockedFromSending } from "@/lib/academy-status";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
    }

    const { academyId } = body.data;
    const userId = user.id;

    if (body.data.userId !== userId) {
      return apiError("FORBIDDEN", "No puedes enviar un correo para otra cuenta", 403);
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    // La academia debe estar vinculada a la sesión actual. No basta con que
    // el academyId exista: el endpoint no puede convertirse en un emisor
    // arbitrario contra academias de otro tenant.
    const [academy] = await db
      .select({ name: academies.name, tenantId: academies.tenantId })
      .from(academies)
      .innerJoin(
        memberships,
        and(
          eq(memberships.academyId, academies.id),
          eq(memberships.userId, userId)
        )
      )
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return apiError("FORBIDDEN", "No tienes acceso a esta academia", 403);
    }

    const academyName = academy.name || "tu academia";
    const displayName = profile.name || "Usuario";
    const safeAcademyName = escapeHtml(academyName);
    const safeDisplayName = escapeHtml(displayName);

    const eligibility = await isAcademyBlockedFromSending(academyId);
    if (eligibility.blocked) {
      return apiError(
        "ACADEMY_EMAIL_BLOCKED",
        "La academia no puede recibir este email en su estado actual",
        409
      );
    }

    // Enviar email de bienvenida
    if (!user.email) {
      return apiError("EMAIL_NOT_AVAILABLE", "La cuenta no tiene un correo verificable", 400);
    }

    const delivered = await sendEmailWithLogging({
      to: user.email,
      subject: `Bienvenido a Zaltyko, ${displayName}!`,
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
              Hola <strong>${safeDisplayName}</strong>,
            </p>

            <p style="font-size: 16px; margin-bottom: 20px;">
              ¡Nos alegra tenerte en Zaltyko! Tu academia <strong>${safeAcademyName}</strong> está lista para comenzar.
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0D47A1;">
              <h2 style="color: #0D47A1; margin-top: 0; font-size: 20px;">Próximos pasos recomendados:</h2>
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
              ¡Que tengas un excelente día!<br>
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

¡Nos alegra tenerte en Zaltyko! Tu academia ${academyName} está lista para comenzar.

Próximos pasos recomendados:
- Crea tu primer grupo de entrenamiento
- Añade atletas a tu academia
- Invita a tus entrenadores
- Configura tus métodos de pago

Accede a tu dashboard: ${config.appUrl}/app/${academyId}/dashboard

Si tienes alguna pregunta, contacta a ${config.brevo.supportEmail}

¡Que tengas un excelente día!
El equipo de Zaltyko
      `,
      replyTo: config.brevo.supportEmail,
      template: "academy-welcome",
      tenantId: academy.tenantId,
      academyId,
      userId: profile.id,
      dedupeKey: `academy-welcome:${academyId}:${userId}`,
    });

    return apiSuccess({ ok: delivered, message: delivered ? "Email de bienvenida enviado" : "El email ya fue enviado o no está disponible" });
  } catch (error: unknown) {
    logger.error("Error sending welcome email", error);
    return apiError("EMAIL_SEND_FAILED", "Error al enviar el email de bienvenida", 500);
  }
}
