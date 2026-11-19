import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import editionsData from "@/modules/element-library/data/editions.json";
import {
  CATALOG_DISCIPLINES,
  editionsFileSchema,
  type CatalogDiscipline,
} from "@/modules/element-library/domain/element-library";

/**
 * Datos de la página de la biblioteca (ADR-0029 §1.8). Uso interno: entra por
 * la fachada. La página ya comprobó que la biblioteca está disponible.
 */

/**
 * Disciplinas con alguna edición publicada, en el orden de CATALOG_DISCIPLINES:
 * el selector de la página solo ofrece esas. El catálogo es global (sin
 * academia), así que no hace falta autorizar a nadie para leerlo.
 */
export async function listPublishedCatalogDisciplines(client: DatabaseClient): Promise<CatalogDiscipline[]> {
  const result = await client.execute(sql`
    select distinct discipline
    from zaltyko.catalog_element_editions
    where status = 'published'
  `);
  const published = new Set((result.rows as { discipline: string }[]).map((row) => row.discipline));
  return CATALOG_DISCIPLINES.filter((discipline) => published.has(discipline));
}

export type EditionGroupLabel = { key: string; label: string };

/** Por código de edición y aparato, la lista cerrada de grupos con su nombre. */
export type EditionGroupLabels = Record<string, Partial<Record<string, EditionGroupLabel[]>>>;

/**
 * Nombres de los grupos de cada edición, tomados del archivo revisado
 * `data/editions.json` (la base de datos guarda solo la clave del grupo). Si el
 * archivo no pasara el esquema, lo registra y devuelve un objeto vacío: la
 * página muestra «Grupo 4» sin nombre. El test de los archivos de datos ya lo
 * impide en CI.
 */
export function getEditionGroupLabels(): EditionGroupLabels {
  const parsed = editionsFileSchema.safeParse(editionsData);
  if (!parsed.success) {
    logger.error("data/editions.json no pasa el esquema: la biblioteca muestra los grupos sin nombre", parsed.error);
    return {};
  }
  return Object.fromEntries(parsed.data.map((edition) => [edition.code, edition.groups]));
}
