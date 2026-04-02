import { NextResponse } from "next/server";
import { and, eq, count } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventWaitlist, eventRegistrations, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (_request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id, allowWaitlist: events.allowWaitlist, waitlistMaxSize: events.waitlistMaxSize })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Get waitlist entries with profile info
    const waitlistEntries = await db
      .select({
        id: eventWaitlist.id,
        profileId: eventWaitlist.profileId,
        profileName: profiles.name,
        profileEmail: profiles.userId,
        position: eventWaitlist.position,
        addedAt: eventWaitlist.addedAt,
      })
      .from(eventWaitlist)
      .leftJoin(profiles, eq(eventWaitlist.profileId, profiles.id))
      .where(eq(eventWaitlist.eventId, eventId))
      .orderBy(eventWaitlist.position);

    return apiSuccess({
      items: waitlistEntries,
      total: waitlistEntries.length,
      maxSize: eventRow.waitlistMaxSize,
      allowWaitlist: eventRow.allowWaitlist,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

const addToWaitlistSchema = z.object({
  profileId: z.string().uuid(),
});

export const POST = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };
    const body = addToWaitlistSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({
        id: events.id,
        allowWaitlist: events.allowWaitlist,
        waitlistMaxSize: events.waitlistMaxSize,
        tenantId: events.tenantId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    if (!eventRow.allowWaitlist) {
      return NextResponse.json({ error: "WAITLIST_NOT_ALLOWED" }, { status: 400 });
    }

    // Check if already on waitlist
    const [existingWaitlist] = await db
      .select({ id: eventWaitlist.id })
      .from(eventWaitlist)
      .where(and(
        eq(eventWaitlist.eventId, eventId),
        eq(eventWaitlist.profileId, body.profileId)
      ))
      .limit(1);

    if (existingWaitlist) {
      return NextResponse.json({ error: "ALREADY_ON_WAITLIST" }, { status: 409 });
    }

    // Check if already registered (not waitlisted)
    const [existingRegistration] = await db
      .select({ id: eventRegistrations.id, status: eventRegistrations.status })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.profileId, body.profileId)
      ))
      .limit(1);

    if (existingRegistration && existingRegistration.status !== "waitlisted") {
      return NextResponse.json({ error: "ALREADY_REGISTERED" }, { status: 409 });
    }

    // Check waitlist max size
    if (eventRow.waitlistMaxSize) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(eventWaitlist)
        .where(eq(eventWaitlist.eventId, eventId));

      if (Number(total) >= eventRow.waitlistMaxSize) {
        return NextResponse.json({ error: "WAITLIST_FULL" }, { status: 400 });
      }
    }

    // Get next position
    const [{ maxPosition }] = await db
      .select({ maxPosition: eventWaitlist.position })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, eventId))
      .orderBy(eventWaitlist.position)
      .limit(1);

    const nextPosition = (maxPosition ?? 0) + 1;

    // Add to waitlist
    const [entry] = await db
      .insert(eventWaitlist)
      .values({
        id: crypto.randomUUID(),
        eventId,
        profileId: body.profileId,
        position: nextPosition,
      })
      .returning();

    return NextResponse.json({ ok: true, id: entry.id, position: entry.position }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
});
