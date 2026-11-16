import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";

/**
 * El cobro automático de cuotas (Fase 3) necesita las tres tablas de un
 * candidato (docs/deployment/candidates/20261117120000_family_collection_candidate.sql,
 * sin aplicar en ningún entorno; requiere autorización de Elvis):
 * zaltyko.family_collection_attempts, zaltyko.family_collection_attempt_charges
 * y zaltyko.organization_collection_settings. Mientras no existan tal como las
 * define el candidato (mismas columnas, tipos y nulos; el índice único parcial
 * que impide dos cobros a la vez de una factura, con sus columnas y su
 * predicado; y los únicos de número de intento y de pi_), el cobro no se
 * ejecuta y la función
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
/** Columnas del índice, en orden. */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS = ["organization_id", "invoice_id"] as const;
/**
 * Predicado del índice tal como lo devuelve pg_get_expr(indpred, indrelid)
 * para `where status in ('claimed', 'created', 'processing')`. Se acepta con o
 * sin paréntesis exteriores.
 */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE =
  "status = ANY (ARRAY['claimed'::text, 'created'::text, 'processing'::text])";

/** Restricciones únicas de las que depende no cobrar dos veces, con sus columnas en orden. */
export const FAMILY_COLLECTION_UNIQUE_CONSTRAINTS = {
  family_collection_attempts_number_uq: ["organization_id", "invoice_id", "attempt_number"],
  family_collection_attempts_intent_uq: ["organization_id", "provider_payment_intent_reference"],
} as const satisfies Record<string, readonly string[]>;

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

/** Columnas de una restricción única de family_collection_attempts, en orden. */
function uniqueConstraintMatches(name: string, columns: readonly string[]) {
  return sql`coalesce((
      select array_agg(a.attname::text order by k.ord)
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.conrelid = to_regclass('zaltyko.family_collection_attempts')
         and c.conname = ${name}
         and c.contype = 'u'
    ) = ${sql.raw(textArrayLiteral(columns))}, false)`;
}

const uniqueConstraintsMatch = sql.join(
  Object.entries(FAMILY_COLLECTION_UNIQUE_CONSTRAINTS).map(([name, columns]) => uniqueConstraintMatches(name, columns)),
  sql` and `
);

/** El índice parcial existe, es único y válido, y tiene las columnas y el predicado esperados. */
const openAttemptIndexMatches = sql`exists (
    select 1
      from pg_index i
     where i.indexrelid = to_regclass(${`zaltyko.${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}`})
       and i.indrelid = to_regclass('zaltyko.family_collection_attempts')
       and i.indisunique
       and i.indisvalid
       and pg_get_expr(i.indpred, i.indrelid) in (
         ${FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE},
         ${`(${FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE})`}
       )
       and (
         select array_agg(a.attname::text order by k.ord)
           from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
       ) = ${sql.raw(textArrayLiteral(FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS))}
  )`;

export async function isFamilyCollectionStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  const result = await executor.execute(sql`
    select (
      ${allColumnsMatch}
      and ${uniqueConstraintsMatch}
      and ${openAttemptIndexMatches}
    ) as available
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}
