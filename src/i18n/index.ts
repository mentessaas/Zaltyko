import esTranslations from './es.json';
import enTranslations from './en.json';

export type Locale = 'es' | 'en';

export const defaultLocale: Locale = 'es';

export const locales: Locale[] = ['es', 'en'];

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

export const localeFlags: Record<Locale, string> = {
  es: '🇪🇸',
  en: '🇺🇸',
};

type TranslationValue = string | Record<string, unknown>;

type Translations = {
  [key: string]: TranslationValue;
};

const translations: Record<Locale, Translations> = {
  es: esTranslations,
  en: enTranslations,
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations[defaultLocale];
}

export function getTranslation(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const keys = key.split('.');
  let value: unknown = translations[locale] || translations[defaultLocale];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      // Fallback to default locale
      value = translations[defaultLocale];
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object' && fallbackKey in value) {
          value = (value as Record<string, unknown>)[fallbackKey];
        } else {
          return key; // Return key if not found
        }
      }
      break;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Interpolate parameters
  if (params) {
    return Object.entries(params).reduce(
      (str, [paramKey, paramValue]) =>
        str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue)),
      value
    );
  }

  return value;
}

export function detectLocale(browserLocale?: string): Locale {
  if (!browserLocale) return defaultLocale;

  const normalizedLocale = browserLocale.toLowerCase().split('-')[0];

  if (normalizedLocale === 'en') return 'en';
  if (normalizedLocale === 'es') return 'es';

  return defaultLocale;
}

// Get all translations as a flat object for nested key access
export function getAllTranslations(locale: Locale): Translations {
  return translations[locale] || translations[defaultLocale];
}

// Utility to flatten nested objects for easier access
export function flattenTranslations(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  return Object.keys(obj).reduce(
    (acc: Record<string, string>, key) => {
      const pre = prefix.length ? `${prefix}.` : '';
      const value = obj[key];

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(
          acc,
          flattenTranslations(value as Record<string, unknown>, `${pre}${key}`)
        );
      } else {
        acc[`${pre}${key}`] = String(value);
      }

      return acc;
    },
    {}
  );
}

export default translations;
