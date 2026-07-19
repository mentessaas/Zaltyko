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
import { authUsers } from "@/db/schema/auth-users";
import { profiles } from "@/db/schema/profiles";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";

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
  const template = notification.templateId
    ? await getMessageTemplateById(notification.templateId)
    : null;

  if (!template) {
    throw new Error("Scheduled notification template not found");
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const variables = recipient as Record<string, string>;

      switch (notification.channel) {
        case "in_app":
          await createNotification({
            tenantId: notification.tenantId,
            userId: recipient.userId,
            type: template.templateType,
            title: interpolateTemplate(template.subject || template.name, variables),
            message: interpolateTemplate(template.body, variables),
          });
          break;

        case "push": {
          const result = await sendPushToUser(recipient.userId, {
            title: interpolateTemplate(template.subject || template.name, variables),
            body: interpolateTemplate(template.body, variables),
          });
          if (result.sent === 0 || result.failed > 0) {
            throw new Error("Push notification was not delivered");
          }
          break;
        }

        case "email":
          if (!recipient.email) {
            throw new Error("Recipient has no email address");
          }
          await sendEmail({
            to: recipient.email,
            subject: interpolateTemplate(template.subject || template.name, variables),
            html: `<p>${interpolateTemplate(template.body, variables)}</p>`,
            replyTo: process.env.BREVO_REPLY_TO || "noreply@zaltyko.com",
          });
          break;

        case "whatsapp":
          throw new Error("WhatsApp scheduled delivery is not configured");

        default:
          throw new Error(`Unsupported notification channel: ${notification.channel}`);
      }

      sent++;
    } catch (error) {
      failed++;
      logger.error(`Failed to send ${notification.channel} notification to ${recipient.userId}:`, error);
    }
  }

  return { sent, failed };
}

async function processScheduledNotifications(request: Request) {
  const startedAt = Date.now();
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    logger.info("Scheduled notifications cron started");
    const pending = await getPendingScheduledNotifications();

    if (pending.length === 0) {
      logger.info("Scheduled notifications cron completed", {
        durationMs: Date.now() - startedAt,
        total: 0,
        processed: 0,
        failed: 0,
      });
      return apiSuccess({
        processed: 0,
        message: "No pending notifications",
      });
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
              userId: profiles.userId,
              name: profiles.name,
              email: authUsers.email,
              phone: authUsers.phone,
            })
            .from(profiles)
            .leftJoin(authUsers, eq(authUsers.id, profiles.userId))
            .where(and(
              eq(profiles.tenantId, notification.tenantId),
              inArray(profiles.role, ["owner", "admin"])
            ))
            .limit(10);

          recipients.push(
            ...adminProfiles.map((p) => ({
              userId: p.userId,
              name: p.name || undefined,
              email: p.email || undefined,
              phone: p.phone || undefined,
            }))
          );
        }

        if (recipients.length > 0 && notification.tenantId) {
          const validNotification = notification as typeof notification & { tenantId: string };
          const delivery = await processNotification(validNotification, recipients);
          if (delivery.failed === 0 && delivery.sent === recipients.length) {
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
        await markScheduledNotificationFailed(notification.id);
        failed++;
      }
    }

    logger.info("Scheduled notifications cron completed", {
      durationMs: Date.now() - startedAt,
      total: pending.length,
      processed,
      failed,
    });
    return apiSuccess({
      processed,
      failed,
      total: pending.length,
    });
  } catch (error) {
    logger.error("Error processing scheduled notifications:", error, {
      durationMs: Date.now() - startedAt,
    });
    return apiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }
}


/** Vercel Cron invokes configured routes with GET. */
export async function GET(request: Request) {
  return processScheduledNotifications(request);
}

/** Kept for backwards compatibility with existing internal callers. */
export async function POST(request: Request) {
  return processScheduledNotifications(request);
}
