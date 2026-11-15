import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

/**
 * `public.usage_events` es un candidato pendiente de autorización de Elvis
 * (docs/deployment/candidates/20261114130000_habitual_use_candidate.sql) y va
 * detrás de ZALTYKO_USAGE_METRICS_ENABLED (apagada por defecto). Mientras la tabla
 * no exista tal como la define el candidato, no se registra nada y la vista de
 * super-admin responde «no disponible», en vez de fallar a mitad de una lectura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 *
 * Los avisos (entrenadoras y resumen semanal) NO usan esta tabla: se deduplican
 * con email_logs y se desactivan con un enlace firmado, así que funcionan sin ella.
 */
export const USAGE_EVENTS_COLUMNS = [
  "actor_ref",
  "actor_role",
  "created_at",
  "event_name",
  "id",
  "occurred_on",
  "occurrences",
  "organization_id",
  "updated_at",
] as const;

export async function isUsageStorageAvailable(client: DatabaseClient): Promise<boolean> {
  const columns = USAGE_EVENTS_COLUMNS.map((column) => `'${column}'`).join(",");
  const result = await client.execute(sql`
    select case
      when to_regclass('public.usage_events') is not null then
        (select array_agg(column_name::text order by column_name::text collate "C")
           from information_schema.columns
          where table_schema = 'public' and table_name = 'usage_events')
        = ${sql.raw(`array[${columns}]::text[]`)}
        and (select c.relrowsecurity and c.relforcerowsecurity
               from pg_class c where c.oid = to_regclass('public.usage_events'))
        and not coalesce((
          select bool_or(has_table_privilege(r.oid, 'public.usage_events', 'SELECT,INSERT,UPDATE,DELETE'))
            from pg_roles r where r.rolname in ('anon', 'authenticated')
        ), false)
      else false
    end as available
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}

const CACHE_TTL_MS = 60_000;
let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * Misma comprobación con caché de un minuto, para el registro de eventos, que
 * corre en cada visita y no debe consultar el catálogo cada vez.
 */
export async function isUsageStorageAvailableCached(now: number = Date.now()): Promise<boolean> {
  if (cached && cached.expiresAt > now) return cached.value;
  let value = false;
  try {
    value = await isUsageStorageAvailable(db);
  } catch {
    value = false;
  }
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function resetUsageStorageCache(): void {
  cached = null;
}
