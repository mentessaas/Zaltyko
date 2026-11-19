import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { withTransaction, type DatabaseClient } from "@/lib/db-transactions";
import {
  ELEMENT_REVIEW_PAGE_SIZE,
  isContentWithdrawalKey,
  type ContentWithdrawalKind,
  type ElementReviewItem,
  type ElementReviewPage,
  type ElementReviewState,
  type ElementWithdrawal,
  type ElementWithdrawalResult,
} from "@/modules/element-library/domain/content-notices";
import type { EditionCode } from "@/modules/element-library/domain/element-library";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { isElementLibraryStorageInstalled } from "./storage";

/**
 * Revisión y retirada de contenido por el superadministrador (ADR-0029 §1.6 y
 * §8.3), y la consulta de plantillas retiradas que usará la fase D.
 *
 * - Lista de elementos por estado (borrador, revisado, retirado), de solo
 *   lectura: la revisión se hace en los archivos de datos del repositorio.
 * - «Retirar» un elemento escribe `withdrawn_at` y `withdrawn_reason`, que
 *   ninguna semilla deshace. Los enlaces desde niveles y guiones no se tocan:
 *   la academia conserva sus filas y ve el elemento como retirado.
 *
 * No depende de la bandera de la biblioteca (se revisa antes de encenderla),
 * solo de que las tablas estén instaladas tal cual.
 */

export function elementReviewUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "Las tablas de la biblioteca de elementos todavía no están instaladas.",
    503,
    { reason: "element_library_storage_missing" }
  );
}

async function assertInstalled(client: DatabaseClient): Promise<void> {
  if (!(await isElementLibraryStorageInstalled(client))) throw elementReviewUnavailable();
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/* ------------------------------------------------------------------------ */
/* Lista de revisión                                                         */
/* ------------------------------------------------------------------------ */

type ReviewCursor = { edition: string; apparatus: string; group: string; key: string };

export function encodeElementCursor(cursor: ReviewCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.edition, cursor.apparatus, cursor.group, cursor.key]),
    "utf8"
  ).toString("base64url");
}

export function decodeElementCursor(value: string): ReviewCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      !parsed.every((part) => typeof part === "string" && part.length >= 1 && part.length <= 64)
    ) {
      return null;
    }
    const [edition, apparatus, group, key] = parsed as [string, string, string, string];
    return { edition, apparatus, group, key };
  } catch {
    return null;
  }
}

type ReviewRow = {
  id: string;
  element_key: string;
  edition_code: string;
  edition_status: string;
  apparatus: string;
  element_group: string;
  value_letter: string | null;
  value_points: string | number | null;
  fig_reference: string | null;
  name: string;
  short_name: string;
  description: string | null;
  source_page: number;
  batch: number;
  review_status: "draft" | "reviewed";
  reviewed_on: string | null;
  withdrawn_at: Date | string | null;
  withdrawn_reason: string | null;
};

function reviewState(row: ReviewRow): ElementReviewState {
  if (row.withdrawn_at !== null) return "withdrawn";
  return row.review_status === "reviewed" ? "reviewed" : "draft";
}

function reviewItem(row: ReviewRow): ElementReviewItem {
  const points = row.value_points === null ? null : Number(row.value_points);
  return {
    id: row.id,
    elementKey: row.element_key,
    editionCode: row.edition_code,
    editionStatus: row.edition_status,
    apparatus: row.apparatus,
    group: row.element_group,
    valueLetter: row.value_letter,
    valuePoints: points !== null && Number.isFinite(points) ? points : null,
    figReference: row.fig_reference,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    sourcePage: Number(row.source_page),
    batch: Number(row.batch),
    reviewStatus: row.review_status,
    reviewedOn: row.reviewed_on,
    withdrawnAt: iso(row.withdrawn_at),
    withdrawnReason: row.withdrawn_reason,
    state: reviewState(row),
  };
}

/**
 * Elementos de todas las ediciones (también borradores y retirados), en el
 * orden de la revisión: edición, aparato, grupo y clave.
 */
export async function listCatalogElementsForReview(query: {
  state?: ElementReviewState;
  edition?: EditionCode;
  limit?: number;
  cursor: ReviewCursor | null;
}): Promise<ElementReviewPage> {
  const limit = query.limit ?? ELEMENT_REVIEW_PAGE_SIZE;
  await assertInstalled(db);
  const conditions: SQL[] = [sql`true`];
  if (query.state === "withdrawn") conditions.push(sql`e.withdrawn_at is not null`);
  if (query.state === "reviewed") conditions.push(sql`e.withdrawn_at is null and e.review_status = 'reviewed'`);
  if (query.state === "draft") conditions.push(sql`e.withdrawn_at is null and e.review_status = 'draft'`);
  if (query.edition) conditions.push(sql`edition.code = ${query.edition}`);
  if (query.cursor) {
    conditions.push(sql`
      (edition.code collate "C", e.apparatus collate "C", e.element_group collate "C", e.element_key collate "C")
        > (${query.cursor.edition}::text collate "C", ${query.cursor.apparatus}::text collate "C",
           ${query.cursor.group}::text collate "C", ${query.cursor.key}::text collate "C")
    `);
  }
  const result = await db.execute(sql`
    select e.id, e.element_key, edition.code as edition_code, edition.status as edition_status,
      e.apparatus, e.element_group, e.value_letter, e.value_points, e.fig_reference,
      e.name, e.short_name, e.description, e.source_page, e.batch,
      e.review_status, e.reviewed_on::text as reviewed_on, e.withdrawn_at, e.withdrawn_reason
    from zaltyko.catalog_elements as e
    join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
    where ${sql.join(conditions, sql` and `)}
    order by edition.code collate "C", e.apparatus collate "C", e.element_group collate "C", e.element_key collate "C"
    limit ${limit + 1}
  `);
  const rows = result.rows as ReviewRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(reviewItem),
    nextCursor:
      rows.length > limit && last
        ? encodeElementCursor({
            edition: last.edition_code,
            apparatus: last.apparatus,
            group: last.element_group,
            key: last.element_key,
          })
        : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Retirar un elemento                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Retira un elemento: deja de verse en la biblioteca al momento (la búsqueda
 * exige `withdrawn_at is null`) y ninguna semilla lo deshace. Si se indica un
 * aviso, tiene que existir. Un elemento ya retirado responde 409 y conserva su
 * primera fecha y motivo. La constancia en el registro la añade la ruta con
 * `logAdminAction`, después de confirmar la transacción.
 */
export async function withdrawCatalogElement(
  elementId: string,
  input: ElementWithdrawal
): Promise<ElementWithdrawalResult> {
  return withTransaction(async (tx) => {
    await assertInstalled(tx);
    if (input.noticeId) {
      const notice = await tx.execute(
        sql`select id from zaltyko.content_notices where id = ${input.noticeId}::uuid for share`
      );
      if (notice.rows.length === 0) {
        throw new OperationalError("NOT_FOUND", "No encontramos ese aviso.", 404);
      }
    }
    const current = await tx.execute(sql`
      select e.id, e.element_key, e.name, e.withdrawn_at, edition.code as edition_code
      from zaltyko.catalog_elements as e
      join zaltyko.catalog_element_editions as edition on edition.id = e.edition_id
      where e.id = ${elementId}::uuid
      for update of e
    `);
    const row = current.rows[0] as
      | { id: string; element_key: string; name: string; withdrawn_at: Date | string | null; edition_code: string }
      | undefined;
    if (!row) throw new OperationalError("NOT_FOUND", "No encontramos ese elemento.", 404);
    if (row.withdrawn_at !== null) {
      throw new OperationalError("INVALID_STATE_TRANSITION", "Este elemento ya está retirado.", 409, {
        withdrawnAt: iso(row.withdrawn_at),
      });
    }
    const updated = await tx.execute(sql`
      update zaltyko.catalog_elements
      set withdrawn_at = now(), withdrawn_reason = ${input.reason}, updated_at = now()
      where id = ${row.id}::uuid and withdrawn_at is null
      returning withdrawn_at
    `);
    const withdrawnAt = (updated.rows[0] as { withdrawn_at: Date | string } | undefined)?.withdrawn_at;
    if (!withdrawnAt) {
      throw new OperationalError("CONCURRENCY_RETRY", "No se pudo retirar. Vuelve a intentarlo.", 409);
    }
    return {
      id: row.id,
      elementKey: row.element_key,
      editionCode: row.edition_code,
      name: row.name,
      withdrawnAt: iso(withdrawnAt)!,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Plantillas retiradas (fase D)                                             */
/* ------------------------------------------------------------------------ */

/**
 * ¿Está retirada esta plantilla de federación? La lee la importación de la
 * fase D, con su propio cliente o transacción. Sin la tabla
 * `zaltyko.content_withdrawals` no puede haber nada retirado: false. Una clave
 * con forma imposible tampoco está retirada.
 */
export async function isContentWithdrawn(
  client: DatabaseClient,
  kind: ContentWithdrawalKind,
  key: string
): Promise<boolean> {
  if (!isContentWithdrawalKey(key)) return false;
  const present = await client.execute(
    sql`select to_regclass('zaltyko.content_withdrawals') is not null as present`
  );
  if ((present.rows[0] as { present?: unknown } | undefined)?.present !== true) return false;
  const result = await client.execute(sql`
    select exists (
      select 1 from zaltyko.content_withdrawals where kind = ${kind} and key = ${key}
    ) as withdrawn
  `);
  return (result.rows[0] as { withdrawn?: unknown } | undefined)?.withdrawn === true;
}
