import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Las tablas de objetivos y observaciones son un candidato pendiente de
 * autorización de Elvis
 * (docs/deployment/candidates/20261111120000_athlete_progress_candidate.sql).
 * Mientras no se apliquen, la sección responde «no disponible» (503) en vez de
 * fallar a mitad de una lectura o escritura. Solo lee el catálogo: nunca crea,
 * repara ni concede nada.
 */
export const ATHLETE_PROGRESS_TABLES = {
  athlete_objectives: [
    "apparatus",
    "athlete_id",
    "client_request_id",
    "created_at",
    "created_by_member_id",
    "discipline",
    "id",
    "location_id",
    "organization_id",
    "revision",
    "status",
    "status_changed_at",
    "status_changed_by_member_id",
    "target_date",
    "title",
    "updated_at",
  ],
  athlete_objective_status_history: [
    "changed_at",
    "changed_by_member_id",
    "from_status",
    "id",
    "objective_id",
    "organization_id",
    "revision",
    "to_status",
  ],
  athlete_observations: [
    "athlete_id",
    "author_member_id",
    "body",
    "client_request_id",
    "created_at",
    "id",
    "location_id",
    "objective_id",
    "observed_on",
    "organization_id",
    "revision",
    "session_id",
    "updated_at",
    "updated_by_member_id",
    "visibility",
  ],
} as const satisfies Record<string, readonly string[]>;

const tableNames = Object.keys(ATHLETE_PROGRESS_TABLES) as Array<keyof typeof ATHLETE_PROGRESS_TABLES>;

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
  tableNames.map((table) => columnsMatch(table, ATHLETE_PROGRESS_TABLES[table])),
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

export async function isAthleteProgressStorageAvailable(client: DatabaseClient): Promise<boolean> {
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

export function athleteProgressStorageUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Los objetivos y observaciones todavía no están activados en esta academia.",
    503
  );
}

export async function assertAthleteProgressStorageAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isAthleteProgressStorageAvailable(client))) throw athleteProgressStorageUnavailable();
}
