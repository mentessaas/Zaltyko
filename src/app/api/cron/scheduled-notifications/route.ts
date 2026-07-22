import {
  getPendingScheduledNotifications,
  markScheduledNotificationFailed,
  markScheduledNotificationSent,
} from "@/lib/communication-service";
import { getMessageTemplateById } from "@/lib/communication-service";
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendEmail } from "@/lib/brevo";
import { db } from "@/db";
import { profiles } from "@/db/schema/profiles";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { escapeHtml } from "@/lib/email/escape-html";
import { runCronWithLease } from "@/lib/cron-lease";

export const dynamic = 'force-dynamic';

function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

async function processNotification(
  notification: {
    id: string;
    tenantId: string;
    channel: string;
    templateId: string | null;
    groupId: string | null;
  },
  recipients: Array<{ userId: string; email?: string; name?: string; phone?: string }>
): Promise<{ sent: number; failed: number }> {
  let template = null;
  let sent = 0;
  let failed = 0;
  if (notification.templateId) {
    template = await getMessageTemplateById(notification.templateId);
  }

  for (const recipient of recipients) {
    try {
      const variables = recipient as Record<string, string>;

      switch (notification.channel) {
        case "in_app":
          if (template) {
            await createNotification({
              tenantId: notification.tenantId,
              userId: recipient.userId,
              type: template.templateType,
              title: interpolateTemplate(template.subject || template.name, variables),
              message: interpolateTemplate(template.body, variables),
            });
            sent++;
          }
          break;

        case "push":
          if (template) {
            await sendPushToUser(recipient.userId, {
              title: interpolateTemplate(template.subject || template.name, variables),
              body: interpolateTemplate(template.body, variables),
            });
            sent++;
          }
          break;

        case "email":
          if (template && recipient.email) {
            await sendEmail({
              to: recipient.email,
              subject: interpolateTemplate(template.subject || template.name, variables),
              html: `<p>${escapeHtml(interpolateTemplate(template.body, variables))}</p>`,
              replyTo: process.env.BREVO_REPLY_TO || "soporte@zaltyko.com",
            });
            sent++;
          }
          break;

        case "whatsapp":
          // Canal no activo: nunca registrar teléfono ni cuerpo del mensaje.
          failed++;
          break;
      }
    } catch (error) {
      failed++;
      logger.error("Failed to send scheduled notification", error, {
        notificationId: notification.id,
        channel: notification.channel,
      });
    }
  }
  return { sent, failed };
}

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const execution = await runCronWithLease("cron:scheduled-notifications", async () => {
      const pending = await getPendingScheduledNotifications();

      if (pending.length === 0) {
        return { processed: 0, failed: 0, total: 0 };
      }

      let processed = 0;
      let failed = 0;

      for (const notification of pending) {
      try {
        // For now, get recipients from the notification's group or a default
        // In a full implementation, you'd query the group members
        const recipients: Array<{ userId: string; email?: string; name?: string }> = [];

        if (notification.groupId) {
          // Query group members - placeholder
          // In reality, you'd have a junction table for group members
        } else if (notification.templateId && notification.tenantId) {
          // Get admin users of the tenant
          const adminProfiles = await db
            .select({
              id: profiles.id,
              name: profiles.name,
              email: profiles.email,
            })
            .from(profiles)
            .where(and(
              eq(profiles.tenantId, notification.tenantId),
              inArray(profiles.role, ["owner", "admin"])
            ))
            .limit(10);

          recipients.push(
            ...adminProfiles.map((p) => ({
              userId: p.id,
              name: p.name || undefined,
              email: p.email || undefined,
            }))
          );
        }

        if (recipients.length > 0 && notification.tenantId) {
          const validNotification = notification as typeof notification & { tenantId: string };
          const delivery = await processNotification(validNotification, recipients);
          if (delivery.sent > 0 && delivery.failed === 0) {
            await markScheduledNotificationSent(notification.id);
            processed++;
          } else {
            await markScheduledNotificationFailed(notification.id);
            failed++;
          }
        } else {
          // A schedule with no resolved recipients must not look delivered.
          await markScheduledNotificationFailed(notification.id);
          failed++;
        }
      } catch (error) {
        logger.error(`Failed to process scheduled notification ${notification.id}:`, error);
        failed++;
      }
      }

      return { processed, failed, total: pending.length };
    });

    if (!execution.acquired) {
      return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
    }
    return apiSuccess(execution.value);
  } catch (error) {
    logger.error("Error processing scheduled notifications:", error);
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}

// Vercel Cron invoca los paths configurados mediante GET. Mantener POST permite
// disparos operativos explícitos con el mismo contrato de autenticación.
export const GET = POST;
