import { z } from "zod";

import { CATALOG_WITHDRAWN_REASON_MAX, EDITION_CODES } from "./element-library";

/**
 * Avisos sobre contenido, retirada y conservación (ADR-0029 §8). Dominio puro:
 * esquemas de la API pública y del superadministrador, y límites que repiten
 * los CHECK de `zaltyko.content_notices`, `zaltyko.content_withdrawals` y
 * `zaltyko.catalog_elements` (docs/deployment/candidates/
 * 20261119120000_element_library_candidate.sql).
 *
 * Un aviso no retira nada por sí solo: la retirada es una acción aparte del
 * superadministrador.
 */

/** Qué se señala. `federation_template` = plantilla de niveles de federación. */
export const CONTENT_NOTICE_KINDS = ["element", "federation_template", "other"] as const;
export type ContentNoticeKind = (typeof CONTENT_NOTICE_KINDS)[number];

export const CONTENT_NOTICE_KIND_LABELS: Record<ContentNoticeKind, string> = {
  element: "Elemento de la biblioteca",
  federation_template: "Plantilla de niveles de federación",
  other: "Otro contenido",
};

export const CONTENT_NOTICE_STATUSES = ["received", "reviewing", "closed"] as const;
export type ContentNoticeStatus = (typeof CONTENT_NOTICE_STATUSES)[number];

export const CONTENT_NOTICE_STATUS_LABELS: Record<ContentNoticeStatus, string> = {
  received: "Recibido",
  reviewing: "En revisión",
  closed: "Cerrado",
};

/** Clases de `zaltyko.content_withdrawals` (solo plantillas de federación). */
export const CONTENT_WITHDRAWAL_KINDS = ["federation_template"] as const;
export type ContentWithdrawalKind = (typeof CONTENT_WITHDRAWAL_KINDS)[number];

export const CONTENT_NOTICE_REASON_MIN = 10;
export const CONTENT_NOTICE_REASON_MAX = 2000;
export const CONTENT_NOTICE_URL_MAX = 500;
export const CONTENT_NOTICE_SENDER_NAME_MIN = 2;
export const CONTENT_NOTICE_SENDER_NAME_MAX = 120;
export const CONTENT_NOTICE_EMAIL_MAX = 254;
export const CONTENT_NOTICE_RESPONSE_MAX = 2000;
export const ELEMENT_WITHDRAWAL_REASON_MIN = 10;
export const ELEMENT_WITHDRAWAL_REASON_MAX = CATALOG_WITHDRAWN_REASON_MAX;
export const CONTENT_WITHDRAWAL_KEY_MAX = 64;

/** Dominios admitidos en una URL absoluta del aviso. */
export const CONTENT_NOTICE_HOSTS = ["zaltyko.com", "www.zaltyko.com"] as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
/** En textos largos se admiten saltos de línea y tabuladores; nada más de control. */
// eslint-disable-next-line no-control-regex
const LONG_TEXT_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;
const HTML_LIKE = /[<>]/u;
const WHITESPACE = /\s/u;

/** Longitud en caracteres, como `length()` de PostgreSQL (no en unidades UTF-16). */
function characters(value: string): number {
  return [...value].length;
}

/** Una línea: sin control ni `<>`, espacios seguidos reducidos a uno. */
function plainLine(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => !CONTROL_CHARS.test(value) && !HTML_LIKE.test(value), {
      message: "Utiliza texto sin símbolos especiales",
    })
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " "))
    .refine((value) => characters(value) >= min && characters(value) <= max, {
      message: `Entre ${min} y ${max} caracteres`,
    });
}

/** Texto largo con saltos de línea: CRLF a LF, sin otros caracteres de control. */
function longText(min: number, max: number) {
  return z
    .string()
    .transform((value) =>
      value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(LONG_TEXT_CONTROL_CHARS, "").trim()
    )
    .refine((value) => characters(value) >= min && characters(value) <= max, {
      message: `Entre ${min} y ${max} caracteres`,
    });
}

/**
 * URL del contenido señalado: relativa a la app (`/owner/...`) o absoluta,
 * HTTPS y de zaltyko.com. Sin espacios, sin usuario ni contraseña.
 */
export function isContentNoticeUrl(value: string): boolean {
  if (value.length < 1 || value.length > CONTENT_NOTICE_URL_MAX) return false;
  if (CONTROL_CHARS.test(value) || WHITESPACE.test(value)) return false;
  if (value.startsWith("/")) {
    // «//host» y «/\host» los resuelven los navegadores como otro dominio.
    return !value.startsWith("//") && !value.startsWith("/\\");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    (CONTENT_NOTICE_HOSTS as readonly string[]).includes(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

/**
 * Formulario público (Reglamento de Servicios Digitales, art. 16.2): motivo,
 * URL exacta, nombre, correo y declaración de buena fe. `website` es el campo
 * trampa: la ruta lo comprueba antes de validar.
 */
export const publicContentNoticeSchema = z
  .object({
    contentKind: z.enum(CONTENT_NOTICE_KINDS),
    contentUrl: z.string().trim().refine(isContentNoticeUrl, {
      message: "Indica la dirección exacta del contenido en zaltyko.com",
    }),
    reason: longText(CONTENT_NOTICE_REASON_MIN, CONTENT_NOTICE_REASON_MAX),
    senderName: plainLine(CONTENT_NOTICE_SENDER_NAME_MIN, CONTENT_NOTICE_SENDER_NAME_MAX),
    senderEmail: z
      .string()
      .trim()
      .max(CONTENT_NOTICE_EMAIL_MAX)
      .email()
      .transform((value) => value.toLowerCase()),
    goodFaith: z.literal(true),
    /** Campo trampa: un navegador real lo deja vacío. */
    website: z.string().max(200).nullable().optional(),
  })
  .strict();

export type PublicContentNoticeInput = z.input<typeof publicContentNoticeSchema>;
export type PublicContentNotice = z.output<typeof publicContentNoticeSchema>;

/* ------------------------------------------------------------------------ */
/* Superadministrador                                                        */
/* ------------------------------------------------------------------------ */

export const CONTENT_NOTICE_PAGE_SIZE = 25;
export const CONTENT_NOTICE_PAGE_SIZE_MAX = 100;
export const ELEMENT_REVIEW_PAGE_SIZE = 100;
export const ELEMENT_REVIEW_PAGE_SIZE_MAX = 200;

const limitParam = (max: number) =>
  z
    .string()
    .regex(/^\d{1,3}$/u)
    .transform(Number)
    .pipe(z.number().int().min(1).max(max))
    .optional();

/** Cursor opaco: base64url sin relleno, con un tope de longitud. */
const cursorParam = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/u)
  .optional();

export const contentNoticeListQuerySchema = z
  .object({
    status: z.enum(CONTENT_NOTICE_STATUSES).optional(),
    limit: limitParam(CONTENT_NOTICE_PAGE_SIZE_MAX),
    cursor: cursorParam,
  })
  .strict();
export type ContentNoticeListQuery = z.output<typeof contentNoticeListQuerySchema>;

/**
 * Cambio de un aviso: estado, respuesta o los dos. `closed` cierra (pone
 * `closed_at`); salir de `closed` lo vuelve a abrir. Una respuesta vacía la
 * borra.
 */
export const contentNoticeUpdateSchema = z
  .object({
    status: z.enum(CONTENT_NOTICE_STATUSES).optional(),
    response: z
      .string()
      .transform((value) =>
        value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(LONG_TEXT_CONTROL_CHARS, "").trim()
      )
      .refine((value) => characters(value) <= CONTENT_NOTICE_RESPONSE_MAX, {
        message: `Hasta ${CONTENT_NOTICE_RESPONSE_MAX} caracteres`,
      })
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.response !== undefined, {
    message: "Indica el estado o la respuesta",
  });
export type ContentNoticeUpdate = z.output<typeof contentNoticeUpdateSchema>;

/** Estados de revisión que ve el superadministrador. */
export const ELEMENT_REVIEW_STATES = ["draft", "reviewed", "withdrawn"] as const;
export type ElementReviewState = (typeof ELEMENT_REVIEW_STATES)[number];

export const ELEMENT_REVIEW_STATE_LABELS: Record<ElementReviewState, string> = {
  draft: "Borrador",
  reviewed: "Revisado",
  withdrawn: "Retirado",
};

export const elementReviewListQuerySchema = z
  .object({
    state: z.enum(ELEMENT_REVIEW_STATES).optional(),
    edition: z.enum(EDITION_CODES).optional(),
    limit: limitParam(ELEMENT_REVIEW_PAGE_SIZE_MAX),
    cursor: cursorParam,
  })
  .strict();
export type ElementReviewListQuery = z.output<typeof elementReviewListQuerySchema>;

/** «Retirar» un elemento: motivo y, si lo hay, el aviso que lo motiva. */
export const elementWithdrawalSchema = z
  .object({
    reason: plainLine(ELEMENT_WITHDRAWAL_REASON_MIN, ELEMENT_WITHDRAWAL_REASON_MAX),
    noticeId: z
      .guid()
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
  })
  .strict();
export type ElementWithdrawal = z.output<typeof elementWithdrawalSchema>;

/** Clave de una plantilla retirada (`content_withdrawals.key`). */
export function isContentWithdrawalKey(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= CONTENT_WITHDRAWAL_KEY_MAX &&
    !WHITESPACE.test(value) &&
    !CONTROL_CHARS.test(value)
  );
}

/* ------------------------------------------------------------------------ */
/* Vistas                                                                    */
/* ------------------------------------------------------------------------ */

export type ContentNoticeView = {
  id: string;
  receivedAt: string;
  /** null cuando ya se borró (dos años después del cierre). */
  senderName: string | null;
  senderEmail: string | null;
  senderErasedAt: string | null;
  contentUrl: string;
  contentKind: ContentNoticeKind;
  contentKey: string | null;
  reason: string;
  status: ContentNoticeStatus;
  response: string | null;
  closedAt: string | null;
};

export type ContentNoticePage = {
  items: ContentNoticeView[];
  nextCursor: string | null;
};

export type ElementReviewItem = {
  id: string;
  elementKey: string;
  editionCode: string;
  editionStatus: string;
  apparatus: string;
  group: string;
  valueLetter: string | null;
  valuePoints: number | null;
  figReference: string | null;
  name: string;
  shortName: string;
  description: string | null;
  sourcePage: number;
  batch: number;
  reviewStatus: "draft" | "reviewed";
  reviewedOn: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
  state: ElementReviewState;
};

export type ElementReviewPage = {
  items: ElementReviewItem[];
  nextCursor: string | null;
};

export type ElementWithdrawalResult = {
  id: string;
  elementKey: string;
  editionCode: string;
  name: string;
  withdrawnAt: string;
};
