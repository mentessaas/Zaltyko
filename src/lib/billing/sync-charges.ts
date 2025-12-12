/**
 * Sincroniza cargos pendientes cuando un atleta cambia de grupo
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { athletes, charges, groups } from "@/db/schema";
import { getMonthlyFeeForAthlete, formatPeriodToMonthName } from "./athlete-fees";

export interface SyncChargesParams {
  academyId: string;
  athleteId: string;
  groupId: string;
  now?: Date; // Opcional para tests
}

/**
 * Sincroniza los cargos del periodo actual cuando un atleta cambia de grupo.
 * 
 * Lógica:
 * - Busca cargos del mes actual con estado "pending" o "overdue"
 * - Si encuentra cargos, actualiza el importe al nuevo precio del grupo
 * - NO toca cargos con estado "paid", "cancelled", etc.
 * 
 * @param params Parámetros de sincronización
 */
export async function syncChargesForAthleteCurrentPeriod(
  params: SyncChargesParams
): Promise<void> {
  const { academyId, athleteId, groupId, now = new Date() } = params;

  // Calcular periodo actual en formato YYYY-MM
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  try {
    // Buscar cargos del periodo actual con estados pendientes
    const pendingCharges = await db
      .select({
        id: charges.id,
        label: charges.label,
        amountCents: charges.amountCents,
        status: charges.status,
      })
      .from(charges)
      .where(
        and(
          eq(charges.academyId, academyId),
          eq(charges.athleteId, athleteId),
          eq(charges.period, currentPeriod),
          inArray(charges.status, ["pending", "overdue"])
        )
      );

    if (pendingCharges.length === 0) {
      // No hay cargos pendientes → no hacer nada
      return;
    }

    // Obtener la nueva cuota del grupo
    const newFeeCents = await getMonthlyFeeForAthlete(academyId, athleteId, groupId);

    if (newFeeCents === 0) {
      // Si el nuevo grupo no tiene cuota, no actualizamos los cargos existentes
      // (podrían ser cargos manuales)
      return;
    }

    // Obtener nombre del grupo para actualizar el label
    const [group] = await db
      .select({
        name: groups.name,
      })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.academyId, academyId)))
      .limit(1);

    const groupName = group?.name || "Grupo";
    const monthName = formatPeriodToMonthName(currentPeriod);
    const newLabel = `Cuota grupo ${groupName} – ${monthName}`;

    // Actualizar cada cargo pendiente
    for (const charge of pendingCharges) {
      await db
        .update(charges)
        .set({
          amountCents: newFeeCents,
          label: newLabel,
          updatedAt: now,
        })
        .where(eq(charges.id, charge.id));
    }
  } catch (error) {
    // Log error pero no romper el flujo principal
    console.error("Error al sincronizar cargos al cambiar de grupo:", error);
    // No lanzamos el error para que no rompa la actualización del grupo
  }
}

