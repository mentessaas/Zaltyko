import { cookies, headers } from 'next/headers';
import { Locale, defaultLocale, detectLocale, getTranslation, getAllTranslations, flattenTranslations } from '@/i18n';

const LOCALE_COOKIE_NAME = 'zaltyko-locale';

export async function getLocaleFromRequest(): Promise<Locale> {
  // 1. Check cookie first
  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

    if (cookieLocale === 'es' || cookieLocale === 'en') {
      return cookieLocale;
    }
  } catch {
    // Cookies not available
  }

  // 2. Check Accept-Language header
  try {
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');

    if (acceptLanguage) {
      const detected = detectLocale(acceptLanguage);
      if (detected) return detected;
    }
  } catch {
    // Headers not available
  }

  return defaultLocale;
}

export function setLocaleCookie(locale: Locale) {
  // This function is meant to be called from server actions or API routes
  // to set the cookie. The actual cookie setting happens on the client side.
  return { success: true, locale };
}

// Server-side translation function
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  return getTranslation(locale, key, params);
}

// Get all translations for server rendering
export function getServerTranslations(locale: Locale) {
  const translations = getAllTranslations(locale);
  const flatTranslations = flattenTranslations(translations as Record<string, unknown>);

  return {
    locale,
    translations: flatTranslations,
    t: (key: string, params?: Record<string, string | number>) =>
      getTranslation(locale, key, params),
  };
}

// Re-export for convenience
export { getTranslation, getAllTranslations, flattenTranslations };
export { defaultLocale, type Locale };
