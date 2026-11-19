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
 *
 * La candidata de la biblioteca de elementos
 * (docs/deployment/candidates/20261119120000_element_library_candidate.sql)
 * añade a session_plan_blocks la columna opcional catalog_element_id. Mientras
 * se despliega, valen dos formas exactas: la de la candidata de guiones
 * («base») y esa misma más las columnas de enlace («with_catalog_links»).
 * Cualquier otra columna, de más o de menos, deja la sección «no disponible».
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

/**
 * Columnas que la candidata de la biblioteca añade a estas tablas. Debe
 * coincidir con ELEMENT_LIBRARY_LINK_COLUMNS de la biblioteca (lo comprueba
 * tests/session-plans-contract.test.ts); se repite aquí para que los guiones
 * no dependan del módulo de la biblioteca.
 */
export const SESSION_PLAN_CATALOG_LINK_COLUMNS = {
  session_plan_blocks: ["catalog_element_id"],
} as const satisfies Partial<Record<keyof typeof SESSION_PLAN_TABLES, readonly string[]>>;

/**
 * Forma instalada: «absent» (falta algo o sobra algo: no disponible), «base»
 * (la candidata de guiones tal cual) o «with_catalog_links» (más las columnas
 * de enlace de la biblioteca en todas sus tablas a la vez).
 */
export type SessionPlanStorageShape = "absent" | "base" | "with_catalog_links";
export type InstalledSessionPlanShape = Exclude<SessionPlanStorageShape, "absent">;

type SessionPlanTable = keyof typeof SESSION_PLAN_TABLES;

const tableNames = Object.keys(SESSION_PLAN_TABLES) as SessionPlanTable[];

/** Columnas de una tabla con las de enlace, en el orden de la comparación (collate "C"). */
function columnsWithCatalogLinks(table: SessionPlanTable): readonly string[] {
  const links: Partial<Record<SessionPlanTable, readonly string[]>> = SESSION_PLAN_CATALOG_LINK_COLUMNS;
  return [...SESSION_PLAN_TABLES[table], ...(links[table] ?? [])].sort();
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
  tableNames.map((table) => columnsMatch(table, SESSION_PLAN_TABLES[table])),
  sql` and `
);
const allColumnsMatchWithCatalogLinks = sql.join(
  tableNames.map((table) => columnsMatch(table, columnsWithCatalogLinks(table))),
  sql` and `
);
/**
 * Las columnas de enlace, además de existir, son `uuid` y admiten nulos: una
 * columna con el mismo nombre y otro tipo, o NOT NULL, no es la de la candidata.
 */
const catalogLinkColumnsTyped = sql.join(
  Object.entries(SESSION_PLAN_CATALOG_LINK_COLUMNS).flatMap(([table, columns]) =>
    columns.map(
      (column) => sql`exists (select 1 from information_schema.columns
         where table_schema = 'zaltyko' and table_name = ${table} and column_name = ${column}
           and data_type = 'uuid' and is_nullable = 'YES')`
    )
  ),
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

/**
 * Forma de las tablas. Los CASE anidados evalúan los privilegios solo cuando
 * las cuatro relaciones existen.
 */
export async function getSessionPlanStorageShape(client: DatabaseClient): Promise<SessionPlanStorageShape> {
  const result = await client.execute(sql`
    select case
      when ${relationsPresent} then
        case
          when ${positionDeferred}
            and (select count(*) = ${tableNames.length} from pg_class c
                  where c.oid in (${regclassList})
                    and c.relrowsecurity and c.relforcerowsecurity)
            and not coalesce((
              select bool_or(${anyClientPrivilege})
                from pg_roles r where r.rolname in ('anon', 'authenticated')
            ), false) then
            case
              when ${allColumnsMatch} then 'base'
              when ${allColumnsMatchWithCatalogLinks} and ${catalogLinkColumnsTyped} then 'with_catalog_links'
              else 'absent'
            end
          else 'absent'
        end
      else 'absent' end as shape
  `);
  const shape = (result.rows[0] as { shape?: unknown } | undefined)?.shape;
  return shape === "base" || shape === "with_catalog_links" ? shape : "absent";
}

export async function isSessionPlanStorageAvailable(client: DatabaseClient): Promise<boolean> {
  return (await getSessionPlanStorageShape(client)) !== "absent";
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

/**
 * Tablas instaladas; devuelve la forma para que los bloques sepan si pueden
 * leer y escribir el enlace a la biblioteca.
 */
export async function assertSessionPlanStorageAvailable(client: DatabaseClient): Promise<InstalledSessionPlanShape> {
  const shape = await getSessionPlanStorageShape(client);
  if (shape === "absent") throw sessionPlanStorageUnavailable();
  return shape;
}
