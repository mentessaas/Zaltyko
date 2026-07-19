'use client';

import { useI18n } from '@/components/providers/i18n-provider';

/**
 * Hook to access the i18n context
 * Use this in client components that are inside the I18nProvider
 */
export function useI18nContext() {
  return useI18n();
}

export default useI18nContext;
