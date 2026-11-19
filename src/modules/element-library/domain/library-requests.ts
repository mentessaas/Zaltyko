import { z } from "zod";

import { SKILL_APPARATUS_BY_DISCIPLINE } from "@/modules/skill-levels/domain/skill-levels";

import {
  CATALOG_APPARATUS,
  CATALOG_DISCIPLINES,
  CATALOG_ELEMENT_GROUP_MAX,
  ELEMENT_NOTE_MAX,
  VALUE_LETTERS,
  type CatalogApparatus,
  type CatalogDiscipline,
} from "./element-library";

/**
 * Biblioteca de elementos: peticiones de la API (búsqueda, ficha y nota de la
 * academia) y vistas que devuelve el servicio. Dominio puro, sin base de datos.
 * La biblioteca es de toda la academia, pero cada petición lleva la sede para
 * resolver el alcance del equipo como las demás pantallas del equipo técnico
 * (un entrenador solo entra desde una sede suya).
 */

/** Tope de resultados de una búsqueda y valor por defecto. */
export const CATALOG_SEARCH_LIMIT_MAX = 100;
export const CATALOG_SEARCH_LIMIT_DEFAULT = 50;
/** Longitud máxima del texto que se busca. */
export const CATALOG_SEARCH_QUERY_MAX = 80;

const scopeShape = {
  organizationId: z.guid(),
  locationId: z.guid(),
};

/** URLSearchParams entrega "" para un filtro vacío y null si falta: los dos son «sin filtro». */
function optionalFilter<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? null : value), schema.nullable().optional());
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
/** En la nota se admiten saltos de línea y tabuladores; nada más de control. */
// eslint-disable-next-line no-control-regex
const NOTE_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/u;

const groupSchema = z.string().regex(new RegExp(`^[A-Za-z0-9_-]{1,${CATALOG_ELEMENT_GROUP_MAX}}$`));
/** Letra («D», «d») o puntos («4.2», «4,20»). */
const valueSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^(?:[${VALUE_LETTERS}${VALUE_LETTERS.toLowerCase()}]|\\d{1,2}(?:[.,]\\d{1,2})?)$`));
const searchTextSchema = z
  .string()
  .trim()
  .max(CATALOG_SEARCH_QUERY_MAX)
  .refine((value) => !CONTROL_CHARS.test(value), "Sin caracteres de control");

export const catalogSearchQuerySchema = z
  .object({
    ...scopeShape,
    discipline: z.enum(CATALOG_DISCIPLINES),
    apparatus: optionalFilter(z.enum(CATALOG_APPARATUS)),
    group: optionalFilter(groupSchema),
    value: optionalFilter(valueSchema),
    q: optionalFilter(searchTextSchema),
    limit: optionalFilter(z.coerce.number().int().min(1).max(CATALOG_SEARCH_LIMIT_MAX)),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (
      query.apparatus &&
      !(SKILL_APPARATUS_BY_DISCIPLINE[query.discipline] as readonly string[]).includes(query.apparatus)
    ) {
      ctx.addIssue({ code: "custom", path: ["apparatus"], message: "El aparato no es de esa disciplina" });
    }
  });
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

export const catalogElementQuerySchema = z.object({ ...scopeShape }).strict();
export type CatalogElementQuery = z.infer<typeof catalogElementQuerySchema>;

/**
 * Texto de la nota: saltos de línea normalizados, NFC y sin espacios en los
 * extremos; como mucho ELEMENT_NOTE_MAX caracteres. Vacía equivale a borrarla.
 */
const noteTextSchema = z
  .string()
  .max(ELEMENT_NOTE_MAX * 4)
  .transform((value) => value.replace(/\r\n?/gu, "\n").normalize("NFC").trim())
  .pipe(
    z
      .string()
      .max(ELEMENT_NOTE_MAX, `La nota admite ${ELEMENT_NOTE_MAX} caracteres`)
      .refine((value) => !NOTE_CONTROL_CHARS.test(value), "La nota no admite caracteres de control")
  )
  .transform((value) => (value === "" ? null : value));

/**
 * Guardar la nota de la academia sobre un elemento. `expectedRevision` es la
 * revisión que se vio (null si no había nota); `note` null o vacía la borra.
 */
export const saveElementNoteCommandSchema = z
  .object({
    ...scopeShape,
    clientRequestId: z.guid(),
    expectedRevision: z.number().int().min(1).max(2_147_483_647).nullable(),
    note: noteTextSchema.nullable(),
  })
  .strict();
export type SaveElementNoteCommand = z.infer<typeof saveElementNoteCommandSchema>;

/* ------------------------------------------------------------------------ */
/* Vistas                                                                    */
/* ------------------------------------------------------------------------ */

export type EditionView = {
  id: string;
  code: string;
  discipline: CatalogDiscipline;
  title: string;
  cycleStart: number;
  cycleEnd: number;
  /** AAAA-MM-DD. */
  coverDate: string;
  documentUrl: string;
  /** Pie fijo de la biblioteca (ADR-0029 §1.8). */
  attribution: string;
};

export type CatalogElementSummary = {
  id: string;
  elementKey: string;
  apparatus: CatalogApparatus;
  group: string;
  valueLetter: string | null;
  valuePoints: number | null;
  figReference: string | null;
  name: string;
  shortName: string;
  /** La academia tiene una nota sobre este elemento. */
  hasNote: boolean;
};

export type CatalogSearchResult = {
  /** Edición publicada más reciente de la disciplina; null si aún no hay ninguna. */
  edition: EditionView | null;
  elements: CatalogElementSummary[];
  /** Había más resultados que el límite pedido. */
  truncated: boolean;
};

export type ElementNoteView = {
  text: string;
  revision: number;
  updatedAt: string;
};

export type CatalogElementCard = Omit<CatalogElementSummary, "hasNote"> & {
  discipline: CatalogDiscipline;
  /** Solo con ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED; si no, null. */
  description: string | null;
  edition: EditionView;
  attribution: string;
  note: ElementNoteView | null;
  /** El plan está en solo lectura: la nota se ve, pero no se guarda. */
  readOnly: boolean;
};

export type SaveElementNoteResult = {
  note: ElementNoteView | null;
  /** La petición repetía lo que ya estaba guardado: no se escribió nada. */
  replayed: boolean;
};

/**
 * Estado de un elemento enlazado desde niveles o guiones (ADR-0029 §3.6):
 * «current» se ve en la biblioteca; «withdrawn» ya no está («Ya no está en la
 * biblioteca»); «previous_edition» es de una edición anterior («Edición
 * anterior»). `replacementId` es el mismo `element_key` en una edición
 * publicada más nueva y visible: se ofrece «Actualizar enlace», nunca solo.
 */
export type CatalogLinkStatus = "current" | "withdrawn" | "previous_edition";

export type CatalogLinkView = {
  name: string;
  shortName: string;
  apparatus: CatalogApparatus;
  discipline: CatalogDiscipline;
  status: CatalogLinkStatus;
  replacementId: string | null;
};
