import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, charges, groups, groupAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";
import { getMonthlyFeeForAthlete } from "@/lib/billing/athlete-fees";
import { formatPeriodToMonthName } from "@/lib/billing/athlete-fees";

const GenerateMonthlyChargesSchema = z.object({
  academyId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato YYYY-MM"),
  skipDuplicates: z.boolean().default(true),
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = GenerateMonthlyChargesSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verify academy access
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    // Verify group access if groupId is provided
    if (body.groupId) {
      const groupAccess = await verifyGroupAccess(body.groupId, body.academyId, context.tenantId);
      if (!groupAccess.allowed) {
        return NextResponse.json({ error: groupAccess.reason ?? "GROUP_ACCESS_DENIED" }, { status: 403 });
      }
    }

    // Get active athletes (from academy or specific group)
    let athletesList: Array<{ id: string; name: string; groupId: string | null }> = [];

    if (body.groupId) {
      // Get athletes from specific group
      const groupAthletesList = await db
        .select({
          id: athletes.id,
          name: athletes.name,
          groupId: athletes.groupId,
        })
        .from(groupAthletes)
        .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
        .where(
          and(
            eq(groupAthletes.groupId, body.groupId),
            eq(groupAthletes.tenantId, context.tenantId),
            eq(athletes.academyId, body.academyId),
            eq(athletes.status, "active")
          )
        )
        .limit(1000);

      athletesList = groupAthletesList.map((ga) => ({
        id: ga.id,
        name: ga.name,
        groupId: ga.groupId,
      }));
    } else {
      // Get all active athletes from academy
      const allAthletes = await db
        .select({
          id: athletes.id,
          name: athletes.name,
          groupId: athletes.groupId,
        })
        .from(athletes)
        .where(
          and(
            eq(athletes.academyId, body.academyId),
            eq(athletes.tenantId, context.tenantId),
            eq(athletes.status, "active")
          )
        )
        .limit(1000);

      athletesList = allAthletes;
    }

    if (athletesList.length === 0) {
      return NextResponse.json(
        { message: "No hay atletas activos para generar cargos.", created: 0, skipped: 0 },
        { status: 200 }
      );
    }

    // Calculate due date (last day of the month)
    const [year, month] = body.period.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Get group names for labels
    const groupIds = Array.from(new Set(athletesList.map((a) => a.groupId).filter(Boolean) as string[]));
    const groupsMap = new Map<string, string>();
    if (groupIds.length > 0) {
      const groupsList = await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(and(eq(groups.academyId, body.academyId), inArray(groups.id, groupIds)));

      groupsList.forEach((g) => {
        groupsMap.set(g.id, g.name);
      });
    }

    const newCharges: Array<{
      id: string;
      tenantId: string;
      academyId: string;
      athleteId: string;
      label: string;
      amountCents: number;
      currency: string;
      period: string;
      dueDate: string;
      status: "pending";
    }> = [];

    let skipped = 0;

    // Process each athlete
    for (const athlete of athletesList) {
      if (!athlete.groupId) {
        skipped++;
        continue; // Skip athletes without group
      }

      // Calculate monthly fee
      let monthlyFeeCents: number;
      try {
        monthlyFeeCents = await getMonthlyFeeForAthlete(body.academyId, athlete.id, athlete.groupId);
      } catch (error) {
        console.error(`Error calculating fee for athlete ${athlete.id}:`, error);
        skipped++;
        continue;
      }

      if (monthlyFeeCents === 0 || monthlyFeeCents === null) {
        skipped++;
        continue; // Skip athletes with no fee
      }

      // Check for existing charges if skipDuplicates is true
      if (body.skipDuplicates) {
        const existingCharges = await db
          .select({ id: charges.id })
          .from(charges)
          .where(
            and(
              eq(charges.academyId, body.academyId),
              eq(charges.athleteId, athlete.id),
              eq(charges.period, body.period),
              or(eq(charges.status, "pending"), eq(charges.status, "paid"), eq(charges.status, "overdue"))
            )
          )
          .limit(1);

        if (existingCharges.length > 0) {
          skipped++;
          continue; // Skip if charge already exists
        }
      }

      // Create charge
      const groupName = groupsMap.get(athlete.groupId) || "desconocido";
      const monthName = formatPeriodToMonthName(body.period);

      newCharges.push({
        id: randomUUID(),
        tenantId: context.tenantId,
        academyId: body.academyId,
        athleteId: athlete.id,
        label: `Cuota grupo ${groupName} – ${monthName}`,
        amountCents: monthlyFeeCents,
        currency: "EUR",
        period: body.period,
        dueDate,
        status: "pending",
      });
    }

    if (newCharges.length === 0) {
      return NextResponse.json(
        {
          message: skipped > 0 ? "Todos los atletas ya tienen cargos para este periodo o no tienen cuota definida." : "No se pudieron generar cargos.",
          created: 0,
          skipped,
        },
        { status: 200 }
      );
    }

    // Insert charges in batch
    await db.insert(charges).values(newCharges);

    return NextResponse.json(
      {
        message: `Se generaron ${newCharges.length} cargo${newCharges.length === 1 ? "" : "s"}.`,
        created: newCharges.length,
        skipped,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/generate-monthly", method: "POST" });
  }
});

