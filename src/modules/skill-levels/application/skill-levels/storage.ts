import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import {
  isSkillLevelsFlagOn,
  SKILL_LEVELS_UNAVAILABLE_REASON,
} from "@/modules/skill-levels/domain/skill-levels";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Niveles y progresión: dos condiciones para que exista.
 * 1. La bandera ZALTYKO_SKILL_LEVELS_ENABLED=true (apagada por defecto).
 * 2. Las cinco tablas del candidato SQL instaladas exactamente como se
 *    revisaron (docs/deployment/candidates/20261114120000_skill_levels_candidate.sql),
 *    que requiere autorización de Elvis.
 * Mientras falte cualquiera, todo responde «no disponible» (503) en vez de
 * fallar a mitad de una lectura o escritura. Solo lee el catálogo: nunca crea,
 * repara ni concede nada.
 */
export const SKILL_LEVELS_TABLES = {
  skill_templates: [
    "archived_at",
    "client_request_id",
    "created_at",
    "created_by_member_id",
    "description",
    "discipline",
    "id",
    "name",
    "organization_id",
    "revision",
    "source",
    "starter_key",
    "updated_at",
    "updated_by_member_id",
  ],
  skill_levels: [
    "archived_at",
    "created_at",
    "description",
    "id",
    "name",
    "organization_id",
    "position",
    "template_id",
    "updated_at",
  ],
  skill_elements: [
    "apparatus",
    "archived_at",
    "created_at",
    "description",
    "id",
    "is_required",
    "level_id",
    "name",
    "organization_id",
    "position",
    "template_id",
    "updated_at",
  ],
  athlete_skill_progress: [
    "achieved_on",
    "athlete_id",
    "created_at",
    "element_id",
    "evaluated_at",
    "evaluated_by_member_id",
    "id",
    "location_id",
    "organization_id",
    "revision",
    "status",
    "template_id",
    "updated_at",
  ],
  athlete_level_passes: [
    "athlete_id",
    "client_request_id",
    "created_at",
    "id",
    "level_id",
    "location_id",
    "organization_id",
    "passed_by_member_id",
    "passed_on",
    "template_id",
  ],
} as const satisfies Record<string, readonly string[]>;

const tableNames = Object.keys(SKILL_LEVELS_TABLES) as Array<keyof typeof SKILL_LEVELS_TABLES>;

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
  tableNames.map((table) => columnsMatch(table, SKILL_LEVELS_TABLES[table])),
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

/** Solo las tablas (sin mirar la bandera): lo usan las pruebas de contrato y de PostgreSQL. */
export async function isSkillLevelsStorageInstalled(client: DatabaseClient): Promise<boolean> {
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

/** Bandera encendida y tablas instaladas. Con la bandera apagada no consulta el catálogo. */
export async function isSkillLevelsAvailable(client: DatabaseClient): Promise<boolean> {
  if (!isSkillLevelsFlagOn()) return false;
  return isSkillLevelsStorageInstalled(client);
}

export function skillLevelsUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Los niveles y la progresión todavía no están activados en esta academia.",
    503,
    { reason: SKILL_LEVELS_UNAVAILABLE_REASON }
  );
}

/**
 * Para las páginas: decide si se muestran los accesos y las secciones. Ante
 * cualquier fallo responde false, porque ocultar un acceso nunca rompe nada.
 */
export async function isSkillLevelsAvailableForPage(client: DatabaseClient): Promise<boolean> {
  try {
    return await isSkillLevelsAvailable(client);
  } catch {
    return false;
  }
}

export async function assertSkillLevelsAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isSkillLevelsAvailable(client))) throw skillLevelsUnavailable();
}
