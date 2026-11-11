import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { COACH_ASSIGNMENT_UNAVAILABLE_REASON } from "@/modules/coach-assignment/domain/coach-assignment";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Las titulares por clase y la marca de sustitución son un candidato pendiente
 * de autorización de Elvis
 * (docs/deployment/candidates/20261111180000_coach_assignment_candidate.sql).
 * Mientras no se apliquen, toda la función responde «no disponible» (503) y
 * sus accesos se ocultan, en vez de fallar a mitad de una lectura o escritura.
 * Solo lee el catálogo: nunca crea, repara ni concede nada.
 */
export const COACH_ASSIGNMENT_TABLES = {
  class_template_staff: [
    "assigned_at",
    "assigned_by_member_id",
    "class_template_id",
    "id",
    "organization_id",
    "staff_profile_id",
  ],
  session_staff_overrides: [
    "changed_at",
    "changed_by_member_id",
    "id",
    "organization_id",
    "reason",
    "session_id",
  ],
} as const satisfies Record<string, readonly string[]>;

const tableNames = Object.keys(COACH_ASSIGNMENT_TABLES) as Array<keyof typeof COACH_ASSIGNMENT_TABLES>;

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
  tableNames.map((table) => columnsMatch(table, COACH_ASSIGNMENT_TABLES[table])),
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

export async function isCoachAssignmentStorageAvailable(client: DatabaseClient): Promise<boolean> {
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

export function coachAssignmentStorageUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "La asignación de entrenadoras todavía no está activada en esta academia.",
    503,
    { reason: COACH_ASSIGNMENT_UNAVAILABLE_REASON }
  );
}

/**
 * Para las páginas: decide si se muestran los accesos. Ante cualquier fallo
 * responde false, porque ocultar un acceso nunca rompe nada.
 */
export async function isCoachAssignmentAvailableForPage(client: DatabaseClient): Promise<boolean> {
  try {
    return await isCoachAssignmentStorageAvailable(client);
  } catch {
    return false;
  }
}

export async function assertCoachAssignmentStorageAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isCoachAssignmentStorageAvailable(client))) throw coachAssignmentStorageUnavailable();
}
