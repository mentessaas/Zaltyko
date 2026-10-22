import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/authz";
import { config } from "@/config";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";

const BodySchema = z.object({
  profileId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  type: z.enum(["email", "notification"]).default("email"),
});
// @service-role auth-admin:read-email. Super-admin messaging needs the target Supabase Auth email.
/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */

export const POST = withSuperAdmin(async (request, context) => {
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_PAYLOAD", "Payload inválido", 400);

  // Get target user profile
  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, body.data.profileId))
    .limit(1);

  if (!targetProfile) {
    return apiError("USER_NOT_FOUND", "User not found", 404);
  }

  const authEmail = await getAuthUserEmail(targetProfile.userId);

  if (!authEmail) {
    return apiError("USER_EMAIL_NOT_FOUND", "User email not found", 400);
  }

  if (body.data.type === "email") {
    try {
      await sendEmailWithLogging({
        to: authEmail,
        subject: body.data.subject,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Mensaje de Zaltyko</h2>
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${escapeHtml(body.data.message).replace(/\n/g, "<br>")}
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Este mensaje fue enviado por el equipo de soporte de Zaltyko.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si tienes alguna pregunta, puedes responder a este correo o contactarnos en ${config.brevo.supportEmail}
            </p>
          </div>
        `,
        text: body.data.message,
        replyTo: config.brevo.supportEmail,
        template: "super-admin-message",
        tenantId: targetProfile.tenantId,
        userId: targetProfile.id,
      });

      return apiSuccess({ ok: true, message: "Correo enviado correctamente" });
    } catch (error: unknown) {
      logger.error("Error sending email", error);
      return apiError("EMAIL_SEND_FAILED", "Error al enviar el correo", 500);
    }
  }

  try {
    await createNotification({
      tenantId: targetProfile.tenantId,
      userId: targetProfile.id,
      type: "super_admin_message",
      title: body.data.subject,
      message: body.data.message,
      data: { source: "super_admin" },
    });
    return apiSuccess({ ok: true, message: "Notificación enviada correctamente" });
  } catch (error: unknown) {
    logger.error("Error creating in-app notification", error);
    return apiError("NOTIFICATION_SEND_FAILED", "Error al enviar la notificación", 500);
  }
});
