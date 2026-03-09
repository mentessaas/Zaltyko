'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTranslation, getServerTranslations } from '@/hooks/use-translation';
import { Locale, defaultLocale } from '@/i18n';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isSpanish: boolean;
  isEnglish: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  localeProp?: Locale;
}

export function I18nProvider({ children, localeProp }: I18nProviderProps) {
  const { locale, setLocale, t, isSpanish, isEnglish } = useTranslation(localeProp);

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        isSpanish,
        isEnglish,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

// Hook for server components - provides translations without client-side state
export function useServerI18n(locale: Locale = defaultLocale) {
  return getServerTranslations(locale);
}

export default I18nProvider;
