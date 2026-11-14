import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Los recordatorios de impago son un candidato pendiente de autorización de
 * Elvis (docs/deployment/candidates/20261114120000_payment_reminders_candidate.sql)
 * y van detrás de ZALTYKO_PAYMENT_REMINDERS_ENABLED (apagada por defecto).
 * Con la bandera apagada, o mientras las tablas no existan tal como las define
 * el candidato, toda la función responde «no disponible» y sus accesos se
 * ocultan, en vez de fallar a mitad de una lectura o escritura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 */
export const PAYMENT_REMINDERS_TABLES = {
  payment_reminder_settings: [
    "auto_after_days",
    "body_template",
    "created_at",
    "is_auto_enabled",
    "min_interval_days",
    "organization_id",
    "payment_instructions",
    "reply_to_email",
    "subject_template",
    "updated_at",
    "updated_by_member_id",
    "version",
  ],
  payment_reminders: [
    "charge_id",
    "created_at",
    "currency",
    "email_group_id",
    "guardian_id",
    "id",
    "organization_id",
    "origin",
    "outstanding_cents",
    "requested_by_member_id",
    "sent_at",
    "status",
  ],
} as const satisfies Record<string, readonly string[]>;

export const PAYMENT_REMINDERS_UNAVAILABLE_REASON = "payment_reminders_unavailable";

const tableNames = Object.keys(PAYMENT_REMINDERS_TABLES) as Array<keyof typeof PAYMENT_REMINDERS_TABLES>;

export function isPaymentRemindersFlagEnabled(): boolean {
  return process.env.ZALTYKO_PAYMENT_REMINDERS_ENABLED === "true";
}

/** El recordatorio automático tiene su propia bandera global, además del ajuste de cada academia. */
export function isAutomaticPaymentRemindersFlagEnabled(): boolean {
  return isPaymentRemindersFlagEnabled() && process.env.ZALTYKO_PAYMENT_REMINDERS_AUTO_ENABLED === "true";
}

function columnsMatch(table: string, columns: readonly string[]) {
  return sql`(select array_agg(column_name::text order by column_name::text collate "C")
      from information_schema.columns
     where table_schema = 'zaltyko' and table_name = ${table})
    = ${sql.raw(`array[${columns.map((column) => `'${column}'`).join(",")}]::text[]`)}`;
}

function qualified(table: string) {
  return sql.raw(`'zaltyko.${table}'`);
}

const relationsPresent = sql.join(
  tableNames.map((table) => sql`to_regclass(${qualified(table)}) is not null`),
  sql` and `
);
const allColumnsMatch = sql.join(
  tableNames.map((table) => columnsMatch(table, PAYMENT_REMINDERS_TABLES[table])),
  sql` and `
);
const regclassList = sql.join(
  tableNames.map((table) => sql`to_regclass(${qualified(table)})`),
  sql`, `
);
const anyClientPrivilege = sql.join(
  tableNames.map((table) => sql`has_table_privilege(r.oid, ${qualified(table)}, 'SELECT,INSERT,UPDATE,DELETE')`),
  sql` or `
);

export async function isPaymentRemindersStorageAvailable(client: DatabaseClient): Promise<boolean> {
  const result = await client.execute(sql`
    select case
      when ${relationsPresent} then
        ${allColumnsMatch}
        and (select count(*) = ${tableNames.length} from pg_class c
              where c.oid in (${regclassList})
                and c.relrowsecurity and c.relforcerowsecurity)
        and not coalesce((
          select bool_or(${anyClientPrivilege})
            from pg_roles r where r.rolname in ('anon', 'authenticated')
        ), false)
      else false
    end as available
  `);
  return (result.rows[0] as { available?: boolean } | undefined)?.available === true;
}

function unavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Los recordatorios de cuotas todavía no están disponibles.",
    503,
    { reason: PAYMENT_REMINDERS_UNAVAILABLE_REASON }
  );
}

/** Bandera y almacenamiento: lanza 503 si cualquiera de los dos falta. */
export async function assertPaymentRemindersAvailable(client: DatabaseClient): Promise<void> {
  if (!isPaymentRemindersFlagEnabled()) throw unavailable();
  if (!(await isPaymentRemindersStorageAvailable(client))) throw unavailable();
}

/** Para ocultar el acceso en la interfaz sin lanzar. */
export async function arePaymentRemindersAvailable(client: DatabaseClient): Promise<boolean> {
  if (!isPaymentRemindersFlagEnabled()) return false;
  try {
    return await isPaymentRemindersStorageAvailable(client);
  } catch {
    return false;
  }
}
