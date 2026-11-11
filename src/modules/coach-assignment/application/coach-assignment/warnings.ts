import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import { findScheduleConflicts } from "@/modules/schedule-conflicts/application/schedule-conflicts-service";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";

/**
 * O2: choques de horario de las entrenadoras recién asignadas en las sesiones
 * afectadas. Se calcula después de guardar y SOLO AVISA:
 * - va en un savepoint (transacción anidada): si la detección falla, también
 *   por un error de SQL, se deshace solo el savepoint, el guardado sigue y se
 *   devuelve null con un log;
 * - se limita a las sedes que ve quien guarda: una coordinación con sedes
 *   seleccionadas no recibe nombres ni sesiones de otras sedes.
 * Mira el horizonte completo de sesiones generadas (no los 14 días de las
 * páginas), con las mismas reglas exactas de choque.
 * En un reintento de la misma petición no se vuelven a calcular: se dieron en
 * la respuesta original y se pueden consultar en «Choques próximos».
 */
export async function coachWarnings(
  tx: TransactionClient,
  input: {
    organizationId: string;
    memberId: string;
    staffProfileIds: readonly string[];
    sessionIds: readonly string[];
  }
): Promise<ScheduleConflict[] | null> {
  if (input.staffProfileIds.length === 0 || input.sessionIds.length === 0) return [];
  try {
    return await tx.transaction(async (savepoint) => {
      const visible = await savepoint.execute(sql`
        select coalesce(array_agg(location.id::text order by location.id), array[]::text[]) as location_ids
        from zaltyko.locations location
        join zaltyko.organization_members member
          on member.organization_id = location.organization_id
         and member.id = ${input.memberId}::uuid
        where location.organization_id = ${input.organizationId}::uuid
          and location.is_active
          and (
            member.location_scope_mode = 'all'
            or exists (
              select 1 from zaltyko.member_location_scopes scope
              where scope.organization_id = member.organization_id
                and scope.member_id = member.id
                and scope.location_id = location.id
            )
          )
      `);
      const locationIds = (visible.rows[0] as { location_ids: string[] } | undefined)?.location_ids ?? [];
      if (locationIds.length === 0) return [];
      const { conflicts } = await findScheduleConflicts(savepoint, {
        organizationId: input.organizationId,
        locationIds,
        staffProfileIds: input.staffProfileIds,
        involvingSessionIds: input.sessionIds,
        include: { coach: true, space: false },
      });
      return conflicts;
    });
  } catch (error) {
    logger.error("Schedule conflict warnings failed; the assignment was saved without them", error);
    return null;
  }
}

/** Lo que queda en la auditoría: que se guardó con aviso, sin nombres. */
export function warningAudit(warnings: readonly ScheduleConflict[] | null): Record<string, unknown> {
  if (warnings === null) return { scheduleWarningsUnavailable: true };
  if (warnings.length === 0) return {};
  return {
    savedWithWarnings: true,
    scheduleWarnings: warnings.map((warning) => ({
      kind: warning.kind,
      staffProfileId: warning.subjectId,
      sessionIds: [warning.first.sessionId, warning.second.sessionId],
    })),
  };
}
