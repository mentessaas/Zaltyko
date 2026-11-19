import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import {
  ELEMENT_LIBRARY_UNAVAILABLE_REASON,
  isElementLibraryFlagOn,
} from "@/modules/element-library/domain/element-library";
import {
  ELEMENT_LIBRARY_TABLES,
  type ElementLibraryTable,
} from "@/modules/element-library/infrastructure/element-library-schema";
import { getSessionPlanStorageShape } from "@/modules/session-plans/application/session-plan-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getSkillLevelsStorageShape } from "@/modules/skill-levels/application/skill-level-service";
import { isSkillLevelsFlagOn } from "@/modules/skill-levels/domain/skill-levels";

/**
 * Biblioteca de elementos (ADR-0029 §1, §2 y §9): para que exista hacen falta
 * 1. las banderas ZALTYKO_ELEMENT_LIBRARY_ENABLED y ZALTYKO_SKILL_LEVELS_ENABLED;
 * 2. las cinco tablas de las candidatas
 *    (docs/deployment/candidates/20261119120000_element_library_candidate.sql y
 *    20261119120500_element_library_notes_candidate.sql) con sus columnas
 *    exactas, RLS forzado y sin privilegios de anon ni authenticated;
 * 3. niveles y guiones instalados con las columnas de enlace
 *    (`with_catalog_links`).
 * Mientras falte cualquiera, todo responde «no disponible» (503) en vez de
 * fallar a mitad de una lectura o escritura. Solo lee el catálogo de
 * PostgreSQL: nunca crea, repara ni concede nada.
 */

const tableNames = Object.keys(ELEMENT_LIBRARY_TABLES) as ElementLibraryTable[];

function qualified(table: string) {
  return sql.raw(`'zaltyko.${table}'`);
}

/** Columnas exactas, en el orden de la comparación (collate "C"). */
function columnsMatch(table: ElementLibraryTable) {
  const columns = [...ELEMENT_LIBRARY_TABLES[table]].sort();
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
  tableNames.map((table) => columnsMatch(table)),
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

/**
 * Solo las tablas de la biblioteca (sin banderas). Los CASE anidados evalúan
 * los privilegios solo cuando las cinco relaciones existen.
 */
export async function isElementLibraryStorageInstalled(client: DatabaseClient): Promise<boolean> {
  const result = await client.execute(sql`
    select case
      when ${relationsPresent} then
        (select count(*) = ${tableNames.length} from pg_class c
          where c.oid in (${regclassList})
            and c.relrowsecurity and c.relforcerowsecurity)
        and not coalesce((
          select bool_or(${anyClientPrivilege})
            from pg_roles r where r.rolname in ('anon', 'authenticated')
        ), false)
        and ${allColumnsMatch}
      else false end as installed
  `);
  return (result.rows[0] as { installed?: unknown } | undefined)?.installed === true;
}

/**
 * Banderas encendidas, tablas de la biblioteca exactas y niveles y guiones con
 * las columnas de enlace. Con una bandera apagada no consulta el catálogo.
 */
export async function isElementLibraryAvailable(client: DatabaseClient): Promise<boolean> {
  if (!isElementLibraryFlagOn() || !isSkillLevelsFlagOn()) return false;
  if (!(await isElementLibraryStorageInstalled(client))) return false;
  if ((await getSkillLevelsStorageShape(client)) !== "with_catalog_links") return false;
  return (await getSessionPlanStorageShape(client)) === "with_catalog_links";
}

export function elementLibraryUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "La biblioteca de elementos todavía no está activada en esta academia.",
    503,
    { reason: ELEMENT_LIBRARY_UNAVAILABLE_REASON }
  );
}

/**
 * Para las páginas: decide si se muestran los accesos. Ante cualquier fallo
 * responde false, porque ocultar un acceso nunca rompe nada.
 */
export async function isElementLibraryAvailableForPage(client: DatabaseClient): Promise<boolean> {
  try {
    return await isElementLibraryAvailable(client);
  } catch {
    return false;
  }
}

export async function assertElementLibraryAvailable(client: DatabaseClient): Promise<void> {
  if (!(await isElementLibraryAvailable(client))) throw elementLibraryUnavailable();
}
