import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

/**
 * El cobro automático de cuotas (Fase 3) necesita las tres tablas de un
 * candidato (docs/deployment/candidates/20261117120000_family_collection_candidate.sql,
 * sin aplicar en ningún entorno; requiere autorización de Elvis):
 * zaltyko.family_collection_attempts, zaltyko.family_collection_attempt_charges
 * y zaltyko.organization_collection_settings. Mientras no existan tal como las
 * define el candidato (mismas columnas, tipos y nulos, y el índice que impide
 * dos cobros a la vez de una factura), el cobro no se ejecuta y la función
 * responde «no disponible» en vez de fallar a mitad de una lectura o escritura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 */
export const FAMILY_COLLECTION_UNAVAILABLE_REASON = "family_collection_unavailable";

type ColumnSpec = readonly [column: string, dataType: string, isNullable: "YES" | "NO"];

/**
 * Columnas exactas de cada tabla, con el `data_type` y el `is_nullable` de
 * information_schema.columns. Ordenadas por nombre (collate "C").
 */
export const FAMILY_COLLECTION_TABLES = {
  family_collection_attempt_charges: [
    ["amount_cents", "bigint", "NO"],
    ["attempt_id", "uuid", "NO"],
    ["charge_id", "uuid", "NO"],
    ["organization_id", "uuid", "NO"],
  ],
  family_collection_attempts: [
    ["allocation_status", "text", "YES"],
    ["amount_cents", "bigint", "NO"],
    ["attempt_number", "integer", "NO"],
    ["authorization_id", "uuid", "YES"],
    ["claimed_at", "timestamp with time zone", "NO"],
    ["completed_at", "timestamp with time zone", "YES"],
    ["created_at", "timestamp with time zone", "NO"],
    ["currency", "text", "NO"],
    ["decline_code", "text", "YES"],
    ["failure_code", "text", "YES"],
    ["family_id", "uuid", "NO"],
    ["family_payer_id", "uuid", "YES"],
    ["id", "uuid", "NO"],
    ["invoice_id", "uuid", "NO"],
    ["location_id", "uuid", "NO"],
    ["next_retry_at", "timestamp with time zone", "YES"],
    ["organization_id", "uuid", "NO"],
    ["payment_id", "uuid", "YES"],
    ["payment_method_kind", "text", "YES"],
    ["payment_provider_account_id", "uuid", "YES"],
    ["provider_payment_intent_reference", "text", "YES"],
    ["resume_count", "integer", "NO"],
    ["status", "text", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  organization_collection_settings: [
    ["collection_day_of_month", "smallint", "YES"],
    ["organization_id", "uuid", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
    ["updated_by_member_id", "uuid", "YES"],
    ["version", "integer", "NO"],
  ],
} as const satisfies Record<string, readonly ColumnSpec[]>;

/** Índice que impide dos intentos no terminales de la misma factura. */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX = "family_collection_attempts_open_uq";

const tableNames = Object.keys(FAMILY_COLLECTION_TABLES) as Array<keyof typeof FAMILY_COLLECTION_TABLES>;

/** Literal SQL de constantes de este archivo (nunca de datos de usuario). */
function textArrayLiteral(values: readonly string[]): string {
  return `array[${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")}]::text[]`;
}

function columnsMatch(table: keyof typeof FAMILY_COLLECTION_TABLES) {
  const expected = (FAMILY_COLLECTION_TABLES[table] as readonly ColumnSpec[]).map(
    ([column, dataType, isNullable]) => `${column}|${dataType}|${isNullable}`
  );
  return sql`coalesce((
      select array_agg(
               column_name::text || '|' || data_type::text || '|' || is_nullable::text
               order by column_name::text collate "C"
             )
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = ${table}
    ) = ${sql.raw(textArrayLiteral(expected))}, false)`;
}

const allColumnsMatch = sql.join(
  tableNames.map((table) => columnsMatch(table)),
  sql` and `
);

export async function isFamilyCollectionStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  const result = await executor.execute(sql`
    select (
      ${allColumnsMatch}
      and exists (
        select 1
          from pg_indexes
         where schemaname = 'zaltyko'
           and tablename = 'family_collection_attempts'
           and indexname = ${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}
      )
    ) as available
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}
