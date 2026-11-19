import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Retirada de las candidatas de la biblioteca de elementos (ADR-0029) y de las
 * que exige, para las suites de PostgreSQL desechable que las instalan. Solo
 * se llama desde un afterAll que ya comprobó el destino desechable.
 *
 * Cada sentencia se intenta aunque falle otra anterior, y los fallos se
 * acumulan y se lanzan al final: una tabla que no se pudo retirar nunca deja
 * instaladas las demás para la suite siguiente. Vitest ejecuta afterAll
 * aunque falle beforeAll, y cada candidata es atómica (su propia
 * transacción), así que un beforeAll que falla a mitad tampoco deja nada a
 * medias. Las academias de prueba no se borran: su historial de condiciones
 * del plan no admite borrado; los datos de prueba llevan nombres únicos.
 */
export type InstalledCandidates = { progress?: boolean; plans?: boolean; levels?: boolean };

/** Primero las columnas de enlace y las notas (apuntan al catálogo), después el catálogo. */
const LIBRARY_TEARDOWN = [
  "alter table if exists zaltyko.skill_elements drop column if exists catalog_element_id",
  "alter table if exists zaltyko.session_plan_blocks drop column if exists catalog_element_id",
  "drop table if exists zaltyko.academy_element_notes",
  "drop table if exists zaltyko.content_withdrawals",
  "drop table if exists zaltyko.content_notices",
  "drop table if exists zaltyko.catalog_elements",
  "drop table if exists zaltyko.catalog_element_editions",
];
const LEVELS_TABLES = ["athlete_level_passes", "athlete_skill_progress", "skill_elements", "skill_levels", "skill_templates"];
const PLANS_TABLES = ["session_plan_objectives", "session_plan_blocks", "session_plans", "class_plan_templates"];
const PROGRESS_TABLES = ["athlete_observations", "athlete_objective_status_history", "athlete_objectives"];

export const dropTables = (tables: readonly string[]) => tables.map((table) => `drop table if exists zaltyko.${table}`);

/** Ejecuta todas las sentencias aunque alguna falle y lanza los fallos juntos al final. */
export async function runEveryStatement(statements: readonly string[]): Promise<void> {
  const failures: unknown[] = [];
  for (const statement of statements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `PostgreSQL teardown failed on ${failures.length} statement(s)`);
  }
}

/**
 * Retira las tablas y columnas de la biblioteca siempre, y las candidatas de
 * niveles, guiones y objetivos solo si las instaló la suite (en ese orden:
 * los guiones apuntan a los objetivos).
 */
export async function dropElementLibraryCandidates(installedHere: InstalledCandidates): Promise<void> {
  await runEveryStatement([
    ...LIBRARY_TEARDOWN,
    ...(installedHere.levels ? dropTables(LEVELS_TABLES) : []),
    ...(installedHere.plans ? dropTables(PLANS_TABLES) : []),
    ...(installedHere.progress ? dropTables(PROGRESS_TABLES) : []),
  ]);
}

/** Las tablas de cada candidata, para las suites que retiran la suya propia. */
export const CANDIDATE_TABLES = {
  levels: LEVELS_TABLES,
  plans: PLANS_TABLES,
  progress: PROGRESS_TABLES,
} as const;
