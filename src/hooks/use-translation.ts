'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Locale,
  defaultLocale,
  getTranslation,
  getAllTranslations,
  flattenTranslations,
  detectLocale,
} from '@/i18n';

const LOCALE_STORAGE_KEY = 'zaltyko-locale';

function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'es' || stored === 'en') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return null;
}

function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage not available
  }
}

function getInitialLocale(): Locale {
  // First check localStorage
  const stored = getStoredLocale();
  if (stored) return stored;

  // Then check browser language
  if (typeof window !== 'undefined') {
    const browserLocale = detectLocale(navigator.language);
    if (browserLocale) return browserLocale;
  }

  return defaultLocale;
}

export function useTranslation(localeProp?: Locale) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (localeProp) return localeProp;
    return getInitialLocale();
  });

  // Sync with prop changes
  useEffect(() => {
    if (localeProp && localeProp !== locale) {
      setLocaleState(localeProp);
      setStoredLocale(localeProp);
    }
  }, [localeProp, locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setStoredLocale(newLocale);
  }, []);

  const translations = useMemo(() => getAllTranslations(locale), [locale]);

  const flatTranslations = useMemo(
    () => flattenTranslations(translations as Record<string, unknown>),
    [translations]
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return getTranslation(locale, key, params);
    },
    [locale]
  );

  // Helper to check if a translation key exists
  const hasKey = useCallback(
    (key: string): boolean => {
      return key in flatTranslations;
    },
    [flatTranslations]
  );

  // Get nested translation with fallback
  const getNestedValue = useCallback(
    (section: string, subsection?: string): Record<string, string> => {
      const sectionData = translations[section];
      if (!sectionData || typeof sectionData !== 'object') {
        return {};
      }

      if (subsection) {
        const subsectionData = (sectionData as Record<string, unknown>)[subsection];
        if (
          typeof subsectionData === 'object' &&
          subsectionData !== null &&
          !Array.isArray(subsectionData)
        ) {
          return subsectionData as Record<string, string>;
        }
        return {};
      }

      // Flatten the section
      return flattenTranslations(sectionData as Record<string, unknown>);
    },
    [translations]
  );

  return {
    locale,
    setLocale,
    t,
    hasKey,
    getNestedValue,
    translations: flatTranslations,
    isSpanish: locale === 'es',
    isEnglish: locale === 'en',
  };
}

// Hook to get translations for server components
export function getServerTranslations(locale: Locale) {
  const translations = getAllTranslations(locale);
  const flatTranslations = flattenTranslations(translations as Record<string, unknown>);

  const t = (key: string, params?: Record<string, string | number>): string => {
    return getTranslation(locale, key, params);
  };

  return {
    locale,
    t,
    translations: flatTranslations,
  };
}

export default useTranslation;
