import { z } from "zod";

import {
  normalizeUtmLandingPath,
  normalizeUtmValue,
  type UtmKey,
} from "@/lib/gtm/utm";

/**
 * ZAL-157 [GTM-DEP.1] — schema canónico del payload UTM en los endpoints.
 *
 * El body es input externo: cualquier cliente puede postear
 * `utm_source: "  Google Ads (LATAM)  "` sin pasar por el capturador. Este
 * schema normaliza server-side con el MISMO normalizador que usa el cliente
 * (`normalizeUtmValue`), de forma que la DB nunca recibe el literal crudo.
 *
 * Contrato de salida: los cinco UTM más `utm_landing_path` siempre presentes
 * como `string | null`. Un valor que no deja nada tras normalizar (solo
 * símbolos, solo espacios, cadena vacía) se degrada a `null` en vez de
 * rechazar el request completo: perder un parámetro de atribución no debe
 * romper un signup.
 *
 * El cap de longitud sí rechaza (400): un valor de más de 500 caracteres no
 * es un UTM legítimo sino abuso del endpoint.
 */
const RAW_MAX_LENGTH = 500;
const RAW_LANDING_PATH_MAX_LENGTH = 2048;

const utmValue = z
  .string()
  .max(RAW_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => normalizeUtmValue(value));

const utmLandingPath = z
  .string()
  .max(RAW_LANDING_PATH_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => normalizeUtmLandingPath(value));

export const UtmPayloadSchema = z.object({
  utm_source: utmValue,
  utm_medium: utmValue,
  utm_campaign: utmValue,
  utm_term: utmValue,
  utm_content: utmValue,
  utm_landing_path: utmLandingPath,
});

export const OptionalUtmPayloadSchema = UtmPayloadSchema.nullable().optional();

export type NormalizedUtmPayload = Record<UtmKey, string | null> & {
  utm_landing_path: string | null;
};
