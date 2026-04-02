export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, eq, count } from "drizzle-orm";

import { db } from "@/db";
import { events, eventRegistrations, eventWaitlist, eventInvitations } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";

export const GET = withTenant(async (request: Request, context: { tenantId: string; params: { id: string } }) => {
  try {
    const { id: eventId } = context.params;

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({
        id: events.id,
        title: events.title,
        startDate: events.startDate,
        status: events.status,
        maxCapacity: events.maxCapacity,
        allowWaitlist: events.allowWaitlist,
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    // Get registration stats
    const registrationStats = await db
      .select({
        status: eventRegistrations.status,
        total: count(),
      })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId))
      .groupBy(eventRegistrations.status);

    // Get waitlist count
    const [{ total: waitlistTotal }] = await db
      .select({ total: count() })
      .from(eventWaitlist)
      .where(eq(eventWaitlist.eventId, eventId));

    // Get invitation stats
    const invitationStats = await db
      .select({
        status: eventInvitations.status,
        total: count(),
      })
      .from(eventInvitations)
      .where(eq(eventInvitations.eventId, eventId))
      .groupBy(eventInvitations.status);

    const confirmedRegistrations = registrationStats.find(s => s.status === "confirmed")?.total ?? 0;

    // Calculate totals
    const stats = {
      registrations: {
        total: 0,
        pending: 0,
        confirmed: 0,
        cancelled: 0,
        waitlisted: 0,
      },
      waitlist: {
        total: Number(waitlistTotal ?? 0),
        maxSize: eventRow.allowWaitlist ? null : 0,
      },
      invitations: {
        total: 0,
        pending: 0,
        sent: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
      },
      capacity: {
        total: eventRow.maxCapacity,
        available: eventRow.maxCapacity
          ? Math.max(0, eventRow.maxCapacity - confirmedRegistrations)
          : null,
        utilizationPercent: eventRow.maxCapacity
          ? Math.round((confirmedRegistrations / eventRow.maxCapacity) * 100)
          : null,
      },
    };

    for (const stat of registrationStats) {
      if (stat.status === "pending") {
        stats.registrations.pending = Number(stat.total);
        stats.registrations.total += Number(stat.total);
      } else if (stat.status === "confirmed") {
        stats.registrations.confirmed = Number(stat.total);
        stats.registrations.total += Number(stat.total);
      } else if (stat.status === "cancelled") {
        stats.registrations.cancelled = Number(stat.total);
      } else if (stat.status === "waitlisted") {
        stats.registrations.waitlisted = Number(stat.total);
        stats.registrations.total += Number(stat.total);
      }
    }

    for (const invStat of invitationStats) {
      if (invStat.status === "pending") {
        stats.invitations.pending = Number(invStat.total);
        stats.invitations.total += Number(invStat.total);
      } else if (invStat.status === "sent") {
        stats.invitations.sent = Number(invStat.total);
        stats.invitations.total += Number(invStat.total);
      } else if (invStat.status === "accepted") {
        stats.invitations.accepted = Number(invStat.total);
        stats.invitations.total += Number(invStat.total);
      } else if (invStat.status === "declined") {
        stats.invitations.declined = Number(invStat.total);
      } else if (invStat.status === "expired") {
        stats.invitations.expired = Number(invStat.total);
      }
    }

    return NextResponse.json({
      event: {
        id: eventRow.id,
        title: eventRow.title,
        startDate: eventRow.startDate,
        status: eventRow.status,
      },
      stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
