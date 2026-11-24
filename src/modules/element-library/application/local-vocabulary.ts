import { sql } from "drizzle-orm";

import type { DatabaseClient } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import mexicoVocabulary from "@/modules/element-library/data/vocabulario/mx.json";
import {
  isLocalVocabularyFlagOn,
  localVocabularyFileSchema,
  reviewedVocabulary,
  type LocalVocabulary,
} from "@/modules/element-library/domain/local-vocabulary";

/**
 * Vocabulario de sala del país de la academia (ADR-0030). Uso interno: lo
 * llaman la búsqueda y la ficha dentro de su transacción ya autorizada.
 *
 * Cada país tiene su archivo revisado; ninguno hereda el de otro. España no
 * tiene archivo porque los textos del catálogo ya están en su vocabulario.
 */
const VOCABULARY_FILES: Readonly<Record<string, unknown>> = {
  MX: mexicoVocabulary,
};

const parsed = new Map<string, LocalVocabulary | null>();

/** Solo entradas revisadas. Un archivo que no pasa el esquema no se usa. */
export function localVocabularyForCountry(
  countryCode: string
): LocalVocabulary | null {
  if (parsed.has(countryCode)) return parsed.get(countryCode) ?? null;
  const raw = VOCABULARY_FILES[countryCode];
  let vocabulary: LocalVocabulary | null = null;
  if (raw !== undefined) {
    const result = localVocabularyFileSchema.safeParse(raw);
    if (result.success && result.data.country !== countryCode) {
      logger.error(`data/vocabulario/${countryCode.toLowerCase()}.json es de otro país: no se usa`);
    } else if (result.success) {
      vocabulary = reviewedVocabulary(result.data);
    } else {
      logger.error(
        `data/vocabulario/${countryCode.toLowerCase()}.json no pasa el esquema: no se usa`,
        result.error
      );
    }
  }
  parsed.set(countryCode, vocabulary);
  return vocabulary;
}

/**
 * Vocabulario de la academia, o null con la bandera apagada, sin país con
 * archivo o sin entradas revisadas. El país sale de la propia academia.
 */
export async function loadAcademyVocabulary(
  client: DatabaseClient,
  organizationId: string
): Promise<LocalVocabulary | null> {
  if (!isLocalVocabularyFlagOn()) return null;
  // Sin ningún país con entradas revisadas, no hace falta preguntar el país.
  const anyReviewed = Object.keys(VOCABULARY_FILES).some(
    (country) => (localVocabularyForCountry(country)?.entries.length ?? 0) > 0
  );
  if (!anyReviewed) return null;
  const result = await client.execute(sql`
    select country_code from zaltyko.organizations where id = ${organizationId}::uuid limit 1
  `);
  const countryCode = (result.rows[0] as { country_code: string } | undefined)
    ?.country_code;
  if (!countryCode) return null;
  const vocabulary = localVocabularyForCountry(countryCode);
  return vocabulary && vocabulary.entries.length > 0 ? vocabulary : null;
}
