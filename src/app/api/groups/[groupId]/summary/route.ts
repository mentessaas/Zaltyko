import { NextResponse } from "next/server";
import { and, eq, inArray, or, sql, sum } from "drizzle-orm";
import { format } from "date-fns";

import { db } from "@/db";
import { groups, athletes, charges, groupAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyGroupAccess } from "@/lib/permissions";
import { getMonthlyFeeForAthlete } from "@/lib/billing/athlete-fees";

export const GET = withTenant(async (request, context) => {
  try {
    const groupId = (context.params as { groupId?: string })?.groupId;
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || format(new Date(), "yyyy-MM");

    if (!groupId) {
      return NextResponse.json({ error: "GROUP_ID_REQUIRED" }, { status: 400 });
    }

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Get group info
    const [group] = await db
      .select({
        id: groups.id,
        name: groups.name,
        academyId: groups.academyId,
        monthlyFeeCents: groups.monthlyFeeCents,
      })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!group) {
      return NextResponse.json({ error: "GROUP_NOT_FOUND" }, { status: 404 });
    }

    // Verify group access
    const groupAccess = await verifyGroupAccess(groupId, group.academyId, context.tenantId);
    if (!groupAccess.allowed) {
      return NextResponse.json({ error: groupAccess.reason ?? "GROUP_ACCESS_DENIED" }, { status: 403 });
    }

    // Get active athletes in the group
    const groupAthletesList = await db
      .select({
        athleteId: athletes.id,
        athleteName: athletes.name,
      })
      .from(groupAthletes)
      .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
      .where(
        and(
          eq(groupAthletes.groupId, groupId),
          eq(groupAthletes.tenantId, context.tenantId),
          eq(athletes.status, "active")
        )
      );

    const athleteIds = groupAthletesList.map((ga) => ga.athleteId);
    const activeAthletesCount = athleteIds.length;

    // Calculate expected total (sum of monthly fees for all athletes in group)
    let expectedTotalCents = 0;
    if (activeAthletesCount > 0) {
      for (const athlete of groupAthletesList) {
        try {
          const fee = await getMonthlyFeeForAthlete(group.academyId, athlete.athleteId, groupId);
          expectedTotalCents += fee;
        } catch (error) {
          console.error(`Error calculating fee for athlete ${athlete.athleteId}:`, error);
        }
      }
    }

    // Get charges for this group and period
    const chargesList = athleteIds.length > 0
      ? await db
          .select({
            amountCents: charges.amountCents,
            status: charges.status,
          })
          .from(charges)
          .where(
            and(
              eq(charges.academyId, group.academyId),
              eq(charges.period, period),
              inArray(charges.athleteId, athleteIds)
            )
          )
      : [];

    // Calculate totals
    const paidTotalCents = chargesList
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + c.amountCents, 0);

    const pendingOrOverdueTotalCents = chargesList
      .filter((c) => c.status === "pending" || c.status === "overdue")
      .reduce((sum, c) => sum + c.amountCents, 0);

    return NextResponse.json({
      groupId: group.id,
      groupName: group.name,
      activeAthletesCount,
      monthlyFeeCents: group.monthlyFeeCents ?? 0,
      period,
      expectedTotalCents,
      paidTotalCents,
      pendingOrOverdueTotalCents,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/groups/[groupId]/summary", method: "GET" });
  }
});

