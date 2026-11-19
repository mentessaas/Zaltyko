import { sql, type SQL } from "drizzle-orm";

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
 *
 * La Fase 4 (docs/deployment/candidates/20261118120000_family_collection_events_candidate.sql,
 * también sin aplicar) se instala encima: añade a los intentos el estado
 * requires_action y la columna action_deadline_at, rehace el índice de un
 * intento abierto con requires_action y crea zaltyko.family_collection_disputes.
 * familyCollectionStorageShape() distingue las tres situaciones: "none" (falta
 * algo o no coincide), "phase3" (la Fase 3 tal cual) y "phase4" (la Fase 3 con
 * la Fase 4 encima). El cobro de la Fase 3 funciona con las dos formas; lo de
 * la Fase 4 solo con "phase4".
 */
export const FAMILY_COLLECTION_UNAVAILABLE_REASON = "family_collection_unavailable";

type ColumnSpec = readonly [column: string, dataType: string, isNullable: "YES" | "NO"];

/**
 * Columnas exactas de cada tabla de la Fase 3, con el `data_type` y el
 * `is_nullable` de information_schema.columns. Ordenadas por nombre (collate "C").
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

/**
 * Columnas exactas de cada tabla con la Fase 4 instalada: los intentos ganan
 * action_deadline_at (primera por nombre) y se añade la tabla de disputas.
 * Ordenadas por nombre (collate "C").
 */
export const FAMILY_COLLECTION_EVENTS_TABLES = {
  family_collection_attempt_charges: FAMILY_COLLECTION_TABLES.family_collection_attempt_charges,
  family_collection_attempts: [
    ["action_deadline_at", "timestamp with time zone", "YES"],
    ...FAMILY_COLLECTION_TABLES.family_collection_attempts,
  ],
  family_collection_disputes: [
    ["amount_cents", "bigint", "NO"],
    ["attempt_id", "uuid", "NO"],
    ["closed_at", "timestamp with time zone", "YES"],
    ["created_at", "timestamp with time zone", "NO"],
    ["currency", "text", "NO"],
    ["evidence_due_at", "timestamp with time zone", "YES"],
    ["funds_withdrawn", "boolean", "NO"],
    ["id", "uuid", "NO"],
    ["last_provider_event_id", "uuid", "YES"],
    ["opened_at", "timestamp with time zone", "NO"],
    ["organization_id", "uuid", "NO"],
    ["payment_id", "uuid", "NO"],
    ["provider_charge_reference", "text", "NO"],
    ["provider_dispute_reference", "text", "NO"],
    ["reason_code", "text", "YES"],
    ["reversed_at", "timestamp with time zone", "YES"],
    ["status", "text", "NO"],
    ["updated_at", "timestamp with time zone", "NO"],
  ],
  organization_collection_settings: FAMILY_COLLECTION_TABLES.organization_collection_settings,
} as const satisfies Record<string, readonly ColumnSpec[]>;

/** Índice que impide dos intentos no terminales de la misma factura. */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX = "family_collection_attempts_open_uq";
/** Columnas del índice, en orden (iguales en las dos fases). */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS = ["organization_id", "invoice_id"] as const;
/**
 * Predicado del índice tal como lo devuelve pg_get_expr(indpred, indrelid)
 * para `where status in ('claimed', 'created', 'processing')` (Fase 3). Se
 * acepta con o sin paréntesis exteriores.
 */
export const FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE =
  "status = ANY (ARRAY['claimed'::text, 'created'::text, 'processing'::text])";
/** El mismo predicado con la Fase 4: cuenta también `requires_action`. */
export const FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE =
  "status = ANY (ARRAY['claimed'::text, 'created'::text, 'processing'::text, 'requires_action'::text])";

/** Restricciones únicas de las que depende no cobrar dos veces, con sus columnas en orden. */
export const FAMILY_COLLECTION_UNIQUE_CONSTRAINTS = {
  family_collection_attempts_number_uq: ["organization_id", "invoice_id", "attempt_number"],
  family_collection_attempts_intent_uq: ["organization_id", "provider_payment_intent_reference"],
} as const satisfies Record<string, readonly string[]>;

/** Fase 4: una sola fila por disputa (dp_…/du_…) y academia. */
export const FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT = {
  name: "family_collection_disputes_reference_uq",
  table: "family_collection_disputes",
  columns: ["organization_id", "provider_dispute_reference"],
} as const;

export type FamilyCollectionStorageShape = "none" | "phase3" | "phase4";

type TableSpecs = Readonly<Record<string, readonly ColumnSpec[]>>;

/**
 * Lista de textos como array de PostgreSQL, con cada valor como parámetro.
 * Sin SQL crudo: nada de este archivo se inserta en la consulta como texto.
 */
function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
}

function columnsMatch(table: string, columns: readonly ColumnSpec[]): SQL {
  const expected = columns.map(([column, dataType, isNullable]) => `${column}|${dataType}|${isNullable}`);
  return sql`coalesce((
      select array_agg(
               column_name::text || '|' || data_type::text || '|' || is_nullable::text
               order by column_name::text collate "C"
             )
        from information_schema.columns
       where table_schema = 'zaltyko'
         and table_name = ${table}
    ) = ${textArray(expected)}, false)`;
}

function allColumnsMatch(specs: TableSpecs): SQL {
  return sql.join(
    Object.entries(specs).map(([table, columns]) => columnsMatch(table, columns)),
    sql` and `
  );
}

/** Columnas de una restricción única de una tabla del cobro, en orden. */
function uniqueConstraintMatches(table: string, name: string, columns: readonly string[]): SQL {
  return sql`coalesce((
      select array_agg(a.attname::text order by k.ord)
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.conrelid = to_regclass(${`zaltyko.${table}`})
         and c.conname = ${name}
         and c.contype = 'u'
    ) = ${textArray(columns)}, false)`;
}

function attemptUniqueConstraintsMatch(): SQL {
  return sql.join(
    Object.entries(FAMILY_COLLECTION_UNIQUE_CONSTRAINTS).map(([name, columns]) =>
      uniqueConstraintMatches("family_collection_attempts", name, columns)
    ),
    sql` and `
  );
}

/** El índice parcial existe, es único y válido, y tiene las columnas y el predicado esperados. */
function openAttemptIndexMatches(predicate: string): SQL {
  return sql`exists (
    select 1
      from pg_index i
     where i.indexrelid = to_regclass(${`zaltyko.${FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX}`})
       and i.indrelid = to_regclass('zaltyko.family_collection_attempts')
       and i.indisunique
       and i.indisvalid
       and pg_get_expr(i.indpred, i.indrelid) in (
         ${predicate},
         ${`(${predicate})`}
       )
       and (
         select array_agg(a.attname::text order by k.ord)
           from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
       ) = ${textArray(FAMILY_COLLECTION_OPEN_ATTEMPT_INDEX_COLUMNS)}
  )`;
}

/**
 * ¿Qué forma tiene el almacenamiento del cobro automático? Una sola consulta
 * al catálogo con las dos comprobaciones completas: "phase4" si coincide la
 * forma de la Fase 4, "phase3" si coincide la de la Fase 3 y "none" en
 * cualquier otro caso (incluida una mezcla de las dos: falla cerrado).
 */
export async function familyCollectionStorageShape(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<FamilyCollectionStorageShape> {
  // La consulta se construye en cada llamada, no al cargar el módulo: el
  // libro de cuotas importa este archivo y algunos tests simulan `sql`.
  const dispute = FAMILY_COLLECTION_DISPUTE_UNIQUE_CONSTRAINT;
  const result = await executor.execute(sql`
    select (
      ${allColumnsMatch(FAMILY_COLLECTION_TABLES)}
      and ${attemptUniqueConstraintsMatch()}
      and ${openAttemptIndexMatches(FAMILY_COLLECTION_OPEN_ATTEMPT_PREDICATE)}
    ) as phase3,
    (
      ${allColumnsMatch(FAMILY_COLLECTION_EVENTS_TABLES)}
      and ${attemptUniqueConstraintsMatch()}
      and ${uniqueConstraintMatches(dispute.table, dispute.name, dispute.columns)}
      and ${openAttemptIndexMatches(FAMILY_COLLECTION_EVENTS_OPEN_ATTEMPT_PREDICATE)}
    ) as phase4
  `);
  const row = result.rows[0] as { phase3?: unknown; phase4?: unknown } | undefined;
  if (row?.phase4 === true) return "phase4";
  if (row?.phase3 === true) return "phase3";
  return "none";
}

/** El cobro de la Fase 3 funciona con la forma de la Fase 3 y con la de la Fase 4. */
export async function isFamilyCollectionStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  return (await familyCollectionStorageShape(executor)) !== "none";
}

/** Eventos, confirmación con el banco y disputas (Fase 4): solo con la forma "phase4". */
export async function isFamilyCollectionEventsStorageAvailable(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  return (await familyCollectionStorageShape(executor)) === "phase4";
}

/**
 * ¿Existe la tabla de los recordatorios de pago (otro candidato,
 * 20261114120500_payment_reminders_candidate.sql)? Sin ella no se pudo enviar
 * ningún recordatorio. La misma comprobación que hace el almacén del cobro
 * antes de mirar si ya salió uno (readReminderSent): solo el catálogo.
 */
export async function isPaymentRemindersTablePresent(
  executor: Pick<DatabaseClient, "execute"> = db
): Promise<boolean> {
  const result = await executor.execute(sql`
    select to_regclass('zaltyko.payment_reminders') is not null as "present"
  `);
  return (result.rows[0] as { present?: unknown } | undefined)?.present === true;
}
