export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventInvitations } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

const updateInvitationSchema = z.object({
  status: z.enum(["pending", "sent", "accepted", "declined", "expired"]).optional(),
  response: z.string().optional(),
});

export const GET = withTenant(async (request: Request, context: { tenantId: string; params: { id: string; invitationId: string } }) => {
  try {
    const { id: eventId, invitationId } = context.params;

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Get invitation
    const [invitation] = await db
      .select()
      .from(eventInvitations)
      .where(and(
        eq(eventInvitations.id, invitationId),
        eq(eventInvitations.eventId, eventId)
      ))
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(invitation);
  } catch (error) {
    return handleApiError(error);
  }
});

export const PATCH = withTenant(async (request: Request, context: { tenantId: string; params: { id: string; invitationId: string } }) => {
  try {
    const { id: eventId, invitationId } = context.params;
    const body = updateInvitationSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Verify invitation exists and belongs to event
    const [existing] = await db
      .select({ id: eventInvitations.id })
      .from(eventInvitations)
      .where(and(
        eq(eventInvitations.id, invitationId),
        eq(eventInvitations.eventId, eventId)
      ))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, any> = {};

    if (body.status) {
      updateData.status = body.status;

      // Set timestamps based on status
      if (body.status === "sent") {
        updateData.sentAt = new Date();
      } else if (body.status === "accepted" || body.status === "declined") {
        updateData.respondedAt = new Date();
        updateData.response = body.response ?? null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    const [updated] = await db
      .update(eventInvitations)
      .set(updateData)
      .where(and(
        eq(eventInvitations.id, invitationId),
        eq(eventInvitations.eventId, eventId)
      ))
      .returning();

    return NextResponse.json({ ok: true, invitation: updated });
  } catch (error) {
    return handleApiError(error);
  }
});

export const DELETE = withTenant(async (request: Request, context: { tenantId: string; params: { id: string; invitationId: string } }) => {
  try {
    const { id: eventId, invitationId } = context.params;

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Delete invitation
    await db
      .delete(eventInvitations)
      .where(and(
        eq(eventInvitations.id, invitationId),
        eq(eventInvitations.eventId, eventId)
      ));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
