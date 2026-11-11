import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import {
  PAGE_CONFLICT_HORIZON_DAYS,
  SPACE_CONFLICT_WARNINGS_ENABLED,
  type ScheduleConflict,
} from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

import { findScheduleConflicts } from "./detect";

/**
 * «Choques próximos» para las páginas de uso diario (Clases y el Hoy de la
 * entrenadora). Recibe un alcance ya resuelto por la página
 * (resolveOwnerScope) y nunca lo amplía:
 * - dirección y coordinación: choques cuyas dos sesiones están en sus sedes
 *   activas;
 * - entrenadora: solo sus propios choques (sus fichas de equipo), también con
 *   las dos sesiones en sus sedes, así que nunca ve sedes fuera de su alcance.
 *
 * Coste acotado: PAGE_CONFLICT_HORIZON_DAYS (14 días), avisos de pista
 * apagados (SPACE_CONFLICT_WARNINGS_ENABLED), transacción `read only` con
 * `statement_timeout` local y un presupuesto TOTAL de PAGE_BUDGET_MS para la
 * página: si se agota, se devuelve null y la página se pinta igual que antes.
 * Ante cualquier fallo, también null.
 */
export type UpcomingConflicts = { conflicts: ScheduleConflict[]; truncated: boolean };

export const PAGE_BUDGET_MS = 1500;

async function load(input: {
  organizationId: string;
  locationIds: readonly string[];
  viewer: { memberId: string; role: string };
}): Promise<UpcomingConflicts> {
  return db.transaction(
    async (tx) => {
      // Solo dentro de esta transacción: al terminar vuelve el valor anterior.
      await tx.execute(sql.raw(`set local statement_timeout = '${PAGE_BUDGET_MS}ms'`));
      const coach = input.viewer.role === "coach";
      // Una sola ida y vuelta para el alcance: sedes activas de la academia
      // entre las pedidas y, si mira una entrenadora, sus fichas de equipo.
      const scope = await tx.execute(sql`
        select
          coalesce((
            select array_agg(location.id::text order by location.id)
            from zaltyko.locations location
            where location.organization_id = ${input.organizationId}::uuid
              and location.is_active
              and location.id = any(${sqlUuidArray([...input.locationIds])})
          ), array[]::text[]) as location_ids,
          ${
            coach
              ? sql`coalesce((
                  select array_agg(staff.id::text order by staff.id)
                  from zaltyko.staff_profiles staff
                  where staff.organization_id = ${input.organizationId}::uuid
                    and staff.member_id = ${input.viewer.memberId}::uuid
                ), array[]::text[])`
              : sql`null::text[]`
          } as staff_profile_ids
      `);
      const row = scope.rows[0] as { location_ids: string[]; staff_profile_ids: string[] | null } | undefined;
      const locationIds = row?.location_ids ?? [];
      const staffProfileIds = row?.staff_profile_ids ?? null;
      if (locationIds.length === 0 || (coach && (!staffProfileIds || staffProfileIds.length === 0))) {
        return { conflicts: [], truncated: false };
      }
      return findScheduleConflicts(tx, {
        organizationId: input.organizationId,
        locationIds,
        staffProfileIds: coach ? staffProfileIds : null,
        horizonDays: PAGE_CONFLICT_HORIZON_DAYS,
        include: { coach: true, space: coach ? false : SPACE_CONFLICT_WARNINGS_ENABLED },
      });
    },
    { accessMode: "read only" }
  );
}

export async function getUpcomingScheduleConflicts(input: {
  organizationId: string;
  locationIds: readonly string[];
  viewer: { memberId: string; role: string };
  /** Solo para pruebas: presupuesto distinto de PAGE_BUDGET_MS. */
  budgetMs?: number;
}): Promise<UpcomingConflicts | null> {
  if (input.locationIds.length === 0) return { conflicts: [], truncated: false };
  // La carga nunca deja un rechazo sin atender, aunque el temporizador gane.
  const work = load(input).catch((error: unknown) => {
    logger.error("Upcoming schedule conflicts failed", error);
    return null;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      logger.warn("Upcoming schedule conflicts exceeded the page budget");
      resolve(null);
    }, input.budgetMs ?? PAGE_BUDGET_MS);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
