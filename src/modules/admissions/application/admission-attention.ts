import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

import { isAdmissionStorageAvailable } from "./admission-storage";

/**
 * Solicitudes de prueba nuevas en las sedes ya autorizadas por el llamador.
 * Devuelve `null` si la tabla candidata no está instalada: el Resumen no
 * muestra entonces ninguna fila de solicitudes.
 */
export async function countNewTrialRequests(
  client: DatabaseClient,
  organizationId: string,
  locationIds: string[]
): Promise<number | null> {
  if (!(await isAdmissionStorageAvailable(client))) return null;
  if (locationIds.length === 0) return 0;
  const result = await client.execute(sql`
    select count(*)::int as count
    from zaltyko.admission_requests
    where organization_id = ${organizationId}::uuid
      and location_id = any(${sqlUuidArray(locationIds)})
      and status = 'new'
  `);
  return Number((result.rows[0] as { count?: number | string } | undefined)?.count ?? 0);
}
