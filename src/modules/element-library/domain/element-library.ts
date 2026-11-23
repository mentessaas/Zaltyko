import { z } from "zod";

import {
  SKILL_APPARATUS_BY_DISCIPLINE,
  type SkillApparatus,
  type SkillDiscipline,
} from "@/modules/skill-levels/domain/skill-levels";

/**
 * Biblioteca de elementos (ADR-0029 §1). Dominio puro: banderas, límites,
 * esquemas de los archivos de datos revisados, visibilidad, atribución y
 * filtro del catálogo. Nada aquí toca la base de datos ni el disco.
 *
 * La fuente de verdad son los archivos de `src/modules/element-library/data/`
 * (lectura en `data-files.ts`). La semilla SQL de cada tanda se genera con
 * `scripts/element-library/build-seed.ts` (`seed-sql.ts`).
 */

/* ------------------------------------------------------------------------ */
/* Banderas y disponibilidad                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Bandera de servidor, apagada por defecto. La biblioteca exige además la de
 * niveles (`ZALTYKO_SKILL_LEVELS_ENABLED`) y las tablas de la candidata: eso lo
 * comprueba la capa de aplicación. Sin ella, las páginas dan 404 y las API
 * responden 503 con ELEMENT_LIBRARY_UNAVAILABLE_REASON.
 */
export const ELEMENT_LIBRARY_ENV_FLAG = "ZALTYKO_ELEMENT_LIBRARY_ENABLED";

/** Muestra las descripciones redactadas en la ficha. Apagada por defecto. */
export const ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG = "ZALTYKO_ELEMENT_LIBRARY_DESCRIPTIONS_ENABLED";

type EnvLike = Readonly<Record<string, string | undefined>>;

export function isElementLibraryFlagOn(env: EnvLike = process.env): boolean {
  return env[ELEMENT_LIBRARY_ENV_FLAG] === "true";
}

export function isElementLibraryDescriptionsFlagOn(env: EnvLike = process.env): boolean {
  return env[ELEMENT_LIBRARY_DESCRIPTIONS_ENV_FLAG] === "true";
}

/** Motivo del 503: el cliente solo muestra «no disponible» con este motivo. */
export const ELEMENT_LIBRARY_UNAVAILABLE_REASON = "element_library_unavailable";

/* ------------------------------------------------------------------------ */
/* Disciplinas, ediciones, aparatos y límites                                */
/* ------------------------------------------------------------------------ */

/** Solo artística: la rítmica no tiene catálogo en esta fase. */
export const CATALOG_DISCIPLINES = ["artistic_female", "artistic_male"] as const satisfies readonly SkillDiscipline[];
export type CatalogDiscipline = (typeof CATALOG_DISCIPLINES)[number];

/** Aparatos de artística (unión de las dos disciplinas de `skill-levels`). */
export const CATALOG_APPARATUS = [
  "vault",
  "uneven_bars",
  "beam",
  "floor",
  "pommel_horse",
  "rings",
  "parallel_bars",
  "high_bar",
] as const satisfies readonly SkillApparatus[];
export type CatalogApparatus = (typeof CATALOG_APPARATUS)[number];

export const EDITION_CODES = ["fig-wag-2025-2028", "fig-mag-2025-2028"] as const;
export type EditionCode = (typeof EDITION_CODES)[number];

/** Cada edición pertenece a una sola disciplina. */
export const EDITION_DISCIPLINE = {
  "fig-wag-2025-2028": "artistic_female",
  "fig-mag-2025-2028": "artistic_male",
} as const satisfies Record<EditionCode, CatalogDiscipline>;

export const EDITION_STATUSES = ["draft", "published", "retired"] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];

/** `draft` = «borrador»; `reviewed` = «revisado» (por Elvis o, por delegación suya, por Claude). */
export const REVIEW_STATUSES = ["draft", "reviewed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Letras de valor admitidas, de menor a mayor. */
export const VALUE_LETTERS = "ABCDEFGHIJ";

/** Clave propia del elemento, estable entre ediciones. */
export const ELEMENT_KEY_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export const CATALOG_ELEMENT_NAME_MIN = 2;
export const CATALOG_ELEMENT_NAME_MAX = 100;
export const CATALOG_ELEMENT_SHORT_NAME_MAX = 40;
export const CATALOG_ELEMENT_DESCRIPTION_MAX = 300;
export const CATALOG_FIG_REFERENCE_MAX = 20;
export const CATALOG_ELEMENT_GROUP_MAX = 20;
export const CATALOG_EDITION_TITLE_MAX = 200;
export const CATALOG_WITHDRAWN_REASON_MAX = 500;
export const ELEMENT_NOTE_MAX = 500;
/** `value_points numeric(4,2)`. */
export const CATALOG_VALUE_POINTS_MAX = 99.99;

/** Único dominio admitido para el enlace al documento oficial. */
export const EDITION_DOCUMENT_HOST = "www.gymnastics.sport";

/**
 * Conservación del remitente de un aviso sobre contenido (ADR-0029 §8.2):
 * nombre y correo se borran dos años (730 días) después del cierre del aviso.
 * Lo declara la clasificación de data-rights y lo ejecuta el trabajo
 * programado de borrado.
 */
export const CONTENT_NOTICE_SENDER_RETENTION_DAYS = 730;

/** Aviso fijo de autoría que encabeza cada archivo de datos y de tanda. */
export const ELEMENT_DATA_NOTICE =
  "Datos: número, grupo y valor tomados del Código de Puntuación de la FIG como hechos. Nombres y descripciones redactados por Zaltyko; no son texto oficial ni traducción. © Zaltyko. No copiar el texto del Código.";

/* ------------------------------------------------------------------------ */
/* Esquemas de los archivos de datos                                         */
/* ------------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

/** Texto sin caracteres de control ni espacios al principio o al final. */
function cleanText(min: number, max: number) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine((value) => !CONTROL_CHARS.test(value), "Sin caracteres de control")
    .refine((value) => value === value.trim(), "Sin espacios al principio ni al final");
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isoDateSchema = z.string().refine(isIsoDate, "Fecha AAAA-MM-DD");

export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

export function isOfficialDocumentUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === EDITION_DOCUMENT_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

const elementKeySchema = z.string().regex(ELEMENT_KEY_PATTERN);
const groupKeySchema = z.string().regex(new RegExp(`^[A-Za-z0-9_-]{1,${CATALOG_ELEMENT_GROUP_MAX}}$`));

function apparatusBelongsToCatalogDiscipline(discipline: CatalogDiscipline, apparatus: string): boolean {
  return (SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly string[]).includes(apparatus);
}

const editionGroupSchema = z
  .object({
    key: groupKeySchema,
    label: cleanText(1, 120),
  })
  .strict();

/** Una edición de `data/editions.json`. */
export const editionFileSchema = z
  .object({
    code: z.enum(EDITION_CODES),
    discipline: z.enum(CATALOG_DISCIPLINES),
    cycleStart: z.number().int().min(2000).max(2100),
    cycleEnd: z.number().int().min(2000).max(2100),
    title: cleanText(1, CATALOG_EDITION_TITLE_MAX),
    documentUrl: z.string().max(500).refine(isOfficialDocumentUrl, `URL HTTPS de ${EDITION_DOCUMENT_HOST}`),
    coverDate: isoDateSchema,
    status: z.enum(EDITION_STATUSES),
    groups: z.record(z.string(), z.array(editionGroupSchema).min(1)),
  })
  .strict()
  .superRefine((edition, ctx) => {
    if (EDITION_DISCIPLINE[edition.code] !== edition.discipline) {
      ctx.addIssue({ code: "custom", path: ["discipline"], message: "La disciplina no corresponde a la edición" });
    }
    if (edition.cycleEnd <= edition.cycleStart) {
      ctx.addIssue({ code: "custom", path: ["cycleEnd"], message: "El ciclo termina después de empezar" });
    }
    for (const [apparatus, groups] of Object.entries(edition.groups)) {
      if (!apparatusBelongsToCatalogDiscipline(edition.discipline, apparatus)) {
        ctx.addIssue({ code: "custom", path: ["groups", apparatus], message: "Aparato de otra disciplina" });
      }
      const keys = groups.map((group) => group.key);
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: "custom", path: ["groups", apparatus], message: "Grupo repetido" });
      }
    }
  });
export type EditionFile = z.infer<typeof editionFileSchema>;

/** `data/editions.json`: lista de ediciones, sin códigos repetidos. */
export const editionsFileSchema = z.array(editionFileSchema).superRefine((editions, ctx) => {
  const codes = editions.map((edition) => edition.code);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", message: "Edición repetida" });
  }
});

/**
 * Un elemento de `data/<edición>/<aparato>.json`. Lleva letra de valor o
 * puntos (solo salto; lo comprueba el archivo), exactamente uno.
 */
export const elementRecordSchema = z
  .object({
    elementKey: elementKeySchema,
    group: groupKeySchema,
    valueLetter: z
      .string()
      .length(1)
      .refine((letter) => VALUE_LETTERS.includes(letter), `Letra de ${VALUE_LETTERS[0]} a ${VALUE_LETTERS.at(-1)}`)
      .optional(),
    valuePoints: z
      .number()
      .positive()
      .max(CATALOG_VALUE_POINTS_MAX)
      .refine(hasAtMostTwoDecimals, "Como mucho dos decimales")
      .optional(),
    figReference: cleanText(1, CATALOG_FIG_REFERENCE_MAX).optional(),
    name: cleanText(CATALOG_ELEMENT_NAME_MIN, CATALOG_ELEMENT_NAME_MAX),
    shortName: cleanText(1, CATALOG_ELEMENT_SHORT_NAME_MAX),
    description: cleanText(1, CATALOG_ELEMENT_DESCRIPTION_MAX).optional(),
    sourcePage: z.number().int().positive(),
    sourceCheckedOn: isoDateSchema,
    draftedBy: z.literal("Claude"),
    draftedOn: isoDateSchema,
    batch: z.number().int().positive(),
    reviewStatus: z.enum(REVIEW_STATUSES),
    reviewedOn: isoDateSchema.optional(),
  })
  .strict()
  .superRefine((element, ctx) => {
    if ((element.valueLetter === undefined) === (element.valuePoints === undefined)) {
      ctx.addIssue({ code: "custom", path: ["valueLetter"], message: "Letra de valor o puntos, exactamente uno" });
    }
    if ((element.reviewStatus === "reviewed") !== (element.reviewedOn !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["reviewedOn"], message: "reviewedOn solo y siempre con reviewed" });
    }
  });
export type ElementRecord = z.infer<typeof elementRecordSchema>;

/** `data/<edición>/<aparato>.json`. */
export const elementDataFileSchema = z
  .object({
    aviso: z.literal(ELEMENT_DATA_NOTICE),
    edition: z.enum(EDITION_CODES),
    apparatus: z.enum(CATALOG_APPARATUS),
    elements: z.array(elementRecordSchema).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    if (!apparatusBelongsToCatalogDiscipline(EDITION_DISCIPLINE[file.edition], file.apparatus)) {
      ctx.addIssue({ code: "custom", path: ["apparatus"], message: "Aparato de otra disciplina" });
    }
    const seen = new Set<string>();
    file.elements.forEach((element, index) => {
      if (element.valuePoints !== undefined && file.apparatus !== "vault") {
        ctx.addIssue({ code: "custom", path: ["elements", index, "valuePoints"], message: "Puntos solo en salto" });
      }
      if (seen.has(element.elementKey)) {
        ctx.addIssue({ code: "custom", path: ["elements", index, "elementKey"], message: "Clave repetida" });
      }
      seen.add(element.elementKey);
    });
  });
export type ElementDataFile = z.infer<typeof elementDataFileSchema>;

/**
 * Registro de una tanda, `data/<edición>/tandas/<n>.json` (ADR-0029 §1.7).
 * Sin datos personales: quien redacta y comprueba es «Claude»; quien hace la
 * muestra manual y la revisión, «Elvis» o, por delegación suya (23-11-2026),
 * «Claude» desde una sesión distinta de la que redacta. Nulo hasta que se hace.
 */
/** Quién puede revisar una tanda: Elvis o, por delegación suya, Claude. */
export const REVIEWERS = ["Elvis", "Claude"] as const;

export const batchRecordSchema = z
  .object({
    batch: z.number().int().positive(),
    edition: z.enum(EDITION_CODES),
    apparatus: z.array(z.enum(CATALOG_APPARATUS)).min(1),
    elementKeys: z.array(elementKeySchema).min(1),
    procedure: z
      .object({
        name: z.literal("sala-limpia"),
        version: cleanText(1, 20),
        steps: z.array(cleanText(1, 300)).min(1),
      })
      .strict(),
    factsExtractedOn: isoDateSchema,
    draftedBy: z.literal("Claude"),
    draftedOn: isoDateSchema,
    similarityCheck: z
      .object({
        method: cleanText(1, 200),
        threshold: z.number().gt(0).max(1),
        /** Máximo tras rehacer lo que superó el umbral. */
        maxScore: z.number().min(0).max(1),
        redrafted: z.array(elementKeySchema),
        checkedOn: isoDateSchema,
        checkedBy: z.literal("Claude"),
      })
      .strict(),
    manualSample: z
      .object({
        sampleKeys: z.array(elementKeySchema).min(1),
        checkedBy: z.enum(REVIEWERS).nullable(),
        checkedOn: isoDateSchema.nullable(),
        result: cleanText(1, 500).nullable(),
      })
      .strict(),
    reviewedBy: z.enum(REVIEWERS).nullable(),
    reviewedOn: isoDateSchema.nullable(),
    aviso: z.literal(ELEMENT_DATA_NOTICE),
  })
  .strict()
  .superRefine((record, ctx) => {
    const keys = new Set(record.elementKeys);
    if (keys.size !== record.elementKeys.length) {
      ctx.addIssue({ code: "custom", path: ["elementKeys"], message: "Clave repetida" });
    }
    for (const apparatus of record.apparatus) {
      if (!apparatusBelongsToCatalogDiscipline(EDITION_DISCIPLINE[record.edition], apparatus)) {
        ctx.addIssue({ code: "custom", path: ["apparatus"], message: "Aparato de otra disciplina" });
      }
    }
    if (record.similarityCheck.maxScore > record.similarityCheck.threshold) {
      ctx.addIssue({ code: "custom", path: ["similarityCheck", "maxScore"], message: "Supera el umbral" });
    }
    if (record.similarityCheck.redrafted.some((key) => !keys.has(key))) {
      ctx.addIssue({ code: "custom", path: ["similarityCheck", "redrafted"], message: "Clave fuera de la tanda" });
    }
    const { sampleKeys, checkedBy, checkedOn, result } = record.manualSample;
    if (sampleKeys.some((key) => !keys.has(key)) || new Set(sampleKeys).size !== sampleKeys.length) {
      ctx.addIssue({ code: "custom", path: ["manualSample", "sampleKeys"], message: "Muestra fuera de la tanda o repetida" });
    }
    // ADR-0029 §1.7: la comparación manual cubre al menos el 10 % de la tanda.
    if (sampleKeys.length < Math.ceil(record.elementKeys.length / 10)) {
      ctx.addIssue({ code: "custom", path: ["manualSample", "sampleKeys"], message: "Muestra menor que el 10 % de la tanda" });
    }
    const sampleDone = [checkedBy, checkedOn, result].map((value) => value !== null);
    if (sampleDone.some((done) => done !== sampleDone[0])) {
      ctx.addIssue({ code: "custom", path: ["manualSample"], message: "Muestra manual: todo nulo o todo relleno" });
    }
    if ((record.reviewedBy === null) !== (record.reviewedOn === null)) {
      ctx.addIssue({ code: "custom", path: ["reviewedOn"], message: "Revisión: los dos nulos o los dos rellenos" });
    }
  });
export type BatchRecord = z.infer<typeof batchRecordSchema>;

/* ------------------------------------------------------------------------ */
/* Visibilidad y atribución                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Qué ven las academias (ADR-0029 §1.6): solo elementos revisados, de una
 * edición publicada y sin retirar. Los borradores, solo la revisión interna.
 */
export function isElementVisibleToAcademies(
  element: { reviewStatus: string; withdrawnAt: Date | string | null | undefined },
  edition: { status: string }
): boolean {
  return element.reviewStatus === "reviewed" && edition.status === "published" && !element.withdrawnAt;
}

/**
 * `2026-10-14` → `14-10-2026`. El texto se lee tal cual, sin pasar por Date.
 * Una fecha (`Date`) se lee en hora local: node-postgres devuelve un `date`
 * como medianoche local, y en UTC saldría el día anterior en Madrid.
 */
export function formatCoverDate(value: string | Date): string {
  if (typeof value === "string") {
    const [year, month, day] = value.slice(0, 10).split("-");
    return `${day}-${month}-${year}`;
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()}`;
}

/** Pie fijo de la biblioteca y de cada ficha (ADR-0029 §1.8). FIG solo en texto. */
export function elementAttributionText(edition: {
  title: string;
  coverDate: string | Date;
  documentUrl: string;
}): string {
  return (
    `Valores y grupos según el ${edition.title} de la FIG (World Gymnastics), ` +
    `edición publicada el ${formatCoverDate(edition.coverDate)}. ` +
    "Las descripciones las redacta Zaltyko y no son el texto oficial; si hay diferencias, " +
    `manda el documento oficial: ${edition.documentUrl}. ` +
    "Zaltyko no está afiliado a la FIG ni cuenta con su respaldo."
  );
}

/* ------------------------------------------------------------------------ */
/* Filtro del catálogo                                                       */
/* ------------------------------------------------------------------------ */

export type CatalogElementFilterable = {
  elementKey: string;
  name: string;
  shortName: string;
  apparatus: string;
  group: string;
  valueLetter?: string | null;
  /** Número o el texto de `numeric` («4.20»). */
  valuePoints?: number | string | null;
};

export type CatalogElementFilter = {
  apparatus?: string | null;
  group?: string | null;
  /** Letra («D», «d») o puntos («4.2», «4,20»). */
  value?: string | null;
  query?: string | null;
};

/** Minúsculas y sin acentos, para buscar «yurchenko» o «rondada» como se escriba. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchesValue(element: CatalogElementFilterable, rawValue: string): boolean {
  const value = rawValue.trim();
  if (value.length === 1 && VALUE_LETTERS.includes(value.toUpperCase())) {
    return element.valueLetter === value.toUpperCase();
  }
  const wanted = Number(value.replace(",", "."));
  if (value === "" || !Number.isFinite(wanted)) return false;
  if (element.valuePoints === null || element.valuePoints === undefined) return false;
  const points = Number(element.valuePoints);
  return Number.isFinite(points) && Math.round(points * 100) === Math.round(wanted * 100);
}

/** Filtra en memoria conservando el orden recibido. Los filtros vacíos no cuentan. */
export function filterCatalogElements<T extends CatalogElementFilterable>(
  elements: readonly T[],
  filter: CatalogElementFilter
): T[] {
  const query = filter.query ? normalizeSearchText(filter.query) : "";
  const value = filter.value?.trim() ?? "";
  return elements.filter((element) => {
    if (filter.apparatus && element.apparatus !== filter.apparatus) return false;
    if (filter.group && element.group !== filter.group) return false;
    if (value && !matchesValue(element, value)) return false;
    if (
      query &&
      ![element.name, element.shortName, element.elementKey].some((text) => normalizeSearchText(text).includes(query))
    ) {
      return false;
    }
    return true;
  });
}
