import { createHash } from "node:crypto";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { withTransaction, type DatabaseClient } from "@/lib/db-transactions";
import {
  CONTENT_NOTICE_PAGE_SIZE,
  type ContentNoticeKind,
  type ContentNoticePage,
  type ContentNoticeStatus,
  type ContentNoticeUpdate,
  type ContentNoticeView,
  type PublicContentNotice,
} from "@/modules/element-library/domain/content-notices";
import { CONTENT_NOTICE_SENDER_RETENTION_DAYS } from "@/modules/element-library/domain/element-library";
import { sqlUuidArray } from "@/modules/owner-dashboard/application/sql-uuid-array";
import { OperationalError } from "@/modules/shared/domain/operational-error";

import { isElementLibraryStorageInstalled } from "./storage";

/**
 * Avisos sobre contenido (ADR-0029 §8.1 y §8.2): recepción desde el formulario
 * público, bandeja del superadministrador y borrado del remitente dos años
 * después del cierre.
 *
 * El formulario no depende de la bandera de la biblioteca: basta con que las
 * tablas de las candidatas estén instaladas tal cual
 * (`isElementLibraryStorageInstalled`, de storage.ts). Sin ellas, 503.
 * Un aviso nunca retira nada por sí solo.
 */

/** Lotes del borrado programado: 100 avisos por transacción, como el directorio. */
const ERASE_BATCH_SIZE = 100;
/** Tope de lotes por ejecución para no pasar del tiempo de la ruta; el resto, mañana. */
const ERASE_MAX_BATCHES = 50;

export function contentNoticesUnavailable(): OperationalError {
  return new OperationalError(
    "FEATURE_NOT_AVAILABLE",
    "El formulario de avisos no está disponible ahora mismo. Inténtalo más tarde.",
    503,
    { reason: "content_notices_unavailable" }
  );
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Huella del aviso normalizado (SHA-256 en hexadecimal). Reenviar el mismo
 * aviso da la misma huella y no crea otra fila. Incluye el correo: dos
 * personas que señalan lo mismo dejan dos avisos.
 */
export function contentNoticeSubmissionHash(notice: PublicContentNotice): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        notice.contentKind,
        notice.contentUrl,
        notice.reason,
        notice.senderName,
        notice.senderEmail,
      ]),
      "utf8"
    )
    .digest("hex");
}

/**
 * Guarda el aviso. `replayed` es true si ya existía uno idéntico; la ruta
 * responde igual en los dos casos. Si la huella coincide con un aviso cuyo
 * remitente ya se borró, tampoco se crea otro: es el mismo texto del mismo
 * correo.
 */
export async function submitContentNotice(notice: PublicContentNotice): Promise<{ replayed: boolean }> {
  const submissionHash = contentNoticeSubmissionHash(notice);
  return withTransaction(async (tx) => {
    if (!(await isElementLibraryStorageInstalled(tx))) throw contentNoticesUnavailable();
    const inserted = await tx.execute(sql`
      insert into zaltyko.content_notices
        (sender_name, sender_email, content_url, content_kind, reason, good_faith_confirmed, submission_hash)
      values (${notice.senderName}, ${notice.senderEmail}, ${notice.contentUrl}, ${notice.contentKind},
        ${notice.reason}, true, ${submissionHash})
      on conflict (submission_hash) do nothing
      returning id
    `);
    return { replayed: inserted.rows.length === 0 };
  });
}

/* ------------------------------------------------------------------------ */
/* Bandeja del superadministrador                                            */
/* ------------------------------------------------------------------------ */

type NoticeRow = {
  id: string;
  received_at: Date | string;
  cursor_received_at: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_erased_at: Date | string | null;
  content_url: string;
  content_kind: string;
  content_key: string | null;
  reason: string;
  status: string;
  response: string | null;
  closed_at: Date | string | null;
};

const NOTICE_COLUMNS = sql`
  id, received_at,
  to_char(received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_received_at,
  sender_name, sender_email, sender_erased_at, content_url, content_kind, content_key,
  reason, status, response, closed_at
`;

function noticeView(row: NoticeRow): ContentNoticeView {
  return {
    id: row.id,
    receivedAt: iso(row.received_at)!,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    senderErasedAt: iso(row.sender_erased_at),
    contentUrl: row.content_url,
    contentKind: row.content_kind as ContentNoticeKind,
    contentKey: row.content_key,
    reason: row.reason,
    status: row.status as ContentNoticeStatus,
    response: row.response,
    closedAt: iso(row.closed_at),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Cursor de la bandeja: fecha de recepción con microsegundos e id. */
export function encodeNoticeCursor(receivedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([receivedAt, id]), "utf8").toString("base64url");
}

export function decodeNoticeCursor(cursor: string): { receivedAt: string; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      !CURSOR_TIME.test(parsed[0]) ||
      !UUID.test(parsed[1])
    ) {
      return null;
    }
    return { receivedAt: parsed[0], id: parsed[1].toLowerCase() };
  } catch {
    return null;
  }
}

async function assertNoticesInstalled(client: DatabaseClient) {
  if (!(await isElementLibraryStorageInstalled(client))) throw contentNoticesUnavailable();
}

/** Avisos, del más reciente al más antiguo. La ruta decodifica y valida el cursor. */
export async function listContentNotices(query: {
  status?: ContentNoticeStatus;
  limit?: number;
  cursor: { receivedAt: string; id: string } | null;
}): Promise<ContentNoticePage> {
  const limit = query.limit ?? CONTENT_NOTICE_PAGE_SIZE;
  const { cursor } = query;
  await assertNoticesInstalled(db);
  const conditions: SQL[] = [sql`true`];
  if (query.status) conditions.push(sql`status = ${query.status}`);
  if (cursor) {
    conditions.push(
      sql`(received_at, id) < (${cursor.receivedAt}::timestamptz, ${cursor.id}::uuid)`
    );
  }
  const result = await db.execute(sql`
    select ${NOTICE_COLUMNS}
    from zaltyko.content_notices
    where ${sql.join(conditions, sql` and `)}
    order by received_at desc, id desc
    limit ${limit + 1}
  `);
  const rows = result.rows as NoticeRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(noticeView),
    nextCursor: rows.length > limit && last ? encodeNoticeCursor(last.cursor_received_at, last.id) : null,
  };
}

/**
 * Cambia el estado o la respuesta. Cerrar pone `closed_at` (y conserva el de
 * un aviso que ya estaba cerrado); salir de `closed` lo quita. El borrado del
 * remitente cuenta desde `closed_at`.
 */
export async function updateContentNotice(
  noticeId: string,
  update: ContentNoticeUpdate
): Promise<ContentNoticeView> {
  return withTransaction(async (tx) => {
    await assertNoticesInstalled(tx);
    const responseProvided = update.response !== undefined;
    const result = await tx.execute(sql`
      update zaltyko.content_notices
      set status = coalesce(${update.status ?? null}::text, status),
          response = case when ${responseProvided}::boolean then ${update.response ?? null}::text else response end,
          closed_at = case
            when coalesce(${update.status ?? null}::text, status) = 'closed' then coalesce(closed_at, now())
            else null
          end,
          updated_at = now()
      where id = ${noticeId}::uuid
      returning ${NOTICE_COLUMNS}
    `);
    const row = result.rows[0] as NoticeRow | undefined;
    if (!row) throw new OperationalError("NOT_FOUND", "No encontramos ese aviso.", 404);
    return noticeView(row);
  });
}

/* ------------------------------------------------------------------------ */
/* Conservación: borrado del remitente                                       */
/* ------------------------------------------------------------------------ */

/** Avisos cerrados hace más de 730 días que aún conservan nombre y correo. */
const ERASABLE = sql`
  status = 'closed'
  and closed_at < now() - make_interval(days => ${CONTENT_NOTICE_SENDER_RETENTION_DAYS}::int)
  and sender_erased_at is null
`;

export type NoticeRetentionResult = {
  /** false si la tabla de avisos no existe: no hay nada que borrar. */
  enabled: boolean;
  erased: number;
  batches: number;
};

/**
 * Borra nombre y correo de los avisos cerrados hace más de dos años
 * (`CONTENT_NOTICE_SENDER_RETENTION_DAYS`), por lotes de 100: lee los ids y
 * vuelve a bloquearlos `FOR UPDATE` con el mismo criterio dentro de una
 * transacción por lote. Volver a ejecutarlo no cambia nada más.
 *
 * Solo exige que exista `zaltyko.content_notices`, no las cinco tablas: el
 * borrado de datos personales no espera a que se arregle otra tabla.
 */
export async function eraseExpiredNoticeSenders(): Promise<NoticeRetentionResult> {
  const present = await db.execute(
    sql`select to_regclass('zaltyko.content_notices') is not null as present`
  );
  if ((present.rows[0] as { present?: unknown } | undefined)?.present !== true) {
    return { enabled: false, erased: 0, batches: 0 };
  }
  let erased = 0;
  let batches = 0;
  while (batches < ERASE_MAX_BATCHES) {
    const candidates = await db.execute(sql`
      select id from zaltyko.content_notices
      where ${ERASABLE}
      order by closed_at, id
      limit ${ERASE_BATCH_SIZE}
    `);
    const ids = (candidates.rows as Array<{ id: string }>).map((row) => row.id);
    if (ids.length === 0) break;
    batches += 1;
    erased += await withTransaction(async (tx) => {
      const locked = await tx.execute(sql`
        select id from zaltyko.content_notices
        where id = any(${sqlUuidArray(ids)}) and ${ERASABLE}
        for update
      `);
      const lockedIds = (locked.rows as Array<{ id: string }>).map((row) => row.id);
      if (lockedIds.length === 0) return 0;
      const updated = await tx.execute(sql`
        update zaltyko.content_notices
        set sender_name = null, sender_email = null, sender_erased_at = now(), updated_at = now()
        where id = any(${sqlUuidArray(lockedIds)})
        returning id
      `);
      return updated.rows.length;
    });
    if (ids.length < ERASE_BATCH_SIZE) break;
  }
  return { enabled: true, erased, batches };
}
