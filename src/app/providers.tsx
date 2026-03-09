"use client";

import type { ReactNode } from "react";

import { DevSessionProvider } from "@/components/dev-session-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <DevSessionProvider>{children}</DevSessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

