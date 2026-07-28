import { randomUUID } from "node:crypto";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { athletes, charges, groups, groupAthletes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";
import { formatPeriodToMonthName } from "@/lib/billing/athlete-fees";

const GenerateMonthlyChargesSchema = z.object({
  academyId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
  sportConfigId: z.string().uuid().nullable().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato YYYY-MM"),
  skipDuplicates: z.boolean().default(true),
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = GenerateMonthlyChargesSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verify academy access
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return apiError(academyAccess.reason ?? "ACADEMY_ACCESS_DENIED", "Access denied", 403);
    }

    // Verify group access if groupId is provided
    if (body.groupId) {
      const groupAccess = await verifyGroupAccess(body.groupId, context.tenantId, body.academyId);
      if (!groupAccess.allowed) {
        return apiError(groupAccess.reason ?? "GROUP_ACCESS_DENIED", "Access denied", 403);
      }
    }

    // Multi-grupo: se genera un cargo por cada pertenencia a grupo del atleta
    // (cada grupo con su propia cuota = custom_fee_cents del vínculo ?? cuota del
    // grupo). La fuente de verdad de pertenencia es group_athletes; athletes.group_id
    // se usa solo como fallback legacy para datos aún no reconciliados.
    interface Membership {
      athleteId: string;
      groupId: string;
      feeCents: number;
      groupName: string;
    }

    // Cuotas y nombres de todos los grupos de la academia (pocos por academia).
    const academyGroups = await db
      .select({ id: groups.id, name: groups.name, monthlyFeeCents: groups.monthlyFeeCents })
      .from(groups)
      .where(and(eq(groups.academyId, body.academyId), isNull(groups.deletedAt)));

    const groupInfo = new Map(academyGroups.map((g) => [g.id, g]));

    // 1. Pertenencias vía group_athletes (con override por vínculo).
    const membershipRows = await db
      .select({
        athleteId: athletes.id,
        groupId: groupAthletes.groupId,
        customFeeCents: groupAthletes.customFeeCents,
      })
      .from(groupAthletes)
      .innerJoin(athletes, eq(groupAthletes.athleteId, athletes.id))
      .where(
        and(
          eq(groupAthletes.tenantId, context.tenantId),
          eq(athletes.academyId, body.academyId),
          eq(athletes.status, "active"),
          isNull(athletes.deletedAt),
          body.groupId ? eq(groupAthletes.groupId, body.groupId) : undefined,
          body.sportConfigId ? eq(athletes.primarySportConfigId, body.sportConfigId) : undefined
        )
      )
      .limit(5000);

    // 2. Fallback legacy: atletas activos con group_id que aún no tienen fila en
    //    group_athletes para ese grupo (datos previos a la reconciliación).
    const legacyRows = await db
      .select({
        athleteId: athletes.id,
        groupId: athletes.groupId,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.academyId, body.academyId),
          eq(athletes.tenantId, context.tenantId),
          eq(athletes.status, "active"),
          isNull(athletes.deletedAt),
          body.groupId ? eq(athletes.groupId, body.groupId) : undefined,
          body.sportConfigId ? eq(athletes.primarySportConfigId, body.sportConfigId) : undefined
        )
      )
      .limit(5000);

    const memberships: Membership[] = [];
    const seen = new Set<string>();
    let skipped = 0;

    const pushMembership = (athleteId: string, groupId: string | null, customFeeCents: number | null) => {
      if (!groupId) return;
      const key = `${athleteId}:${groupId}`;
      if (seen.has(key)) return;
      const info = groupInfo.get(groupId);
      if (!info) return; // grupo de otra academia o borrado
      const feeCents = customFeeCents ?? info.monthlyFeeCents ?? 0;
      if (!feeCents || feeCents <= 0) {
        skipped++;
        return; // sin cuota definida
      }
      seen.add(key);
      memberships.push({ athleteId, groupId, feeCents, groupName: info.name });
    };

    membershipRows.forEach((row) => pushMembership(row.athleteId, row.groupId, row.customFeeCents));
    legacyRows.forEach((row) => pushMembership(row.athleteId, row.groupId, null));

    if (memberships.length === 0) {
      return apiSuccess({
        message: "No hay pertenencias con cuota definida para generar cargos.",
        created: 0,
        skipped,
      });
    }

    // Calculate due date (last day of the month)
    const [year, month] = body.period.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const monthName = formatPeriodToMonthName(body.period);

    const newCharges: Array<{
      id: string;
      tenantId: string;
      academyId: string;
      athleteId: string;
      groupId: string;
      label: string;
      amountCents: number;
      currency: string;
      period: string;
      dueDate: string;
      status: "pending";
    }> = [];

    // Process each membership
    for (const membership of memberships) {
      // Check for existing charge (per grupo) if skipDuplicates is true
      if (body.skipDuplicates) {
        const existingCharges = await db
          .select({ id: charges.id })
          .from(charges)
          .where(
            and(
              eq(charges.academyId, body.academyId),
              eq(charges.athleteId, membership.athleteId),
              eq(charges.period, body.period),
              eq(charges.groupId, membership.groupId),
              or(eq(charges.status, "pending"), eq(charges.status, "paid"), eq(charges.status, "overdue"))
            )
          )
          .limit(1);

        if (existingCharges.length > 0) {
          skipped++;
          continue; // Skip if charge already exists for this group/period
        }
      }

      newCharges.push({
        id: randomUUID(),
        tenantId: context.tenantId,
        academyId: body.academyId,
        athleteId: membership.athleteId,
        groupId: membership.groupId,
        label: `Cuota ${membership.groupName} – ${monthName}`,
        amountCents: membership.feeCents,
        currency: "EUR",
        period: body.period,
        dueDate,
        status: "pending",
      });
    }

    if (newCharges.length === 0) {
      return apiSuccess(
        {
          message: skipped > 0 ? "Todas las personas ya tienen cargos para este periodo o no tienen cuota definida." : "No se pudieron generar cargos.",
          created: 0,
          skipped,
        }
      );
    }

    // Insert charges in batch
    await db.insert(charges).values(newCharges);

    return apiCreated(
      {
        message: `Se generaron ${newCharges.length} cargo${newCharges.length === 1 ? "" : "s"}.`,
        created: newCharges.length,
        skipped,
      }
    );
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/charges/generate-monthly", method: "POST" });
  }
});
