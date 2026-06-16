export const dynamic = 'force-dynamic';

import { and, eq, count } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventInvitations, profiles, athletes, guardians } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

const createInvitationSchema = z.object({
  email: z.string().email(),
  athleteId: z.string().uuid().optional(),
  guardianId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request: Request, context: { tenantId: string; params: { id: string }; profile?: { id: string } }) => {
  try {
    const { id: eventId } = context.params;

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Get invitations with related info
    const invitations = await db
      .select({
        id: eventInvitations.id,
        tenantId: eventInvitations.tenantId,
        eventId: eventInvitations.eventId,
        athleteId: eventInvitations.athleteId,
        guardianId: eventInvitations.guardianId,
        email: eventInvitations.email,
        status: eventInvitations.status,
        invitedBy: eventInvitations.invitedBy,
        sentAt: eventInvitations.sentAt,
        respondedAt: eventInvitations.respondedAt,
        response: eventInvitations.response,
        createdAt: eventInvitations.createdAt,
        athleteName: athletes.name,
        guardianName: guardians.name,
        invitedByName: profiles.name,
      })
      .from(eventInvitations)
      .leftJoin(athletes, eq(eventInvitations.athleteId, athletes.id))
      .leftJoin(guardians, eq(eventInvitations.guardianId, guardians.id))
      .leftJoin(profiles, eq(eventInvitations.invitedBy, profiles.id))
      .where(eq(eventInvitations.eventId, eventId));

    // Group by status
    const stats = {
      total: invitations.length,
      pending: invitations.filter(i => i.status === "pending").length,
      sent: invitations.filter(i => i.status === "sent").length,
      accepted: invitations.filter(i => i.status === "accepted").length,
      declined: invitations.filter(i => i.status === "declined").length,
      expired: invitations.filter(i => i.status === "expired").length,
    };

    return apiSuccess({
      items: invitations.map(inv => ({
        ...inv,
        athleteName: inv.athleteName ?? undefined,
        guardianName: inv.guardianName ?? undefined,
        invitedByName: inv.invitedByName ?? undefined,
      })),
      stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request: Request, context: { tenantId: string; params: { id: string }; profile?: { id: string } }) => {
  try {
    const { id: eventId } = context.params;
    const body = createInvitationSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id, tenantId: events.tenantId })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Verify athlete exists if provided
    if (body.athleteId) {
      const [athlete] = await db
        .select({ id: athletes.id })
        .from(athletes)
        .where(and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId)))
        .limit(1);

      if (!athlete) {
        return apiError("ATHLETE_NOT_FOUND", "Athlete not found", 404);
      }
    }

    // Verify guardian exists if provided
    if (body.guardianId) {
      const [guardian] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.id, body.guardianId), eq(guardians.tenantId, context.tenantId)))
        .limit(1);

      if (!guardian) {
        return apiError("GUARDIAN_NOT_FOUND", "Guardian not found", 404);
      }
    }

    // Check for existing invitation
    const [existing] = await db
      .select({ id: eventInvitations.id })
      .from(eventInvitations)
      .where(and(
        eq(eventInvitations.eventId, eventId),
        eq(eventInvitations.email, body.email.toLowerCase())
      ))
      .limit(1);

    if (existing) {
      return apiError("INVITATION_EXISTS", "Invitation already exists", 409);
    }

    // Create invitation
    const [invitation] = await db
      .insert(eventInvitations)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        eventId,
        athleteId: body.athleteId ?? null,
        guardianId: body.guardianId ?? null,
        email: body.email.toLowerCase(),
        status: "pending",
        invitedBy: context.profile?.id,
      })
      .returning();

    return apiCreated({ id: invitation.id });
  } catch (error) {
    return handleApiError(error);
  }
});
