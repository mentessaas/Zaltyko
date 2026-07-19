import { and, eq, inArray } from "drizzle-orm";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";

import { db } from "@/db";
import { athletes, charges, billingItems } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";

const BulkCreateChargesSchema = z.object({
  academyId: z.string().uuid(),
  groupId: z.string().uuid(),
  billingItemId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/), // Format: YYYY-MM
  dueDate: z.string().optional(), // ISO date string
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = BulkCreateChargesSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify academy access
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return apiError(academyAccess.reason ?? "ACADEMY_ACCESS_DENIED", "Access denied", 403);
    }

    // Verify group access
    const groupAccess = await verifyGroupAccess(body.groupId, body.academyId, context.tenantId);
    if (!groupAccess.allowed) {
      return apiError(groupAccess.reason ?? "GROUP_ACCESS_DENIED", "Access denied", 403);
    }

    // Get billing item
    const [billingItem] = await db
      .select()
      .from(billingItems)
      .where(and(eq(billingItems.id, body.billingItemId), eq(billingItems.academyId, body.academyId)))
      .limit(1);

    if (!billingItem) {
      return apiError("BILLING_ITEM_NOT_FOUND", "Billing item not found", 404);
    }

    // Get all athletes in the group
    const groupAthletesList = await db
      .select({ id: athletes.id, name: athletes.name })
      .from(athletes)
      .where(and(eq(athletes.groupId, body.groupId), eq(athletes.academyId, body.academyId)))
      .limit(1000); // Reasonable limit

    if (groupAthletesList.length === 0) {
      return apiError("NO_ATHLETES_IN_GROUP", "No athletes in group", 400);
    }

    const athleteIds = groupAthletesList.map((a) => a.id);

    // Check which charges already exist for this combination
    const existingCharges = await db
      .select({ athleteId: charges.athleteId })
      .from(charges)
      .where(
        and(
          eq(charges.academyId, body.academyId),
          eq(charges.billingItemId, body.billingItemId),
          eq(charges.period, body.period),
          inArray(charges.athleteId, athleteIds)
        )
      );

    const existingAthleteIds = new Set(existingCharges.map((c) => c.athleteId));

    // Create charges only for athletes that don't have one yet
    const newCharges = groupAthletesList
      .filter((a) => !existingAthleteIds.has(a.id))
      .map((athlete) => ({
        tenantId: context.tenantId,
        academyId: body.academyId,
        athleteId: athlete.id,
        billingItemId: body.billingItemId,
        label: `${billingItem.name} – ${body.period}`,
        amountCents: billingItem.amountCents,
        currency: billingItem.currency,
        period: body.period,
        dueDate: body.dueDate ? body.dueDate.split("T")[0] : null,
        status: "pending" as const,
        notes: null,
      }));

    if (newCharges.length === 0) {
      return apiSuccess({
        message: "All athletes in this group already have charges for this period",
        created: 0,
        skipped: groupAthletesList.length,
      });
    }

    await db.insert(charges).values(newCharges);

    return apiCreated(
      {
        message: `Created ${newCharges.length} charge(s)`,
        created: newCharges.length,
        skipped: existingCharges.length,
      }
    );
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/bulk", method: "POST" });
  }
});

