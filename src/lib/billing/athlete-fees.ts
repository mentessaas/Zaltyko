/**
 * Helpers para calcular y gestionar cuotas mensuales de atletas
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { athletes, groupAthletes, groups } from "@/db/schema";

/**
 * Calcula la cuota mensual de un atleta para su grupo actual.
 * 
 * Lógica:
 * 1. Si el atleta tiene una cuota personalizada (custom_fee_cents) en group_athletes → devuelve esa
 * 2. Si no, devuelve la cuota del grupo (monthly_fee_cents)
 * 3. Si el grupo no tiene cuota definida → devuelve 0
 * 
 * @param academyId ID de la academia
 * @param athleteId ID del atleta
 * @param groupId ID del grupo (opcional, si no se proporciona se obtiene del atleta)
 * @returns Cantidad en céntimos (número entero)
 */
export async function getMonthlyFeeForAthlete(
  academyId: string,
  athleteId: string,
  groupId?: string
): Promise<number> {
  // Obtener el atleta y su grupo
  const [athlete] = await db
    .select({
      athleteId: athletes.id,
      currentGroupId: athletes.groupId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
    .limit(1);

  if (!athlete) {
    throw new Error(`Atleta no encontrado: ${athleteId}`);
  }

  const targetGroupId = groupId || athlete.currentGroupId;
  if (!targetGroupId) {
    // Atleta sin grupo → sin cuota
    return 0;
  }

  // Verificar si hay cuota personalizada en group_athletes
  const [membership] = await db
    .select({
      customFeeCents: groupAthletes.customFeeCents,
    })
    .from(groupAthletes)
    .where(
      and(
        eq(groupAthletes.athleteId, athleteId),
        eq(groupAthletes.groupId, targetGroupId)
      )
    )
    .limit(1);

  // Si hay cuota personalizada, usarla
  if (membership?.customFeeCents !== null && membership?.customFeeCents !== undefined) {
    return membership.customFeeCents;
  }

  // Si no hay cuota personalizada, obtener la del grupo
  const [group] = await db
    .select({
      monthlyFeeCents: groups.monthlyFeeCents,
    })
    .from(groups)
    .where(and(eq(groups.id, targetGroupId), eq(groups.academyId, academyId)))
    .limit(1);

  if (!group) {
    return 0;
  }

  // Devolver la cuota del grupo o 0 si no está definida
  return group.monthlyFeeCents ?? 0;
}

/**
 * Formatea un periodo YYYY-MM a nombre de mes en español
 */
export function formatPeriodToMonthName(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

