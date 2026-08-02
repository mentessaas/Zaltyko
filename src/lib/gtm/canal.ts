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
 * `direct` cuando no hay UTMs o el source no matchea la taxonomía y el
 * medium tampoco. `unknown` cuando hay datos parciales (UTM presente
 * pero no normalizable) — distinto de `direct` para que Bumble/Data pueda
 * filtrar la causa.
 */

export type CanalRegistro = "paid" | "social" | "email" | "organic" | "direct" | "unknown";

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

  // 1) paid — sources específicas de ads.
  if (source && PAID_SOURCES.has(source)) {
    return "paid";
  }
  // 2) social — incluye whatsapp explícitamente (no es direct).
  if (source && SOCIAL_SOURCES.has(source)) {
    return "social";
  }
  // 3) email.
  if (source && EMAIL_SOURCES.has(source)) {
    return "email";
  }
  // 4) organic.
  if (source && ORGANIC_SOURCES.has(source)) {
    return "organic";
  }

  // 5) `google` alias: el medium determina el canal. Sin medium
  // informativo, default conservador a `paid` (la mayoría de landings con
  // utm_source=google vienen de Search Ads).
  if (source === "google") {
    if (!medium) return "paid";
    if (medium === "cpc" || medium === "ppc" || medium === "paid") return "paid";
    if (medium === "organic") return "organic";
    if (medium === "email") return "email";
    if (medium === "social") return "social";
    return "unknown";
  }

  // 6) Medium informativo gana sobre un source desconocido o ausente
  // (cubre `utm_medium=cpc` sin source, `spam_site + cpc`, etc. — un medium
  // claro siempre es mejor que un source basura).
  if (medium) {
    if (medium === "cpc" || medium === "ppc" || medium === "paid") return "paid";
    if (medium === "social") return "social";
    if (medium === "email") return "email";
    if (medium === "organic") return "organic";
    return "unknown";
  }

  // 7) Source presente pero desconocido y medium ausente: no podemos
  // atribuir, queda como `unknown` para que Bumble filtre vs `direct`.
  return "unknown";
}

export const CANAL_LABELS: Record<CanalRegistro, string> = {
  paid: "Paid",
  social: "Social",
  email: "Email",
  organic: "Organic",
  direct: "Direct",
  unknown: "Unknown",
};