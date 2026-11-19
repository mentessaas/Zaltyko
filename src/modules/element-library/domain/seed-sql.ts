import type { EditionFile, ElementDataFile, ElementRecord } from "./element-library";

/**
 * Genera la semilla SQL de una tanda de la biblioteca (ADR-0029 §1.5).
 *
 * Sin dependencias en tiempo de ejecución (solo `import type`):
 * `scripts/element-library/build-seed.ts` lo carga con Node sin node_modules.
 * Determinista: misma entrada, mismo texto. Los archivos se ordenan por
 * aparato y los elementos conservan el orden del archivo.
 *
 * Semántica del SQL generado:
 * - `begin; … commit;` con preflight que aborta si faltan las tablas;
 * - upsert de la edición por `code`, sin bajar nunca una edición `retired`;
 * - aborta si un elemento ya `reviewed` cambiaría de texto, grupo, valor,
 *   aparato o referencia sin un `reviewed_on` posterior al guardado;
 * - upsert de los elementos por `(edition_id, element_key)` que nunca escribe
 *   `withdrawn_at` ni `withdrawn_reason` y nunca baja `reviewed` a `draft`;
 * - una segunda ejecución con los mismos datos no cambia ninguna fila.
 */

export const ELEMENT_SEED_TABLES = {
  editions: "zaltyko.catalog_element_editions",
  elements: "zaltyko.catalog_elements",
} as const;

/** Nombre del archivo de semilla, sin el prefijo de fecha. */
export function elementSeedFileSuffix(editionCode: string, batch: number): string {
  return `_element_catalog_seed_${editionCode}_${batch}.sql`;
}

/** `<14 dígitos>_element_catalog_seed_<edición>_<tanda>.sql`. */
export const ELEMENT_SEED_FILE_PATTERN = /^(\d{14})_element_catalog_seed_(fig-[a-z]+-\d{4}-\d{4})_([1-9]\d*)\.sql$/;

function sqlText(value: string): string {
  if (value.includes("\u0000")) throw new Error("Texto con carácter nulo");
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableText(value: string | null | undefined): string {
  return value === null || value === undefined ? "null" : sqlText(value);
}

function sqlInt(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error(`Entero no válido: ${value}`);
  return String(value);
}

function sqlDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Fecha no válida: ${value}`);
  return `'${value}'::date`;
}

function sqlNullableDate(value: string | null | undefined): string {
  return value === null || value === undefined ? "null" : sqlDate(value);
}

function sqlPoints(value: number | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Puntos no válidos: ${value}`);
  return value.toFixed(2);
}

type SeedRow = ElementRecord & { apparatus: string };

const SEED_COLUMNS = [
  "element_key",
  "apparatus",
  "element_group",
  "value_letter",
  "value_points",
  "fig_reference",
  "name",
  "short_name",
  "description",
  "source_page",
  "source_checked_on",
  "drafted_by",
  "drafted_on",
  "batch",
  "review_status",
  "reviewed_on",
] as const;

function seedRowValues(row: SeedRow): string {
  return [
    sqlText(row.elementKey),
    sqlText(row.apparatus),
    sqlText(row.group),
    sqlNullableText(row.valueLetter),
    sqlPoints(row.valuePoints),
    sqlNullableText(row.figReference),
    sqlText(row.name),
    sqlText(row.shortName),
    sqlNullableText(row.description),
    sqlInt(row.sourcePage),
    sqlDate(row.sourceCheckedOn),
    sqlText(row.draftedBy),
    sqlDate(row.draftedOn),
    sqlInt(row.batch),
    sqlText(row.reviewStatus),
    sqlNullableDate(row.reviewedOn),
  ].join(", ");
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Filas de la tanda, ordenadas por aparato y en el orden de cada archivo. */
function batchRows(edition: EditionFile, files: readonly ElementDataFile[], batch: number): SeedRow[] {
  const rows: SeedRow[] = [];
  const seen = new Set<string>();
  const apparatusSeen = new Set<string>();
  const sorted = [...files].sort((a, b) => compareText(a.apparatus, b.apparatus));
  for (const file of sorted) {
    if (file.edition !== edition.code) {
      throw new Error(`El archivo de ${file.apparatus} es de ${file.edition}, no de ${edition.code}`);
    }
    if (apparatusSeen.has(file.apparatus)) {
      throw new Error(`Dos archivos para ${file.apparatus} en ${edition.code}`);
    }
    apparatusSeen.add(file.apparatus);
    for (const element of file.elements) {
      if (seen.has(element.elementKey)) {
        throw new Error(`Clave repetida en ${edition.code}: ${element.elementKey}`);
      }
      seen.add(element.elementKey);
      if (element.batch === batch) rows.push({ ...element, apparatus: file.apparatus });
    }
  }
  return rows;
}

/**
 * SQL de la tanda `batch` de `edition`. Falla si la tanda no tiene elementos:
 * una semilla vacía no se genera.
 */
export function renderElementSeedSql(edition: EditionFile, files: readonly ElementDataFile[], batch: number): string {
  if (!Number.isSafeInteger(batch) || batch <= 0) throw new Error(`Tanda no válida: ${batch}`);
  const rows = batchRows(edition, files, batch);
  if (rows.length === 0) throw new Error(`La tanda ${batch} de ${edition.code} no tiene elementos`);

  const code = sqlText(edition.code);
  const apparatusList = [...new Set(rows.map((row) => row.apparatus))].join(", ");
  const tag = "element_catalog_seed";
  const rowsTable = `pg_temp.${tag}_rows`;

  const editionValues = [
    code,
    sqlText(edition.discipline),
    sqlInt(edition.cycleStart),
    sqlInt(edition.cycleEnd),
    sqlText(edition.title),
    sqlText(edition.documentUrl),
    sqlDate(edition.coverDate),
    sqlText(edition.status),
  ].join(", ");

  const elementColumns = [
    "edition_id",
    "element_key",
    "discipline",
    ...SEED_COLUMNS.slice(1),
  ];
  const updatable = elementColumns.filter(
    (column) => column !== "edition_id" && column !== "element_key" && column !== "review_status" && column !== "reviewed_on"
  );
  const nextReviewStatus =
    "case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end";
  const nextReviewedOn =
    "case when catalog_elements.review_status = 'reviewed' then greatest(catalog_elements.reviewed_on, excluded.reviewed_on) else excluded.reviewed_on end";
  const guardedColumns = [
    "apparatus",
    "element_group",
    "value_letter",
    "value_points",
    "fig_reference",
    "name",
    "short_name",
    "description",
  ];

  const lines: string[] = [
    `-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición ${edition.code}, tanda ${batch}.`,
    "-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno",
    "-- (sandbox, staging o producción) antes de aplicarse.",
    "-- Generado por scripts/element-library/build-seed.ts desde",
    `-- src/modules/element-library/data/editions.json y data/${edition.code}/*.json.`,
    "-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida",
    "-- con lo que genera el script.",
    `-- Contenido: la edición y ${rows.length} ${rows.length === 1 ? "elemento" : "elementos"} (${apparatusList}).`,
    "-- Semántica: crea o actualiza la edición por code sin bajar nunca una edición",
    "-- retirada, y crea o actualiza los elementos de la tanda por (edition_id,",
    "-- element_key). Nunca escribe withdrawn_at ni withdrawn_reason (una retirada",
    "-- sobrevive a cualquier semilla), nunca devuelve un elemento revisado a",
    "-- borrador y aborta sin cambiar nada si un elemento revisado cambiaría sin un",
    "-- reviewed_on posterior al guardado. Repetirla con los mismos datos no cambia",
    "-- ninguna fila. Requiere 20261119120000_element_library_candidate.sql.",
    "",
    "begin;",
    "",
    `do $${tag}_preflight$`,
    "begin",
    `  if to_regclass('${ELEMENT_SEED_TABLES.editions}') is null`,
    `     or to_regclass('${ELEMENT_SEED_TABLES.elements}') is null then`,
    `    raise exception 'Element catalog seed requires ${ELEMENT_SEED_TABLES.editions} and ${ELEMENT_SEED_TABLES.elements}; apply 20261119120000_element_library_candidate.sql first';`,
    "  end if;",
    "end;",
    `$${tag}_preflight$;`,
    "",
    `insert into ${ELEMENT_SEED_TABLES.editions}`,
    "  (code, discipline, cycle_start, cycle_end, title, document_url, cover_date, status)",
    "values",
    `  (${editionValues})`,
    "on conflict (code) do update set",
    "  discipline = excluded.discipline,",
    "  cycle_start = excluded.cycle_start,",
    "  cycle_end = excluded.cycle_end,",
    "  title = excluded.title,",
    "  document_url = excluded.document_url,",
    "  cover_date = excluded.cover_date,",
    "  status = case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end,",
    "  updated_at = now()",
    "where (catalog_element_editions.discipline, catalog_element_editions.cycle_start,",
    "       catalog_element_editions.cycle_end, catalog_element_editions.title,",
    "       catalog_element_editions.document_url, catalog_element_editions.cover_date,",
    "       catalog_element_editions.status)",
    "  is distinct from (excluded.discipline, excluded.cycle_start, excluded.cycle_end,",
    "       excluded.title, excluded.document_url, excluded.cover_date,",
    "       case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end);",
    "",
    `create temporary table ${tag}_rows (`,
    "  element_key text primary key,",
    "  apparatus text not null,",
    "  element_group text not null,",
    "  value_letter text,",
    "  value_points numeric(4,2),",
    "  fig_reference text,",
    "  name text not null,",
    "  short_name text not null,",
    "  description text,",
    "  source_page integer not null,",
    "  source_checked_on date not null,",
    "  drafted_by text not null,",
    "  drafted_on date not null,",
    "  batch integer not null,",
    "  review_status text not null,",
    "  reviewed_on date",
    ") on commit drop;",
    "",
    `insert into ${rowsTable}`,
    `  (${SEED_COLUMNS.join(", ")})`,
    "values",
    rows.map((row) => `  (${seedRowValues(row)})`).join(",\n") + ";",
    "",
    `do $${tag}_reviewed_guard$`,
    "declare",
    "  changed_keys text;",
    "begin",
    "  select string_agg(e.element_key, ', ' order by e.element_key)",
    "    into changed_keys",
    `  from ${ELEMENT_SEED_TABLES.elements} e`,
    `  join ${ELEMENT_SEED_TABLES.editions} ed on ed.id = e.edition_id`,
    `  join ${rowsTable} s on s.element_key = e.element_key`,
    `  where ed.code = ${code}`,
    "    and e.review_status = 'reviewed'",
    `    and (${guardedColumns.map((column) => `e.${column}`).join(", ")})`,
    `        is distinct from (${guardedColumns.map((column) => `s.${column}`).join(", ")})`,
    "    and (s.reviewed_on is null or e.reviewed_on is null or s.reviewed_on <= e.reviewed_on);",
    "  if changed_keys is not null then",
    "    raise exception 'Element catalog seed would change reviewed elements without a newer reviewed_on: %', changed_keys;",
    "  end if;",
    "end;",
    `$${tag}_reviewed_guard$;`,
    "",
    `insert into ${ELEMENT_SEED_TABLES.elements}`,
    `  (${elementColumns.join(", ")})`,
    `select ed.id, s.element_key, ed.discipline, ${SEED_COLUMNS.slice(1).map((column) => `s.${column}`).join(", ")}`,
    `from ${rowsTable} s`,
    `cross join ${ELEMENT_SEED_TABLES.editions} ed`,
    `where ed.code = ${code}`,
    "on conflict (edition_id, element_key) do update set",
    ...updatable.map((column) => `  ${column} = excluded.${column},`),
    `  review_status = ${nextReviewStatus},`,
    `  reviewed_on = ${nextReviewedOn},`,
    "  updated_at = now()",
    `where (${[...updatable, "review_status", "reviewed_on"].map((column) => `catalog_elements.${column}`).join(", ")})`,
    `  is distinct from (${[...updatable.map((column) => `excluded.${column}`), nextReviewStatus, nextReviewedOn].join(", ")});`,
    "",
    "commit;",
    "",
  ];

  return lines.join("\n");
}
