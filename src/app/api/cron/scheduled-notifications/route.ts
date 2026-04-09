import { NextResponse } from "next/server";
import { getPendingScheduledNotifications, markScheduledNotificationSent } from "@/lib/communication-service";
import { getMessageTemplateById } from "@/lib/communication-service";
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendEmail } from "@/lib/mailgun";
import { db } from "@/db";
import { profiles } from "@/db/schema/profiles";
import { academies } from "@/db/schema/academies";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

interface ScheduledNotificationData {
  tenantId: string;
  templateId: string | null;
  channel: string;
  groupId: string | null;
  userId?: string;
  userEmail?: string;
  userName?: string;
  variables?: Record<string, string>;
}

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

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const pending = await getPendingScheduledNotifications();

    if (pending.length === 0) {
      return NextResponse.json({
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
        } else if (notification.templateId) {
          // Get admin users of the tenant
          const adminProfiles = await db
            .select({
              id: profiles.id,
              name: profiles.name,
            })
            .from(profiles)
            .where(notification.tenantId ? eq(profiles.tenantId, notification.tenantId) : undefined)
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
          // No recipients, mark as sent anyway
          await markScheduledNotificationSent(notification.id);
        }
      } catch (error) {
        logger.error(`Failed to process scheduled notification ${notification.id}:`, error);
        failed++;
      }
    }

    return NextResponse.json({
      processed,
      failed,
      total: pending.length,
    });
  } catch (error) {
    logger.error("Error processing scheduled notifications:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
