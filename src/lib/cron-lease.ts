import { sql } from "drizzle-orm";

import { db } from "@/db";

export interface CronLeaseResult<T> {
  acquired: boolean;
  value?: T;
}

/**
 * Evita ejecuciones solapadas del mismo cron mediante un advisory lock
 * transaccional. La transacción permanece abierta mientras corre el job y
 * PostgreSQL libera el lock automáticamente en commit/rollback o desconexión.
 */
export async function runCronWithLease<T>(
  leaseName: string,
  job: () => Promise<T>
): Promise<CronLeaseResult<T>> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`select pg_try_advisory_xact_lock(hashtext(${leaseName})) as acquired`
    );
    const rows = result.rows as Array<{ acquired?: boolean }>;
    if (rows[0]?.acquired !== true) {
      return { acquired: false };
    }

    return { acquired: true, value: await job() };
  });
}
