import type { TransactionClient } from "@/lib/db-transactions";
import { findScheduleConflicts } from "@/modules/schedule-conflicts/application/schedule-conflicts-service";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";

/**
 * O2: choques de horario de las entrenadoras recién asignadas en las sesiones
 * afectadas. Se calcula después de guardar, dentro de la misma transacción, y
 * nunca bloquea: solo se devuelve y se audita.
 */
export async function coachWarnings(
  tx: TransactionClient,
  input: { organizationId: string; staffProfileIds: readonly string[]; sessionIds: readonly string[] }
): Promise<ScheduleConflict[]> {
  if (input.staffProfileIds.length === 0 || input.sessionIds.length === 0) return [];
  const { conflicts } = await findScheduleConflicts(tx, {
    organizationId: input.organizationId,
    staffProfileIds: input.staffProfileIds,
    involvingSessionIds: input.sessionIds,
    include: { coach: true, space: false },
  });
  return conflicts;
}

/** Lo que queda en la auditoría: que se guardó con aviso, sin nombres. */
export function warningAudit(warnings: readonly ScheduleConflict[]): Record<string, unknown> {
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
