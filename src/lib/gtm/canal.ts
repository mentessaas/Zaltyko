/**
 * ZAL-159 [GTM-DEP.3] — Resolución de canal de registro desde UTMs.
 *
 * Regla de precedencia (DATA_GOVERNANCE_TAXONOMY_GTM.md §4 reconciliada
 * con Hermin):
 *   paid > social > email > organic > direct
 *
 * Taxonomía utm_source → canal:
 *   google_ads, meta_ads, tiktok_ads           → paid
 *   instagram, tiktok, facebook, linkedin      → social
 *   whatsapp                                   → social (no direct)
 *   resend_email                               → email
 *   google_organic                             → organic
 *   google                                     → según utm_medium
 *
 * `direct` cuando no hay UTMs o cuando los valores presentes no pertenecen
 * a la taxonomía aceptada. El contrato deliberadamente solo expone cinco
 * canales para que un UTM inválido no cree un bucket paralelo.
 */

export type CanalRegistro = "paid" | "social" | "email" | "organic" | "direct";

export interface UtmLike {
  utm_source?: string | null;
  utm_medium?: string | null;
}

const PAID_SOURCES = new Set(["google_ads", "meta_ads", "tiktok_ads"]);
const SOCIAL_SOURCES = new Set([
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "whatsapp",
]);
const EMAIL_SOURCES = new Set(["resend_email"]);
const ORGANIC_SOURCES = new Set(["google_organic"]);

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCanal(utm: UtmLike | null | undefined): CanalRegistro {
  const source = normalize(utm?.utm_source ?? null);
  const medium = normalize(utm?.utm_medium ?? null);
  return resolveFromNormalized(source, medium);
}

/**
 * Alias posicional canónico usado por el issue ZAL-159 y por los tests
 * previos a la forma con objeto. `derivar_canal(utm_source, utm_medium)` es
 * la firma exacta del spec y es la que expone la migración SQL/trigger en
 * PL/pgSQL (ver `drizzle/0008_academies_canal_registro.sql`).
 */
export function derivar_canal(
  utmSource: string | null | undefined,
  utmMedium: string | null | undefined
): CanalRegistro {
  return resolveFromNormalized(
    normalize(utmSource ?? null),
    normalize(utmMedium ?? null)
  );
}

function resolveFromNormalized(
  source: string | null,
  medium: string | null
): CanalRegistro {
  if (!source && !medium) {
    return "direct";
  }

  // La evaluación sigue el orden contractual completo. El medium participa
  // en cada nivel de precedencia; por ejemplo, instagram+cpc es paid y
  // google_ads+email sigue siendo paid.
  if (medium === "cpc" || (source && PAID_SOURCES.has(source))) {
    return "paid";
  }
  if (medium === "social" || (source && SOCIAL_SOURCES.has(source))) {
    return "social";
  }
  if (medium === "email" || (source && EMAIL_SOURCES.has(source))) {
    return "email";
  }
  if (medium === "organic" || (source && ORGANIC_SOURCES.has(source))) {
    return "organic";
  }

  // `google` solo es un alias genérico: sin medium válido no permite inferir
  // paid ni organic. Cualquier combinación fuera de taxonomía cae a direct.
  return "direct";
}

export const CANAL_LABELS: Record<CanalRegistro, string> = {
  paid: "Paid",
  social: "Social",
  email: "Email",
  organic: "Organic",
  direct: "Direct",
};
