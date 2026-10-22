/**
 * Helpers puros para render de plantillas transaccionales del onboarding.
 *
 * Gap 4 (ZAL-324): `owner_locale` no esta modelado en `profiles`. v0.2 cae a
 * `es` por defecto literal en el template sin tocar el schema. v0.3+
 * abrira issue separada para multi-locale (coordinacion Engineering Lead
 * + Platform & Security si toca RLS).
 *
 * Owner: Web Developer (ZAL-324 Gap 4).
 */

export type SupportedLocale = "es" | "en";

export const DEFAULT_LOCALE: SupportedLocale = "es";
export const SUPPORTED_LOCALES: ReadonlyArray<SupportedLocale> = ["es", "en"];

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  if (!value) return false;
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value);
}

/**
 * Resuelve el locale de un owner con fallthrough explicito.
 *
 * Orden de prioridad:
 *   1. Argumento `profileLocale` (si viene del caller y es valido).
 *   2. Variable de entorno `OWNER_DEFAULT_LOCALE` (override de plataforma).
 *   3. `DEFAULT_LOCALE` literal = "es".
 *
 * @param profileLocale  valor de `profiles.locale` (v0.3+); hoy siempre null/undefined
 * @returns locale canonico soportado
 */
export function resolveOwnerLocale(
  profileLocale: string | null | undefined
): SupportedLocale {
  if (isSupportedLocale(profileLocale)) {
    return profileLocale;
  }
  // Lectura directa: OWNER_DEFAULT_LOCALE es override opcional fuera del
  // schema de env.ts; no rompe el contrato porque siempre cae a DEFAULT_LOCALE.
  const envFallback = process.env.OWNER_DEFAULT_LOCALE;
  if (isSupportedLocale(envFallback)) {
    return envFallback;
  }
  return DEFAULT_LOCALE;
}

/**
 * Selector de strings para una plantilla segun locale. El caller pasa un
 * mapa `Record<SupportedLocale, string>` y obtiene el string del locale
 * resuelto. Si la plantilla no traduce un locale, cae a `DEFAULT_LOCALE`
 * explicitamente (no a "el primero que exista") para que el fallback sea
 * trazable.
 *
 * Ejemplo de uso en una plantilla:
 *   const subject = pickLocalized({
 *     es: "Bienvenido a Zaltyko",
 *     en: "Welcome to Zaltyko",
 *   }, resolveOwnerLocale(owner.profileLocale));
 */
export function pickLocalized<T>(
  strings: Partial<Record<SupportedLocale, T>>,
  locale: SupportedLocale
): T {
  // `in` distingue "clave presente con valor null/undefined" (fallback) de
  // "clave ausente" (fallback). El caller puede pasar null como senal
  // explicita de "no traducir a este locale".
  if (locale in strings && strings[locale] !== undefined && strings[locale] !== null) {
    return strings[locale] as T;
  }
  const fallback = strings[DEFAULT_LOCALE];
  if (fallback === undefined || fallback === null) {
    throw new Error(
      `pickLocalized: DEFAULT_LOCALE ('${DEFAULT_LOCALE}') debe tener valor definido; ` +
        `locale pedido='${locale}', keys disponibles=${Object.keys(strings).join(",")}`
    );
  }
  return fallback;
}
