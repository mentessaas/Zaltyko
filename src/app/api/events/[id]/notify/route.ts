import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventRegistrations, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { getAuthUserEmail } from "@/lib/supabase/admin-operations";
import { escapeHtml } from "@/lib/email/escape-html";

export const dynamic = 'force-dynamic';

const notifySchema = z.object({
  message: z.string().min(1),
  type: z.enum(["registration_opened", "registration_closed", "event_cancelled", "event_updated", "general"]).default("general"),
  sendTo: z.enum(["all", "registered", "waitlisted"]).default("all"),
});

export const POST = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };
    const body = notifySchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({
        id: events.id,
        title: events.title,
        tenantId: events.tenantId,
        academyId: events.academyId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    const capability = await authorizeAcademyCapability({
      context,
      resourceTenantId: eventRow.tenantId,
      academyId: eventRow.academyId,
      permission: "events:update",
    });
    if (!capability.allowed) {
      return apiError("FORBIDDEN", "No tienes permiso para notificar este evento", 403);
    }

    // Get recipients based on sendTo filter
    const recipients: { profileId: string; status: string }[] = [];

    if (body.sendTo === "all" || body.sendTo === "registered") {
      const registered = await db
        .select({
          profileId: eventRegistrations.profileId,
          status: eventRegistrations.status,
        })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.tenantId, eventRow.tenantId),
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "confirmed")
        ))
        .limit(5000);
      recipients.push(...registered);
    }

    if (body.sendTo === "all" || body.sendTo === "waitlisted") {
      // Note: eventWaitlist status is stored differently, need to check schema
      // For now, include all registrations with waitlisted status
      const waitlisted = await db
        .select({
          profileId: eventRegistrations.profileId,
          status: eventRegistrations.status,
        })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.tenantId, eventRow.tenantId),
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "waitlisted")
        ))
        .limit(5000);
      recipients.push(...waitlisted);
    }

    // Remove duplicates based on profileId
    const uniqueRecipients = recipients.filter(
      (recipient, index, self) =>
        index === self.findIndex((r) => r.profileId === recipient.profileId)
    );

    // Resolve auth emails server-side; profile.userId is an auth identifier,
    // never an email address.
    const profileIds = uniqueRecipients.map((r) => r.profileId);
    const profileRows = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        userId: profiles.userId,
      })
      .from(profiles)
      .where(and(
        eq(profiles.tenantId, eventRow.tenantId),
        inArray(profiles.id, profileIds)
      ))
      .limit(5000);

    let sent = 0;
    let failed = 0;
    for (const profile of profileRows) {
      const email = await getAuthUserEmail(profile.userId);
      if (!email) {
        failed++;
        continue;
      }
      const delivered = await sendEmailWithLogging({
        to: email,
        subject: `${eventRow.title}: ${body.type.replaceAll("_", " ")}`,
        html: `<p>${escapeHtml(body.message)}</p>`,
        template: `event_notification:${eventId}`,
        tenantId: eventRow.tenantId,
        academyId: eventRow.academyId,
        userId: profile.id,
        profileId: profile.id,
        notificationType: "event",
        dedupeKey: `event-notification:${eventId}:${body.type}:${profile.id}:${body.message}`,
      });
      if (delivered) sent++;
    }

    logger.info("Event notification processed", {
      eventId,
      eventTitle: eventRow.title,
      notificationType: body.type,
      sendTo: body.sendTo,
      recipientCount: uniqueRecipients.length,
      sent,
      failed,
    });

    return apiSuccess({
      ok: true,
      message: "Notification processed",
      recipientCount: uniqueRecipients.length,
      sent,
      failed,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
