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
) {
  let template = null;
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
          }
          break;

        case "push":
          if (template) {
            await sendPushToUser(recipient.userId, {
              title: interpolateTemplate(template.subject || template.name, variables),
              body: interpolateTemplate(template.body, variables),
            });
          }
          break;

        case "email":
          if (template && recipient.email) {
            await sendEmail({
              to: recipient.email,
              subject: interpolateTemplate(template.subject || template.name, variables),
              html: `<p>${interpolateTemplate(template.body, variables)}</p>`,
              replyTo: process.env.EMAIL_FROM || "noreply@zaltyko.com",
            });
          }
          break;

        case "whatsapp":
          // WhatsApp would be processed here
          // For now, just log it
          logger.info(`WhatsApp notification for ${recipient.phone}: ${template?.body}`);
          break;
      }
    } catch (error) {
      logger.error(`Failed to send ${notification.channel} notification to ${recipient.userId}:`, error);
    }
  }
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
              id: profiles.id,
              name: profiles.name,
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
            }))
          );
        }

        if (recipients.length > 0 && notification.tenantId) {
          const validNotification = notification as typeof notification & { tenantId: string };
          await processNotification(validNotification, recipients);
          await markScheduledNotificationSent(notification.id);
          processed++;
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
