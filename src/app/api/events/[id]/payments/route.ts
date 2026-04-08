import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events, eventRegistrations, eventPayments } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

export const GET = withTenant(async (_request, context) => {
  try {
    const { id: eventId } = context.params as { id: string };

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant required", 400);
    }

    // Verify event exists and belongs to tenant
    const [eventRow] = await db
      .select({
        id: events.id,
        registrationFee: events.registrationFee,
        tenantId: events.tenantId,
      })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!eventRow) {
      return apiError("EVENT_NOT_FOUND", "Event not found", 404);
    }

    // Get all registrations for this event
    const registrations = await db
      .select({
        id: eventRegistrations.id,
        profileId: eventRegistrations.profileId,
        status: eventRegistrations.status,
        registeredAt: eventRegistrations.registeredAt,
      })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId));

    // Get payments for all registrations
    const registrationIds = registrations.map((r) => r.id);
    const payments = registrationIds.length > 0
      ? await db
          .select({
            id: eventPayments.id,
            registrationId: eventPayments.registrationId,
            amount: eventPayments.amount,
            currency: eventPayments.currency,
            status: eventPayments.status,
            paidAt: eventPayments.paidAt,
            createdAt: eventPayments.createdAt,
          })
          .from(eventPayments)
          .where(inArray(eventPayments.registrationId, registrationIds))
      : [];

    // Calculate payment summary
    const totalRegistrations = registrations.length;
    const confirmedRegistrations = registrations.filter((r) => r.status === "confirmed").length;
    const pendingRegistrations = registrations.filter((r) => r.status === "pending").length;
    const waitlistedRegistrations = registrations.filter((r) => r.status === "waitlisted").length;

    const totalAmount = Number(eventRow.registrationFee ?? 0) * confirmedRegistrations;
    const paidPayments = payments.filter((p) => p.status === "paid");
    const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const pendingPayments = payments.filter((p) => p.status === "pending");
    const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    return apiSuccess({
      eventId,
      registrationFee: eventRow.registrationFee,
      summary: {
        totalRegistrations,
        confirmedRegistrations,
        pendingRegistrations,
        waitlistedRegistrations,
        totalExpectedAmount: totalAmount,
        totalPaidAmount: totalPaid,
        totalPendingAmount: totalPending,
        paidRegistrations: paidPayments.length,
        pendingPaymentRegistrations: pendingPayments.length,
      },
      payments: payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
});
