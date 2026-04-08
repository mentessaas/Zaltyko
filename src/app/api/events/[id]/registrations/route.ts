export const dynamic = 'force-dynamic';

import { and, eq, count } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, eventRegistrations, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

const registerSchema = z.object({
  profileId: z.string().uuid(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "waitlisted"]),
  notes: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id, maxCapacity: events.maxCapacity })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Get registrations with profile info
    const registrations = await db
      .select({
        id: eventRegistrations.id,
        profileId: eventRegistrations.profileId,
        profileName: profiles.name,
        profileEmail: profiles.userId, // This is actually userId, not email
        status: eventRegistrations.status,
        notes: eventRegistrations.notes,
        registeredAt: eventRegistrations.registeredAt,
      })
      .from(eventRegistrations)
      .leftJoin(profiles, eq(eventRegistrations.profileId, profiles.id))
      .where(eq(eventRegistrations.eventId, eventId));

    const confirmedCount = registrations.filter((r) => r.status === "confirmed").length;

    return apiSuccess({
      items: registrations,
      total: registrations.length,
      capacity: eventRow.maxCapacity,
      confirmedCount,
      availableSlots: eventRow.maxCapacity ? eventRow.maxCapacity - confirmedCount : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };
    const body = registerSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and is open for registration
    const [eventRow] = await db
      .select({
        id: events.id,
        status: events.status,
        maxCapacity: events.maxCapacity,
        registrationStartDate: events.registrationStartDate,
        registrationEndDate: events.registrationEndDate,
        allowWaitlist: events.allowWaitlist,
        tenantId: events.tenantId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Check registration dates
    const now = new Date();
    if (eventRow.registrationStartDate && new Date(eventRow.registrationStartDate) > now) {
      return apiError("REGISTRATION_NOT_OPEN", "Registration not open", 400);
    }
    if (eventRow.registrationEndDate && new Date(eventRow.registrationEndDate) < now) {
      return apiError("REGISTRATION_CLOSED", "Registration closed", 400);
    }

    // Check if already registered
    const [existing] = await db
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.profileId, body.profileId)
      ))
      .limit(1);

    if (existing) {
      return apiError("ALREADY_REGISTERED", "Already registered", 409);
    }

    // Check capacity
    if (eventRow.maxCapacity) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.status, "confirmed")
        ));

      if (Number(total) >= eventRow.maxCapacity) {
        if (!eventRow.allowWaitlist) {
          return apiError("EVENT_FULL", "Event full", 400);
        }
        // Register as waitlisted
        const [registration] = await db
          .insert(eventRegistrations)
          .values({
            id: crypto.randomUUID(),
            eventId,
            profileId: body.profileId,
            status: "waitlisted",
            notes: body.notes ?? null,
          })
          .returning();

        return apiCreated({ id: registration.id, status: "waitlisted" });
      }
    }

    // Register as pending (or confirmed if capacity check passed)
    const [registration] = await db
      .insert(eventRegistrations)
      .values({
        id: crypto.randomUUID(),
        eventId,
        profileId: body.profileId,
        status: "pending",
        notes: body.notes ?? null,
      })
      .returning();

    return apiCreated({ id: registration.id, status: "pending" });
  } catch (error) {
    return handleApiError(error);
  }
});

export const PATCH = withTenant(async (request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };
    const body = updateStatusSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    const url = new URL(request.url);
    const registrationId = url.searchParams.get("registrationId");

    if (!registrationId) {
      return apiError("REGISTRATION_ID_REQUIRED", "Registration ID required", 400);
    }

    // Verify event belongs to tenant
    const [eventRow] = await db
      .select({ id: events.id, tenantId: events.tenantId })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Verify registration exists and belongs to event
    const [existing] = await db
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.id, registrationId),
        eq(eventRegistrations.eventId, eventId)
      ))
      .limit(1);

    if (!existing) {
      return apiError("REGISTRATION_NOT_FOUND", "Registration not found", 404);
    }

    // Update status
    await db
      .update(eventRegistrations)
      .set({
        status: body.status,
        notes: body.notes ?? null,
      })
      .where(eq(eventRegistrations.id, registrationId));

    return apiSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
});
