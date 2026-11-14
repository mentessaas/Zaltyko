import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient } from "@/lib/db-transactions";
import { isFamilyAccessFlagOn } from "@/modules/family-access/domain/family-access-contract";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * El alta de familias y los avisos dependen de un candidato pendiente de
 * autorización de Elvis
 * (docs/deployment/candidates/20261114120000_family_access_notices_candidate.sql)
 * y de la bandera ZALTYKO_FAMILY_ACCESS_ENABLED, apagada por defecto.
 * Sin las dos cosas, toda la función responde «no disponible» (503) y sus
 * accesos se ocultan. Solo lee el catálogo: nunca crea, repara ni concede nada.
 */
export const FAMILY_ACCESS_TABLES = {
  guardian_access_invitations: [
    "accepted_at",
    "accepted_by_user_id",
    "created_at",
    "expires_at",
    "grant_links",
    "grant_view_athletes",
    "guardian_id",
    "id",
    "invited_by_member_id",
    "last_sent_at",
    "normalized_email",
    "organization_id",
    "revision",
    "revoked_at",
    "revoked_by_member_id",
    "status",
    "token_sha256",
    "updated_at",
  ],
  family_notices: [
    "body",
    "class_template_id",
    "created_at",
    "created_by_member_id",
    "dedupe_key",
    "group_id",
    "id",
    "kind",
    "location_id",
    "organization_id",
    "session_id",
    "title",
  ],
  family_notice_recipients: [
    "created_at",
    "email_attempted_at",
    "email_attempts",
    "email_status",
    "guardian_id",
    "id",
    "notice_id",
    "organization_id",
    "read_at",
  ],
  guardian_notification_preferences: [
    "email_manual_notices",
    "email_session_changes",
    "guardian_id",
    "organization_id",
    "updated_at",
  ],
} as const satisfies Record<string, readonly string[]>;

const tableNames = Object.keys(FAMILY_ACCESS_TABLES) as Array<keyof typeof FAMILY_ACCESS_TABLES>;

function qualified(table: string) {
  return sql.raw(`'zaltyko.${table}'`);
}

function columnsMatch(table: string, columns: readonly string[]) {
  return sql`(select array_agg(column_name::text order by column_name::text collate "C")
      from information_schema.columns
     where table_schema = 'zaltyko' and table_name = ${table})
    = ${sql.raw(`array[${columns.map((column) => `'${column}'`).join(",")}]::text[]`)}`;
}

const relationsPresent = sql.join(
  tableNames.map((table) => sql`to_regclass(${qualified(table)}) is not null`),
  sql` and `
);
const allColumnsMatch = sql.join(
  tableNames.map((table) => columnsMatch(table, FAMILY_ACCESS_TABLES[table])),
  sql` and `
);
const regclassList = sql.join(
  tableNames.map((table) => sql`to_regclass(${qualified(table)})`),
  sql`, `
);
const anyClientPrivilege = sql.join(
  tableNames.map(
    (table) => sql`has_table_privilege(r.oid, ${qualified(table)}, 'SELECT,INSERT,UPDATE,DELETE')`
  ),
  sql` or `
);

/** Candidato instalado exactamente: tablas, columnas, RLS forzado y sin acceso de clientes. */
export async function isFamilyAccessStorageAvailable(client: DatabaseClient): Promise<boolean> {
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
      else false end as available
  `);
  return (result.rows[0] as { available?: unknown } | undefined)?.available === true;
}

export function familyAccessUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El acceso de familias y los avisos todavía no están activados.",
    503
  );
}

/** Bandera exacta; se comprueba antes de abrir ninguna conexión. */
export function assertFamilyAccessFlag(): void {
  if (!isFamilyAccessFlagOn()) throw familyAccessUnavailable();
}

export async function assertFamilyAccessStorage(client: DatabaseClient): Promise<void> {
  if (!(await isFamilyAccessStorageAvailable(client))) throw familyAccessUnavailable();
}

/**
 * Para las páginas: bandera encendida y candidato instalado. Ante cualquier
 * fallo responde false, porque ocultar un acceso nunca rompe nada.
 */
export async function isFamilyAccessAvailableForPage(client: DatabaseClient = db): Promise<boolean> {
  if (!isFamilyAccessFlagOn()) return false;
  try {
    return await isFamilyAccessStorageAvailable(client);
  } catch {
    return false;
  }
}

/**
 * Para la página de la academia con la bandera apagada: si el candidato está
 * instalado, todavía se puede retirar el acceso a las cuentas ya vinculadas.
 */
export async function isFamilyAccessStorageInstalledForPage(client: DatabaseClient = db): Promise<boolean> {
  try {
    return await isFamilyAccessStorageAvailable(client);
  } catch {
    return false;
  }
}
