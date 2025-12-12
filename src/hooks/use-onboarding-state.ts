import { useState, useCallback, useEffect } from "react";

import type { StepKey } from "@/types/onboarding";

const STORAGE_KEY = "gymna_onboarding_state";

interface OnboardingState {
  step: StepKey;
  academyId: string | null;
  tenantId: string | null;
  academyType: string;
  selectedCountry: string;
  selectedRegion: string;
  selectedCity: string;
  fullName: string;
  email: string;
}

/**
 * Hook para manejar el estado del onboarding con persistencia
 */
export function useOnboardingState() {
  const [step, setStep] = useState<StepKey>(1);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [academyType, setAcademyType] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [maxStep, setMaxStep] = useState<StepKey>(1);

  // Cargar estado persistido
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<OnboardingState>;
        if (parsed.step) setStep(parsed.step);
        if (parsed.academyId) setAcademyId(parsed.academyId);
        if (parsed.tenantId) setTenantId(parsed.tenantId);
        if (parsed.academyType) setAcademyType(parsed.academyType);
        if (parsed.selectedCountry) setSelectedCountry(parsed.selectedCountry);
        if (parsed.selectedRegion) setSelectedRegion(parsed.selectedRegion);
        if (parsed.selectedCity) setSelectedCity(parsed.selectedCity);
        if (parsed.fullName) setFullName(parsed.fullName);
        if (parsed.email) setEmail(parsed.email);
      }
    } catch {
      // ignore
    }
  }, []);

  // Guardar estado
  const saveState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const state: Partial<OnboardingState> = {
        step,
        academyId,
        tenantId,
        academyType,
        selectedCountry,
        selectedRegion,
        selectedCity,
        fullName,
        email,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [step, academyId, tenantId, academyType, selectedCountry, selectedRegion, selectedCity, fullName, email]);

  useEffect(() => {
    saveState();
  }, [saveState]);

  const updateStep = useCallback((newStep: StepKey) => {
    setStep(newStep);
    setMaxStep((prev) => (prev < newStep ? newStep : prev));
  }, []);

  return {
    step,
    setStep: updateStep,
    maxStep,
    setMaxStep,
    academyId,
    setAcademyId,
    tenantId,
    setTenantId,
    academyType,
    setAcademyType,
    selectedCountry,
    setSelectedCountry,
    selectedRegion,
    setSelectedRegion,
    selectedCity,
    setSelectedCity,
    fullName,
    setFullName,
    email,
    setEmail,
  };
}

