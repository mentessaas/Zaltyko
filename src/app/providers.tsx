"use client";

import type { ReactNode } from "react";

import { DevSessionProvider } from "@/components/dev-session-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <DevSessionProvider>{children}</DevSessionProvider>;
}

