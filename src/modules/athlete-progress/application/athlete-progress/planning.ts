import { and, eq, inArray } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { athleteObjectives } from "@/modules/athlete-progress/infrastructure/athlete-progress-schema";

/**
 * Lectura de objetivos para la planificación de sesiones (P2 #17, segunda
 * parte). Uso interno: entra por la fachada. Corre dentro de la transacción
 * de quien llama, que ya autorizó academia, rol y sede; aquí solo se filtra
 * por academia y se devuelve la sede de creación para que quien llama aplique
 * su visibilidad.
 */
export type PlanningObjective = {
  id: string;
  athleteId: string;
  title: string;
  status: string;
  locationId: string;
};

const columns = {
  id: athleteObjectives.id,
  athleteId: athleteObjectives.athleteId,
  title: athleteObjectives.title,
  status: athleteObjectives.status,
  locationId: athleteObjectives.locationId,
};

export async function findObjectivesForPlanning(
  tx: TransactionClient,
  input: { organizationId: string; objectiveIds: readonly string[] }
): Promise<PlanningObjective[]> {
  if (input.objectiveIds.length === 0) return [];
  return tx
    .select(columns)
    .from(athleteObjectives)
    .where(
      and(
        eq(athleteObjectives.organizationId, input.organizationId),
        inArray(athleteObjectives.id, [...input.objectiveIds])
      )
    )
    .limit(input.objectiveIds.length);
}

export async function findInProgressObjectivesForPlanning(
  tx: TransactionClient,
  input: { organizationId: string; athleteIds: readonly string[]; limit: number }
): Promise<PlanningObjective[]> {
  if (input.athleteIds.length === 0) return [];
  return tx
    .select(columns)
    .from(athleteObjectives)
    .where(
      and(
        eq(athleteObjectives.organizationId, input.organizationId),
        inArray(athleteObjectives.athleteId, [...input.athleteIds]),
        eq(athleteObjectives.status, "in_progress")
      )
    )
    .limit(input.limit);
}
