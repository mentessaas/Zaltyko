"use client";

import { createContext, useContext } from "react";
import type { AcademySpecializationContext } from "@/lib/specialization/registry";

export interface AcademyContextValue {
  academyId: string;
  academyName: string;
  academyType: string | null;
  academyCountry: string | null;
  tenantId: string | null;
  profileId: string;
  profileName: string | null;
  profileRole: string;
  membershipRole: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isSuperAdmin: boolean;
  planCode: string;
  planNickname: string | null;
  canCreateAcademies: boolean;
  academyCount: number;
  planLimitLabel: string;
  tenantAcademies: { id: string; name: string | null }[];
  specialization: AcademySpecializationContext;
}

export const AcademyContext = createContext<AcademyContextValue | undefined>(undefined);

export function AcademyProvider({
  value,
  children,
}: {
  value: AcademyContextValue;
  children: React.ReactNode;
}) {
  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademyContext() {
  const context = useContext(AcademyContext);

  if (!context) {
    throw new Error("useAcademyContext debe usarse dentro de un AcademyProvider.");
  }

  return context;
}

