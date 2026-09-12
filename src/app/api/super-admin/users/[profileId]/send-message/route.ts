import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/authz";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { escapeHtml } from "@/lib/email/escape-html";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/notification-service";

const BodySchema = z.object({
  profileId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  type: z.enum(["email", "notification"]).default("email"),
});

async function resolveRouteProfileId(context: unknown): Promise<string | null> {
  if (!context || typeof context !== "object") return null;
  const rawParams = (context as { params?: unknown }).params;
  const params =
    rawParams &&
    typeof rawParams === "object" &&
    "then" in rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
      ? await (rawParams as Promise<unknown>)
      : rawParams;

  if (!params || typeof params !== "object") return null;
  const profileId = (params as { profileId?: unknown }).profileId;
  return typeof profileId === "string" ? profileId : null;
}
// @service-role auth-admin:read-email. Super-admin messaging needs the target Supabase Auth email.
/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */

export const POST = withSuperAdmin(async (request, context) => {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("INVALID_JSON", "El cuerpo de la solicitud no es JSON válido", 400);
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
  }
  const body = parsed.data;
  const routeProfileId = await resolveRouteProfileId(context);
  if (routeProfileId && routeProfileId !== body.profileId) {
    return apiError("PROFILE_ID_MISMATCH", "El perfil de la URL no coincide con el perfil solicitado", 400);
  }

  // Get target user profile
  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, body.profileId))
    .limit(1);

  if (!targetProfile) {
    return apiError("USER_NOT_FOUND", "User not found", 404);
  }

  if (body.type === "notification") {
    if (!targetProfile.tenantId) {
      return apiError("USER_TENANT_NOT_FOUND", "User tenant not found", 400);
    }

    try {
      await createNotification({
        tenantId: targetProfile.tenantId,
        userId: targetProfile.id,
        type: "admin_message",
        title: body.subject,
        message: body.message,
        data: { source: "super-admin", channel: "notification" },
      });

      return apiSuccess({ ok: true, message: "Notificación enviada correctamente" });
    } catch (error: unknown) {
      logger.error("Error creating notification", error);
      return apiError("NOTIFICATION_SEND_FAILED", "Error al enviar la notificación", 500);
    }
  }

  const authEmail = await getAuthUserEmail(targetProfile.userId);

  if (!authEmail) {
    return apiError("USER_EMAIL_NOT_FOUND", "User email not found", 400);
  }

  if (body.type === "email") {
    try {
      await sendEmail({
        to: authEmail,
        subject: body.subject,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Mensaje de Zaltyko</h2>
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${escapeHtml(body.message).replace(/\n/g, "<br>")}
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Este mensaje fue enviado por el equipo de soporte de Zaltyko.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si tienes alguna pregunta, puedes responder a este correo o contactarnos en ${config.brevo.supportEmail}
            </p>
          </div>
        `,
        text: body.message,
        replyTo: config.brevo.supportEmail,
      });

      return apiSuccess({ ok: true, message: "Correo enviado correctamente" });
    } catch (error: unknown) {
      logger.error("Error sending email", error);
      return apiError("EMAIL_SEND_FAILED", "Error al enviar el correo", 500);
    }
  }

  return apiError("VALIDATION_ERROR", "Tipo de mensaje no soportado", 400);
});