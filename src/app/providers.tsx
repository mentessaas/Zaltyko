"use client";

import type { ReactNode } from "react";
<<<<<<< HEAD
import { ThemeProvider } from "next-themes";
=======
>>>>>>> origin/main

import { DevSessionProvider } from "@/components/dev-session-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
<<<<<<< HEAD
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light", "dark"]}
      disableTransitionOnChange
    >
      <I18nProvider>
        <ToastProvider>
          <DevSessionProvider>{children}</DevSessionProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
=======
    <I18nProvider>
      <ToastProvider>
        <DevSessionProvider>{children}</DevSessionProvider>
      </ToastProvider>
    </I18nProvider>
>>>>>>> origin/main
  );
}

