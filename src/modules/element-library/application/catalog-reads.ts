import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { DatabaseClient, TransactionClient } from "@/lib/db-transactions";
import { recordUsageEvent } from "@/modules/habitual-use/application/usage-events";
import { isUsageActorRole } from "@/modules/habitual-use/domain/usage";
import {
  CATALOG_APPARATUS,
  elementAttributionText,
  filterCatalogElements,
  isElementLibraryDescriptionsFlagOn,
  isElementVisibleToAcademies,
  VALUE_LETTERS,
  type CatalogApparatus,
  type CatalogDiscipline,
} from "@/modules/element-library/domain/element-library";
import {
  CATALOG_SEARCH_LIMIT_DEFAULT,
  catalogElementQuerySchema,
  catalogSearchQuerySchema,
  type CatalogElementCard,
  type CatalogElementSummary,
  type CatalogLinkStatus,
  type CatalogLinkView,
  type CatalogSearchResult,
  type EditionView,
} from "@/modules/element-library/domain/library-requests";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";

import { authorizeLibraryMember, isOrganizationWritable, notFound, type ActorInput } from "./access";

/**
 * Lecturas del catálogo: búsqueda, ficha y la vista de enlaces que usan
 * niveles y guiones. Uso interno: entra por la fachada.
 *
 * Las academias solo ven elementos revisados, de una edición publicada y sin
 * retirar (ADR-0029 §1.6). Cualquier otro id responde 404, igual que uno que
 * no existe.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tope de filas que se leen de una edición antes de filtrar por valor y texto
 * en memoria (sin acentos, como `normalizeSearchText`). Un código de puntuación
 * tiene unos cientos de elementos por disciplina.
 */
const CATALOG_SCAN_MAX = 5_000;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPoints(value: string | number | null): number | null {
  if (value === null) return null;
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

type EditionRow = {
  id: string;
  code: string;
  discipline: string;
  title: string;
  cycle_start: number;
  cycle_end: number;
  cover_date: string;
  document_url: string;
};

function editionView(row: EditionRow): EditionView {
  return {
    id: row.id,
    code: row.code,
    discipline: row.discipline as CatalogDiscipline,
    title: row.title,
    cycleStart: Number(row.cycle_start),
    cycleEnd: Number(row.cycle_end),
    coverDate: row.cover_date,
    documentUrl: row.document_url,
    attribution: elementAttributionText({
      title: row.title,
      coverDate: row.cover_date,
      documentUrl: row.document_url,
    }),
  };
}

/** Edición publicada más reciente de la disciplina, o null si aún no hay ninguna. */
async function loadPublishedEdition(tx: TransactionClient, discipline: CatalogDiscipline): Promise<EditionView | null> {
  const result = await tx.execute(sql`
    select id, code, discipline, title, cycle_start, cycle_end, cover_date::text as cover_date, document_url
    from zaltyko.catalog_element_editions
    where discipline = ${discipline} and status = 'published'
    order by cycle_start desc, code
    limit 1
  `);
  const row = result.rows[0] as EditionRow | undefined;
  return row ? editionView(row) : null;
}

/* ------------------------------------------------------------------------ */
/* Búsqueda                                                                  */
/* ------------------------------------------------------------------------ */

type SummaryRow = {
  id: string;
  element_key: string;
  apparatus: string;
  element_group: string;
  value_letter: string | null;
  value_points: string | null;
  fig_reference: string | null;
  name: string;
  short_name: string;
  has_note: boolean;
};

const groupCollator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function valueRank(element: CatalogElementSummary): number {
  if (element.valueLetter) return VALUE_LETTERS.indexOf(element.valueLetter);
  return element.valuePoints ?? Number.MAX_SAFE_INTEGER;
}

/** Aparato (orden de la disciplina), grupo (1, 2, … 10), valor y nombre. */
function compareElements(left: CatalogElementSummary, right: CatalogElementSummary): number {
  return (
    CATALOG_APPARATUS.indexOf(left.apparatus) - CATALOG_APPARATUS.indexOf(right.apparatus) ||
    groupCollator.compare(left.group, right.group) ||
    valueRank(left) - valueRank(right) ||
    groupCollator.compare(left.name, right.name) ||
    left.elementKey.localeCompare(right.elementKey)
  );
}

export async function searchCatalogElements(input: ActorInput & { query: unknown }): Promise<CatalogSearchResult> {
  const query = catalogSearchQuerySchema.parse(input.query);
  const limit = query.limit ?? CATALOG_SEARCH_LIMIT_DEFAULT;
  const { result, role } = await db.transaction(async (tx): Promise<{ result: CatalogSearchResult; role: string }> => {
    const access = await authorizeLibraryMember(tx, { ...query, actor: input.actor });
    const edition = await loadPublishedEdition(tx, query.discipline);
    if (!edition) return { result: { edition: null, elements: [], truncated: false }, role: access.role };
    const apparatusFilter = query.apparatus ? sql`and e.apparatus = ${query.apparatus}` : sql``;
    const groupFilter = query.group ? sql`and e.element_group = ${query.group}` : sql``;
    const rows = await tx.execute(sql`
      select e.id, e.element_key, e.apparatus, e.element_group, e.value_letter, e.value_points::text as value_points,
        e.fig_reference, e.name, e.short_name,
        exists (
          select 1 from zaltyko.academy_element_notes as note
          where note.organization_id = ${query.organizationId}::uuid and note.catalog_element_id = e.id
        ) as has_note
      from zaltyko.catalog_elements as e
      where e.edition_id = ${edition.id}::uuid
        and e.discipline = ${query.discipline}
        and e.review_status = 'reviewed'
        and e.withdrawn_at is null
        ${apparatusFilter}
        ${groupFilter}
      limit ${CATALOG_SCAN_MAX}
    `);
    const summaries: CatalogElementSummary[] = (rows.rows as SummaryRow[]).map((row) => ({
      id: row.id,
      elementKey: row.element_key,
      apparatus: row.apparatus as CatalogApparatus,
      group: row.element_group,
      valueLetter: row.value_letter,
      valuePoints: toPoints(row.value_points),
      figReference: row.fig_reference,
      name: row.name,
      shortName: row.short_name,
      hasNote: row.has_note === true,
    }));
    const matching = filterCatalogElements(summaries, { value: query.value, query: query.q }).sort(compareElements);
    return {
      result: { edition, elements: matching.slice(0, limit), truncated: matching.length > limit },
      role: access.role,
    };
  });
  await recordElementLibraryView({ organizationId: query.organizationId, role });
  return result;
}

/* ------------------------------------------------------------------------ */
/* Ficha                                                                     */
/* ------------------------------------------------------------------------ */

type CardRow = SummaryRow & {
  discipline: string;
  description: string | null;
  review_status: string;
  withdrawn_at: Date | string | null;
  edition_id: string;
  edition_code: string;
  edition_discipline: string;
  edition_title: string;
  edition_cycle_start: number;
  edition_cycle_end: number;
  edition_cover_date: string;
  edition_document_url: string;
  edition_status: string;
  note: string | null;
  note_revision: number | null;
  note_updated_at: Date | string | null;
};

export async function getCatalogElement(
  input: ActorInput & { elementId: string; query: unknown }
): Promise<CatalogElementCard> {
  const query = catalogElementQuerySchema.parse(input.query);
  return db.transaction(async (tx) => {
    await authorizeLibraryMember(tx, { ...query, actor: input.actor });
    if (!UUID.test(input.elementId)) throw notFound("Elemento no encontrado");
    const result = await tx.execute(sql`
      select e.id, e.element_key, e.discipline, e.apparatus, e.element_group, e.value_letter,
        e.value_points::text as value_points, e.fig_reference, e.name, e.short_name, e.description,
        e.review_status, e.withdrawn_at,
        edition.id as edition_id, edition.code as edition_code, edition.discipline as edition_discipline,
        edition.title as edition_title, edition.cycle_start as edition_cycle_start,
        edition.cycle_end as edition_cycle_end, edition.cover_date::text as edition_cover_date,
        edition.document_url as edition_document_url, edition.status as edition_status,
        note.note, note.revision as note_revision, note.updated_at as note_updated_at
      from zaltyko.catalog_elements as e
      join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
      left join zaltyko.academy_element_notes as note
        on note.organization_id = ${query.organizationId}::uuid and note.catalog_element_id = e.id
      where e.id = ${input.elementId}::uuid
      limit 1
    `);
    const row = result.rows[0] as CardRow | undefined;
    if (
      !row ||
      !isElementVisibleToAcademies(
        { reviewStatus: row.review_status, withdrawnAt: row.withdrawn_at },
        { status: row.edition_status }
      )
    ) {
      throw notFound("Elemento no encontrado");
    }
    const edition = editionView({
      id: row.edition_id,
      code: row.edition_code,
      discipline: row.edition_discipline,
      title: row.edition_title,
      cycle_start: row.edition_cycle_start,
      cycle_end: row.edition_cycle_end,
      cover_date: row.edition_cover_date,
      document_url: row.edition_document_url,
    });
    return {
      id: row.id,
      elementKey: row.element_key,
      discipline: row.discipline as CatalogDiscipline,
      apparatus: row.apparatus as CatalogApparatus,
      group: row.element_group,
      valueLetter: row.value_letter,
      valuePoints: toPoints(row.value_points),
      figReference: row.fig_reference,
      name: row.name,
      shortName: row.short_name,
      description: isElementLibraryDescriptionsFlagOn() ? row.description : null,
      edition,
      attribution: edition.attribution,
      note:
        row.note !== null && row.note_revision !== null && row.note_updated_at !== null
          ? { text: row.note, revision: Number(row.note_revision), updatedAt: iso(row.note_updated_at) }
          : null,
      readOnly: !(await isOrganizationWritable(tx, query.organizationId)),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Enlaces desde niveles y guiones (T8/T9)                                   */
/* ------------------------------------------------------------------------ */

type LinkRow = {
  id: string;
  name: string;
  short_name: string;
  apparatus: string;
  discipline: string;
  review_status: string;
  withdrawn: boolean;
  edition_status: string;
  replacement_id: string | null;
};

function linkStatus(row: LinkRow): CatalogLinkStatus {
  if (row.withdrawn) return "withdrawn";
  if (row.replacement_id !== null || row.edition_status === "retired") return "previous_edition";
  if (row.review_status === "reviewed" && row.edition_status === "published") return "current";
  // Edición en borrador o elemento sin revisar: no está en la biblioteca.
  return "withdrawn";
}

/**
 * Nombre y estado de los elementos enlazados. Sin autorización propia: la
 * llama el servicio de niveles o de guiones dentro de su transacción, ya
 * autorizada y con las tablas de la biblioteca instaladas. Los ids que no
 * existen (o no son uuid) no aparecen en el mapa.
 */
export async function getCatalogLinkView(
  client: DatabaseClient,
  ids: readonly string[]
): Promise<Map<string, CatalogLinkView>> {
  const unique = [...new Set(ids)].filter((id) => UUID.test(id));
  const views = new Map<string, CatalogLinkView>();
  if (unique.length === 0) return views;
  const result = await client.execute(sql`
    select e.id, e.name, e.short_name, e.apparatus, e.discipline, e.review_status,
      e.withdrawn_at is not null as withdrawn,
      edition.status as edition_status,
      (
        select newer.id
        from zaltyko.catalog_elements as newer
        join zaltyko.catalog_element_editions as newer_edition on newer_edition.id = newer.edition_id
        where newer.element_key = e.element_key
          and newer.discipline = e.discipline
          and newer.id <> e.id
          and newer_edition.status = 'published'
          and newer_edition.cycle_start > edition.cycle_start
          and newer.review_status = 'reviewed'
          and newer.withdrawn_at is null
        order by newer_edition.cycle_start desc, newer.id
        limit 1
      ) as replacement_id
    from zaltyko.catalog_elements as e
    join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
    where e.id = any(${sqlUuidArray(unique)})
    limit ${unique.length}
  `);
  for (const row of result.rows as LinkRow[]) {
    views.set(row.id, {
      name: row.name,
      shortName: row.short_name,
      apparatus: row.apparatus as CatalogApparatus,
      discipline: row.discipline as CatalogDiscipline,
      status: linkStatus(row),
      replacementId: row.replacement_id,
    });
  }
  return views;
}

/**
 * Para enlazar desde niveles o guiones: el elemento existe, lo ve la academia
 * y es de la disciplina y el aparato pedidos. Si no, null (el servicio que
 * llama decide el error). Sin autorización propia, como getCatalogLinkView.
 */
export async function findLinkableCatalogElement(
  client: DatabaseClient,
  id: string,
  input: { discipline: string; apparatus: string }
): Promise<{ id: string } | null> {
  if (!UUID.test(id)) return null;
  const result = await client.execute(sql`
    select e.id
    from zaltyko.catalog_elements as e
    join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
    where e.id = ${id}::uuid
      and e.discipline = ${input.discipline}
      and e.apparatus = ${input.apparatus}
      and e.review_status = 'reviewed'
      and e.withdrawn_at is null
      and edition.status = 'published'
    limit 1
  `);
  const row = result.rows[0] as { id: string } | undefined;
  return row ? { id: row.id } : null;
}

/* ------------------------------------------------------------------------ */
/* Uso habitual (ADR-0029 §11)                                               */
/* ------------------------------------------------------------------------ */

/**
 * Cuenta una consulta a la biblioteca: academia, rol del equipo y día, sin
 * identificar a nadie. Nunca lanza ni retrasa la búsqueda: sin la bandera de
 * medición, sin la tabla o sin la candidata que admite el evento
 * (20261119121500) devuelve false.
 */
export function recordElementLibraryView(input: { organizationId: string; role: string }): Promise<boolean> {
  const role = input.role;
  if (!isUsageActorRole(role) || role === "family") return Promise.resolve(false);
  return recordUsageEvent({ organizationId: input.organizationId, eventName: "element_library_view", actorRole: role });
}
