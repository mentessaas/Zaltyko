"use client";

import type { ReactNode } from "react";

import { DevSessionProvider } from "@/components/dev-session-provider";
import { ToastProvider } from "@/components/ui/toast-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DevSessionProvider>{children}</DevSessionProvider>
    </ToastProvider>
  );
}

