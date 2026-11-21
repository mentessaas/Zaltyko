import { z } from "zod";

import { normalizeSearchText } from "@/modules/element-library/domain/element-library";

/**
 * Vocabulario de sala por país (ADR-0030). Dominio puro: bandera, esquema de
 * los archivos `data/vocabulario/<país>.json`, coincidencias en el texto de
 * una ficha y búsqueda con las palabras del país. Los textos del catálogo
 * están en vocabulario de España (RFEG) y nunca se reescriben: esto solo
 * enseña qué palabras de la ficha se dicen distinto y deja buscar con ellas.
 */

/** Apagada por defecto. Solo actúa con la biblioteca encendida. */
export const LOCAL_VOCABULARY_ENV_FLAG =
  "ZALTYKO_ELEMENT_LIBRARY_LOCAL_VOCABULARY_ENABLED";

type EnvLike = Readonly<Record<string, string | undefined>>;

export function isLocalVocabularyFlagOn(env: EnvLike = process.env): boolean {
  return env[LOCAL_VOCABULARY_ENV_FLAG] === "true";
}

export const LOCAL_TERM_ES_MAX = 60;
export const LOCAL_TERM_LOCAL_MAX = 80;
export const LOCAL_TERM_NOTE_MAX = 140;
export const LOCAL_TERM_SOURCE_MAX = 80;
/** Tope de variantes de una búsqueda: una consulta corta no necesita más. */
export const LOCAL_SEARCH_VARIANTS_MAX = 20;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

function cleanText(min: number, max: number) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine((value) => !CONTROL_CHARS.test(value), "Sin caracteres de control")
    .refine(
      (value) => value === value.trim(),
      "Sin espacios al principio ni al final"
    );
}

/** Además, sin tildes sigue teniendo texto: una forma vacía casaría en todas partes. */
function searchableText(min: number, max: number) {
  return cleanText(min, max).refine((value) => normalizeSearchText(value).length > 0, "Sin texto que buscar");
}

const localTermSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    /** Formas tal como salen en los textos del catálogo (plurales aparte). */
    es: z.array(searchableText(2, LOCAL_TERM_ES_MAX)).min(1).max(8),
    /** Cómo se dice en el país; la primera es la principal. */
    local: z.array(searchableText(1, LOCAL_TERM_LOCAL_MAX)).min(1).max(4),
    note: cleanText(1, LOCAL_TERM_NOTE_MAX).optional(),
    confidence: z.enum(["alta", "media"]),
    source: cleanText(2, LOCAL_TERM_SOURCE_MAX),
    reviewStatus: z.enum(["draft", "reviewed"]),
  })
  .strict();

export type LocalTerm = z.infer<typeof localTermSchema>;

export const localVocabularyFileSchema = z
  .object({
    aviso: cleanText(10, 600),
    country: z.string().regex(/^[A-Z]{2}$/),
    countryName: cleanText(2, 60),
    entries: z.array(localTermSchema).max(500),
  })
  .strict()
  .superRefine((file, ctx) => {
    const keys = new Set<string>();
    const forms = new Map<string, string>();
    file.entries.forEach((entry, index) => {
      if (keys.has(entry.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "key"],
          message: `Clave repetida: ${entry.key}`,
        });
      }
      keys.add(entry.key);
      for (const form of entry.es) {
        const normalized = normalizeSearchText(form);
        const owner = forms.get(normalized);
        if (owner !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "es"],
            message: `La forma «${form}» ya está en ${owner}`,
          });
        }
        forms.set(normalized, entry.key);
      }
    });
  });

export type LocalVocabularyFile = z.infer<typeof localVocabularyFileSchema>;

/** Un archivo listo para usar: solo las entradas revisadas. */
export type LocalVocabulary = {
  country: string;
  countryName: string;
  entries: readonly LocalTerm[];
};

export function reviewedVocabulary(file: LocalVocabularyFile): LocalVocabulary {
  return {
    country: file.country,
    countryName: file.countryName,
    entries: file.entries.filter((entry) => entry.reviewStatus === "reviewed"),
  };
}

/* ------------------------------------------------------------------------ */
/* Coincidencias en la ficha                                                 */
/* ------------------------------------------------------------------------ */

/** Un par que la ficha enseña: la palabra de España y cómo se dice allí. */
export type LocalTermMatch = {
  key: string;
  es: string;
  local: string[];
  note: string | null;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Palabra completa: ni letra ni número pegados a los lados. */
function wholePhrase(normalized: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(normalized)}(?![\\p{L}\\p{N}])`,
    "gu"
  );
}

type Form = { entry: LocalTerm; normalized: string };

function formsLongestFirst(entries: readonly LocalTerm[]): Form[] {
  return entries
    .flatMap((entry) =>
      entry.es.map((form) => ({ entry, normalized: normalizeSearchText(form) }))
    )
    .sort((left, right) => right.normalized.length - left.normalized.length);
}

/** Si en el país se dice igual, no hace falta enseñarlo. */
function saysTheSame(entry: LocalTerm, normalizedForm: string): boolean {
  return entry.local.some(
    (local) => normalizeSearchText(local) === normalizedForm
  );
}

/**
 * Pares de los textos de una ficha, en el orden en que aparecen y una vez por
 * entrada. Sin mayúsculas ni acentos, por palabra completa, la forma más larga
 * primero y sin solaparse: «paloma sin manos» gana a «paloma» y lo que ya casó
 * no vuelve a casar. Una forma que se dice igual en el país ocupa su sitio pero
 * no sale («molino adelante» tapa a «molino»).
 */
export function findLocalTerms(
  texts: readonly (string | null | undefined)[],
  vocabulary: LocalVocabulary
): LocalTermMatch[] {
  if (vocabulary.entries.length === 0) return [];
  const forms = formsLongestFirst(vocabulary.entries);
  const found: { position: number; entry: LocalTerm; show: boolean }[] = [];
  let offset = 0;
  for (const text of texts) {
    if (!text) continue;
    // Las posiciones son siempre del texto normalizado: quitar las tildes
    // cambia la longitud del original.
    const normalized = normalizeSearchText(text);
    const taken = new Array<boolean>(normalized.length).fill(false);
    for (const form of forms) {
      for (const match of normalized.matchAll(wholePhrase(form.normalized))) {
        const start = match.index;
        const end = start + match[0].length;
        if (taken.slice(start, end).some(Boolean)) continue;
        taken.fill(true, start, end);
        found.push({
          position: offset + start,
          entry: form.entry,
          show: !saysTheSame(form.entry, form.normalized),
        });
      }
    }
    offset += normalized.length + 1;
  }
  const seen = new Set<string>();
  const matches: LocalTermMatch[] = [];
  for (const item of found.sort(
    (left, right) => left.position - right.position
  )) {
    if (!item.show || seen.has(item.entry.key)) continue;
    seen.add(item.entry.key);
    matches.push({
      key: item.entry.key,
      es: item.entry.es[0],
      local: [...item.entry.local],
      note: item.entry.note ?? null,
    });
  }
  return matches;
}

/* ------------------------------------------------------------------------ */
/* Búsqueda con palabras del país                                            */
/* ------------------------------------------------------------------------ */

/**
 * Variantes de una búsqueda, normalizadas: la consulta tal cual y, por cada
 * palabra del país que contenga, la misma consulta con cada forma de España
 * («redondilla con giro» → «rondada con giro», «redondilla con pirueta»…).
 * Solo añade: la consulta original siempre va primera.
 */
export function expandLocalSearchQuery(
  query: string,
  vocabulary: LocalVocabulary | null
): string[] {
  const original = normalizeSearchText(query);
  const variants = [original];
  if (!original || !vocabulary || vocabulary.entries.length === 0)
    return variants;
  const replacements = vocabulary.entries.flatMap((entry) =>
    entry.local
      .map((local) => normalizeSearchText(local))
      .map((local) => ({
        local,
        es: entry.es.map((form) => normalizeSearchText(form)),
      }))
  );
  // Las palabras más largas primero: «medio giro» antes que «giro».
  replacements.sort((left, right) => right.local.length - left.local.length);
  for (
    let index = 0;
    index < variants.length && variants.length < LOCAL_SEARCH_VARIANTS_MAX;
    index += 1
  ) {
    const current = variants[index];
    // Una palabra dentro de otra más larga que ya casó no se cambia aparte:
    // «rebote» dentro de «rebote de manos a cambio de toma».
    const matchedLocals: string[] = [];
    for (const replacement of replacements) {
      const pattern = wholePhrase(replacement.local);
      if (!pattern.test(current)) continue;
      if (matchedLocals.some((longer) => longer !== replacement.local && wholePhrase(replacement.local).test(longer))) {
        continue;
      }
      matchedLocals.push(replacement.local);
      for (const form of replacement.es) {
        const variant = current.replace(wholePhrase(replacement.local), form);
        if (!variants.includes(variant)) variants.push(variant);
        if (variants.length >= LOCAL_SEARCH_VARIANTS_MAX) return variants;
      }
    }
  }
  return variants;
}
