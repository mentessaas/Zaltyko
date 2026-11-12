import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
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
 *   las dos sesiones en sus sedes.
 *
 * Coste acotado para no competir con la página por el pool (5 conexiones en
 * producción):
 * - PAGE_CONFLICT_HORIZON_DAYS (14 días), avisos de pista apagados;
 * - presupuesto TOTAL de PAGE_BUDGET_MS por página: al agotarse se devuelve
 *   null y la carga se marca como abandonada (AbortSignal);
 * - una carga abandonada no pide conexión ni lanza más consultas: se comprueba
 *   antes de pedir conexión y antes de cada consulta;
 * - antes de cada consulta, `set local statement_timeout` al presupuesto que
 *   QUEDA, no a un valor fijo;
 * - si el pool ya tiene peticiones esperando conexión, no se carga (null);
 * - transacción `read only`; `set local` desaparece al terminar.
 */
export type UpcomingConflicts = { conflicts: ScheduleConflict[]; truncated: boolean };

export const PAGE_BUDGET_MS = 1500;

class LoadAbandoned extends Error {
  constructor() {
    super("Upcoming schedule conflicts load abandoned");
    this.name = "LoadAbandoned";
  }
}

/** Presupuesto restante y abandono de una carga. */
export type LoadGuard = {
  signal: AbortSignal;
  /** Milisegundos que quedan del presupuesto (0 si se agotó). */
  remainingMs: () => number;
};

function assertActive(guard: LoadGuard): void {
  if (guard.signal.aborted || guard.remainingMs() <= 0) throw new LoadAbandoned();
}

/** Peticiones esperando conexión en el pool de node-postgres, si se conoce. */
function poolWaitingCount(): number {
  try {
    const client = (db as unknown as { $client?: { waitingCount?: unknown } }).$client;
    return typeof client?.waitingCount === "number" ? client.waitingCount : 0;
  } catch {
    return 0;
  }
}

async function guardedStatementTimeout(tx: TransactionClient, guard: LoadGuard): Promise<void> {
  assertActive(guard);
  const remaining = Math.max(1, Math.floor(guard.remainingMs()));
  await tx.execute(sql.raw(`set local statement_timeout = '${remaining}ms'`));
  assertActive(guard);
}

/**
 * Carga con un guardián ya creado. La fachada la expone para las pruebas del
 * abandono entre consultas; las páginas usan getUpcomingScheduleConflicts.
 */
export async function loadUpcomingScheduleConflicts(
  input: {
    organizationId: string;
    locationIds: readonly string[];
    viewer: { memberId: string; role: string };
  },
  guard: LoadGuard
): Promise<UpcomingConflicts | null> {
  assertActive(guard);
  if (poolWaitingCount() > 0) {
    logger.warn("Upcoming schedule conflicts skipped: the connection pool is saturated");
    return null;
  }
  return db.transaction(
    async (tx) => {
      const coach = input.viewer.role === "coach";
      // Una sola consulta para el alcance: sedes activas de la academia entre
      // las pedidas y, si mira una entrenadora, sus fichas de equipo.
      await guardedStatementTimeout(tx, guard);
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
        beforeQuery: () => guardedStatementTimeout(tx, guard),
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
  const budgetMs = input.budgetMs ?? PAGE_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const controller = new AbortController();
  const guard: LoadGuard = { signal: controller.signal, remainingMs: () => Math.max(0, deadline - Date.now()) };
  // La carga nunca deja un rechazo sin atender, aunque el temporizador gane.
  const work = loadUpcomingScheduleConflicts(input, guard).catch((error: unknown) => {
    if (!(error instanceof LoadAbandoned)) logger.error("Upcoming schedule conflicts failed", error);
    return null;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      logger.warn("Upcoming schedule conflicts exceeded the page budget");
      resolve(null);
    }, budgetMs);
  });
  try {
    return await Promise.race([work, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
