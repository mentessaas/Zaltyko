import {
  getPendingScheduledNotifications,
  markScheduledNotificationFailed,
  markScheduledNotificationSent,
} from "@/lib/communication-service";
import { getMessageTemplateById } from "@/lib/communication-service";
import { sendPushToUser } from "@/lib/notifications/push-service";
import { createNotification } from "@/lib/notifications/notification-service";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { db } from "@/db";
import { profiles } from "@/db/schema/profiles";
import { athletes, groupAthletes, groups } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { escapeHtml } from "@/lib/email/escape-html";
import { runCronWithLease } from "@/lib/cron-lease";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";

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
    academyId?: string | null;
  },
  recipients: Array<{ userId: string; email?: string; name?: string; phone?: string }>
): Promise<{ sent: number; skipped: number; failed: number }> {
  let template = null;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  if (notification.templateId) {
    template = await getMessageTemplateById(notification.templateId, {
      tenantId: notification.tenantId,
      academyId: notification.academyId,
    });
  }

  for (const recipient of recipients) {
    try {
      const variables = recipient as Record<string, string>;

      switch (notification.channel) {
        case "in_app":
          if (template) {
            const created = await createNotification({
              tenantId: notification.tenantId,
              userId: recipient.userId,
              type: template.templateType,
              title: interpolateTemplate(template.subject || template.name, variables),
              message: interpolateTemplate(template.body, variables),
            });
            if (created) sent++;
            else skipped++;
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
            const delivered = await sendEmailWithLogging({
              to: recipient.email,
              subject: interpolateTemplate(template.subject || template.name, variables),
              html: `<p>${escapeHtml(interpolateTemplate(template.body, variables))}</p>`,
              template: `scheduled_notification:${notification.id}`,
              tenantId: notification.tenantId,
              academyId: notification.academyId ?? undefined,
              userId: recipient.userId,
              profileId: recipient.userId,
              notificationType: template.templateType,
              dedupeKey: `scheduled_notification:${notification.id}:${recipient.email.toLowerCase()}`,
            });
            if (delivered) sent++;
            else skipped++;
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
  return { sent, skipped, failed };
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
        // Resolver destinatarios desde el grupo o, para avisos internos,
        // desde los perfiles de administración del tenant.
        const recipients: Array<{ userId: string; email?: string; name?: string }> = [];

        if (!notification.tenantId) {
          await markScheduledNotificationFailed(notification.id);
          failed++;
          continue;
        }

        if (notification.groupId) {
          // Resolver los destinatarios reales del grupo, siempre dentro de la
          // academia/tenant de la notificación. Antes esta rama dejaba la
          // lista vacía y marcaba cualquier programación por grupo como fallida.
          const members = await db
            .select({ profileId: profiles.id, userId: profiles.userId, name: profiles.name })
            .from(groupAthletes)
            .innerJoin(groups, and(
              eq(groups.id, groupAthletes.groupId),
              eq(groups.tenantId, notification.tenantId),
              notification.academyId ? eq(groups.academyId, notification.academyId) : undefined,
            ))
            .innerJoin(athletes, and(eq(athletes.id, groupAthletes.athleteId), eq(athletes.tenantId, notification.tenantId)))
            .innerJoin(profiles, eq(profiles.userId, athletes.userId))
            .where(and(eq(groupAthletes.groupId, notification.groupId), eq(groupAthletes.tenantId, notification.tenantId)))
            .limit(500);
          const resolved = await Promise.all(members.map(async (member) => ({
            userId: member.profileId,
            name: member.name || undefined,
            email: (await getAuthUserEmail(member.userId)) ?? undefined,
          })));
          recipients.push(...resolved);
        } else if (notification.templateId && notification.tenantId) {
          // Get admin users of the tenant
            const adminProfiles = await db
            .select({
              id: profiles.id,
              name: profiles.name,
              userId: profiles.userId,
            })
            .from(profiles)
            .where(and(
              eq(profiles.tenantId, notification.tenantId),
              inArray(profiles.role, ["owner", "admin"])
            ))
            .limit(10);

          const adminRecipients = await Promise.all(
            adminProfiles.map(async (profile) => {
              const profileWithTestEmail = profile as typeof profile & { email?: string | null };
              return {
                userId: profile.id,
                name: profile.name || undefined,
                email:
                  profileWithTestEmail.email !== undefined
                    ? profileWithTestEmail.email ?? undefined
                    : profile.userId
                      ? (await getAuthUserEmail(profile.userId)) ?? undefined
                      : undefined,
              };
            })
          );
          recipients.push(...adminRecipients);
        }

        if (recipients.length > 0 && notification.tenantId) {
          const validNotification = notification as typeof notification & { tenantId: string };
          const delivery = await processNotification(validNotification, recipients);
          if ((delivery.sent > 0 || delivery.skipped > 0) && delivery.failed === 0) {
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
