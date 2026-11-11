import { sql } from "drizzle-orm";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

import { findScheduleConflicts } from "./detect";

/**
 * «Choques próximos» para las páginas. Recibe un alcance ya resuelto por la
 * página (resolveOwnerScope) y nunca lo amplía:
 * - dirección y coordinación: choques cuyas dos sesiones están en sus sedes;
 * - entrenadora: solo sus propios choques (sus fichas de equipo) y también con
 *   las dos sesiones en sus sedes, así que nunca ve sedes fuera de su alcance.
 * Es solo lectura, con un tiempo máximo por consulta; ante cualquier fallo
 * devuelve null y la página se pinta igual que antes.
 */
export type UpcomingConflicts = { conflicts: ScheduleConflict[]; truncated: boolean };

const PAGE_STATEMENT_TIMEOUT = "1500ms";

export async function getUpcomingScheduleConflicts(input: {
  organizationId: string;
  locationIds: readonly string[];
  viewer: { memberId: string; role: string };
}): Promise<UpcomingConflicts | null> {
  if (input.locationIds.length === 0) return { conflicts: [], truncated: false };
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local statement_timeout = '${PAGE_STATEMENT_TIMEOUT}'`));
      // Solo sedes activas de la academia, aunque la página pase otras.
      const scoped = await tx.execute(sql`
        select id::text from zaltyko.locations
        where organization_id = ${input.organizationId}::uuid
          and id = any(${sqlUuidArray([...input.locationIds])})
      `);
      const locationIds = (scoped.rows as Array<{ id: string }>).map((row) => row.id);
      if (locationIds.length === 0) return { conflicts: [], truncated: false };
      if (input.viewer.role !== "coach") {
        return findScheduleConflicts(tx, { organizationId: input.organizationId, locationIds });
      }
      const own = await tx.execute(sql`
        select id::text from zaltyko.staff_profiles
        where organization_id = ${input.organizationId}::uuid
          and member_id = ${input.viewer.memberId}::uuid
      `);
      const staffProfileIds = (own.rows as Array<{ id: string }>).map((row) => row.id);
      if (staffProfileIds.length === 0) return { conflicts: [], truncated: false };
      return findScheduleConflicts(tx, {
        organizationId: input.organizationId,
        locationIds,
        staffProfileIds,
        include: { coach: true, space: false },
      });
    });
  } catch (error) {
    logger.error("Upcoming schedule conflicts failed", error);
    return null;
  }
}
