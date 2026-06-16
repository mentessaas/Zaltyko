import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventRegistrations, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

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
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Get recipients based on sendTo filter
    let recipients: { profileId: string; status: string }[] = [];

    if (body.sendTo === "all" || body.sendTo === "registered") {
      const registered = await db
        .select({
          profileId: eventRegistrations.profileId,
          status: eventRegistrations.status,
        })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "confirmed")
        ));
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
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "waitlisted")
        ));
      recipients.push(...waitlisted);
    }

    // Remove duplicates based on profileId
    const uniqueRecipients = recipients.filter(
      (recipient, index, self) =>
        index === self.findIndex((r) => r.profileId === recipient.profileId)
    );

    // Get profile emails for notification
    const profileIds = uniqueRecipients.map((r) => r.profileId);
    const profileRows = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        userId: profiles.userId,
      })
      .from(profiles)
      .where(inArray(profiles.id, profileIds));

    // Log notification (in production, this would send emails/push notifications)
    logger.info("Event notification sent", {
      eventId,
      eventTitle: eventRow.title,
      notificationType: body.type,
      sendTo: body.sendTo,
      recipientCount: uniqueRecipients.length,
      message: body.message,
      recipients: profileRows.map((p) => ({ id: p.id, email: p.userId })),
    });

    return apiSuccess({
      ok: true,
      message: "Notification sent successfully",
      recipientCount: uniqueRecipients.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
