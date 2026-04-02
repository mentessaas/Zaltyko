export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { events, eventRegistrations, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

export const GET = withTenant(async (request: Request, context: { tenantId: string; profile: { id: string } }) => {
  try {
    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const profileId = context.profile?.id;

    if (!profileId) {
      return NextResponse.json({ error: "PROFILE_ID_REQUIRED" }, { status: 400 });
    }

    // Get user's registrations
    const userRegistrations = await db
      .select({
        registrationId: eventRegistrations.id,
        eventId: eventRegistrations.eventId,
        registrationStatus: eventRegistrations.status,
        registeredAt: eventRegistrations.registeredAt,
        eventTitle: events.title,
        eventStartDate: events.startDate,
        eventEndDate: events.endDate,
        eventLocation: events.city,
        eventStatus: events.status,
        academyId: events.academyId,
        academyName: academies.name,
      })
      .from(eventRegistrations)
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .innerJoin(academies, eq(events.academyId, academies.id))
      .where(and(
        eq(eventRegistrations.profileId, profileId),
        eq(events.tenantId, context.tenantId)
      ))
      .orderBy(desc(events.startDate));

    return NextResponse.json({
      items: userRegistrations.map(reg => ({
        id: reg.registrationId,
        eventId: reg.eventId,
        eventTitle: reg.eventTitle,
        eventStartDate: reg.eventStartDate,
        eventEndDate: reg.eventEndDate,
        eventLocation: reg.eventLocation,
        eventStatus: reg.eventStatus,
        registrationStatus: reg.registrationStatus,
        registeredAt: reg.registeredAt,
        academyId: reg.academyId,
        academyName: reg.academyName,
      })),
      total: userRegistrations.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
