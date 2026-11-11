import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { SESSION_PLANS_UNAVAILABLE_REASON } from "@/modules/session-plans/domain/session-plan";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Las tablas de planificación son un candidato pendiente de autorización de
 * Elvis (docs/deployment/candidates/20261111200000_session_plans_candidate.sql).
 * Mientras no se apliquen, la sección responde «no disponible» (503) en vez de
 * fallar a mitad de una lectura o escritura. Solo lee el catálogo: nunca crea,
 * repara ni concede nada.
 */
export const SESSION_PLAN_TABLES = {
  session_plans: [
    "client_request_id",
    "created_at",
    "created_by_member_id",
    "focus",
    "from_template_revision",
    "id",
    "last_request_id",
    "location_id",
    "note",
    "organization_id",
    "revision",
    "session_id",
    "updated_at",
    "updated_by_member_id",
  ],
  session_plan_blocks: [
    "apparatus",
    "content",
    "created_at",
    "discipline",
    "done_at",
    "done_by_member_id",
    "duration_minutes",
    "id",
    "kind",
    "organization_id",
    "plan_id",
    "position",
  ],
  session_plan_objectives: ["athlete_id", "created_at", "objective_id", "organization_id", "plan_id"],
  class_plan_templates: [
    "blocks",
    "class_template_id",
    "focus",
    "id",
    "location_id",
    "note",
    "organization_id",
    "revision",
    "updated_at",
    "updated_by_member_id",
  ],
} as const satisfies Record<string, readonly string[]>;

const tableNames = Object.keys(SESSION_PLAN_TABLES) as Array<keyof typeof SESSION_PLAN_TABLES>;

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
  tableNames.map((table) => columnsMatch(table, SESSION_PLAN_TABLES[table])),
  sql` and `
);
const regclassList = sql.join(
  tableNames.map((table) => sql`to_regclass(${qualified(table)})`),
  sql`, `
);
/**
 * Editar el guion reordena bloques en su sitio: la unicidad de posición tiene
 * que ser DEFERRABLE INITIALLY DEFERRED. Sin ella, la sección queda «no
 * disponible» en vez de fallar al reordenar.
 */
const positionDeferred = sql`coalesce((
    select bool_and(con.condeferrable and con.condeferred)
      from pg_constraint con
     where con.conrelid = to_regclass('zaltyko.session_plan_blocks')
       and con.conname = 'session_plan_blocks_position_uq'
       and con.contype = 'u'
  ), false)`;

const anyClientPrivilege = sql.join(
  tableNames.map(
    (table) => sql`has_table_privilege(r.oid, ${qualified(table)}, 'SELECT,INSERT,UPDATE,DELETE')`
  ),
  sql` or `
);

export async function isSessionPlanStorageAvailable(client: DatabaseClient): Promise<boolean> {
  const result = await client.execute(sql`
    select case
      when ${relationsPresent} then
        ${allColumnsMatch}
        and ${positionDeferred}
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

export function sessionPlanStorageUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El guion de las sesiones todavía no está activado en esta academia.",
    503,
    { reason: SESSION_PLANS_UNAVAILABLE_REASON }
  );
}

/**
 * Para las páginas: decide si se muestran los accesos a la sección. Ante
 * cualquier fallo responde false, porque ocultar un acceso nunca rompe nada.
 */
export async function isSessionPlanAvailableForPage(client: DatabaseClient): Promise<boolean> {
  try {
    return await isSessionPlanStorageAvailable(client);
  } catch {
    return false;
  }
}

export async function assertSessionPlanStorageAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isSessionPlanStorageAvailable(client))) throw sessionPlanStorageUnavailable();
}
