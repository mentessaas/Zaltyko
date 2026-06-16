"use client";

import { FormEvent } from "react";
import Link from "next/link";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { LimitIndicator } from "@/components/onboarding/LimitIndicator";
import { StepPreview } from "@/components/onboarding/StepPreview";
import { COUNTRY_REGION_OPTIONS, findRegionsByCountry, getRegionLabel, getRegionPlaceholder, getCityPlaceholder } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { ACADEMY_TYPES } from "@/lib/onboardingCopy";
import { ArrowRight, Lock, CheckCircle2, TrendingUp, Clock } from "lucide-react";

interface AcademyStepProps {
  academyName: string;
  selectedCountry: string;
  selectedRegion: string;
  selectedCity: string;
  academyType: string;
  loading: boolean;
  fieldErrors: Record<string, string>;
  userHasAcademies: boolean;
  existingAcademies: Array<{ id: string; name: string | null }>;
  userPlanInfo: {
    planCode: "free" | "pro" | "premium";
    academyLimit: number | null;
    currentAcademyCount: number;
    canCreateMore: boolean;
    upgradeTo?: "pro" | "premium";
  } | null;
  effectiveUserId: string | null;
  onAcademyNameChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onAcademyTypeChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onGoBack: () => void;
  onContinueWithExisting: (academyId: string) => void;
  stepNumber: number;
  sectionTitle: string;
  sectionDescription: string;
  timeEstimate: number;
}

export function AcademyStep({
  academyName,
  selectedCountry,
  selectedRegion,
  selectedCity,
  academyType,
  loading,
  fieldErrors,
  userHasAcademies,
  existingAcademies,
  userPlanInfo,
  effectiveUserId,
  onAcademyNameChange,
  onCountryChange,
  onRegionChange,
  onCityChange,
  onAcademyTypeChange,
  onSubmit,
  onGoBack,
  onContinueWithExisting,
  stepNumber,
  sectionTitle,
  sectionDescription,
  timeEstimate,
}: AcademyStepProps) {
  const regionOptions = selectedCountry
    ? findRegionsByCountry(selectedCountry).map((r) => ({ value: r.value, label: r.label }))
    : [];

  const cityOptions = selectedRegion
    ? findCitiesByRegion(selectedCountry, selectedRegion).map((c) => ({ value: c.value, label: c.label }))
    : [];

  // Si tiene academia y alcanzó el límite de su plan
  if (userHasAcademies && existingAcademies.length > 0 && userPlanInfo && !userPlanInfo.canCreateMore) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Límite de academias alcanzado</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Tu plan <span className="font-semibold text-foreground uppercase">{userPlanInfo.planCode}</span> permite crear hasta{" "}
                <span className="font-semibold text-foreground">
                  {userPlanInfo.academyLimit === null ? "ilimitadas" : userPlanInfo.academyLimit}
                </span>{" "}
                academia{userPlanInfo.academyLimit === 1 ? "" : "s"}.
              </p>
              <p className="text-sm text-muted-foreground">
                Actualmente tienes <span className="font-semibold text-foreground">{userPlanInfo.currentAcademyCount}</span> academia
                {userPlanInfo.currentAcademyCount !== 1 ? "s" : ""}:{" "}
                <span className="font-medium text-foreground">{existingAcademies[0].name || "Sin nombre"}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (existingAcademies.length > 0) {
                    onContinueWithExisting(existingAcademies[0].id);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-muted"
              >
                Continuar con mi academia actual
                <ArrowRight className="h-4 w-4" />
              </button>
              {userPlanInfo.upgradeTo && (
                <Link
                  href="/billing"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                >
                  <TrendingUp className="h-4 w-4" />
                  Actualizar a {userPlanInfo.upgradeTo.toUpperCase()}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si tiene academia pero puede continuar
  if (userHasAcademies && existingAcademies.length > 0) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/40 bg-primary/5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="font-semibold text-foreground mb-1">Ya tienes una academia creada</h3>
              <p className="text-sm text-muted-foreground">
                Academia: <span className="font-semibold text-foreground">{existingAcademies[0].name || "Sin nombre"}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (existingAcademies.length > 0) {
                  onContinueWithExisting(existingAcademies[0].id);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Ir al siguiente paso
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Formulario de creación de academia
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Paso {stepNumber}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>~{timeEstimate} min</span>
          </div>
        </div>
        <h2 className="text-xl font-semibold">{sectionTitle}</h2>
        <p className="text-sm text-muted-foreground">{sectionDescription}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Nombre de la academia</label>
        <input
          name="name"
          value={academyName}
          onChange={(e) => onAcademyNameChange(e.target.value)}
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {fieldErrors.name && (
          <p className="text-xs text-destructive">{fieldErrors.name}</p>
        )}
      </div>
      {(academyName || selectedCountry || selectedRegion || selectedCity || academyType) && (
        <StepPreview
          step={2}
          data={{
            name: academyName,
            academyType,
            country: selectedCountry ? COUNTRY_REGION_OPTIONS.find(c => c.value === selectedCountry)?.label : undefined,
            region: selectedRegion ? findRegionsByCountry(selectedCountry).find(r => r.value === selectedRegion)?.label : undefined,
            city: selectedCity ? findCitiesByRegion(selectedCountry, selectedRegion).find(c => c.value === selectedCity)?.label : undefined,
          }}
        />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">País</label>
          <SearchableSelect
            options={COUNTRY_REGION_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
            value={selectedCountry}
            onChange={(value) => {
              onCountryChange(value);
              onRegionChange("");
              onCityChange("");
            }}
            placeholder="Selecciona un país"
            required
            name="country"
            searchPlaceholder="Buscar país..."
          />
          {fieldErrors.country && (
            <p className="text-xs text-destructive">{fieldErrors.country}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{getRegionLabel(selectedCountry)}</label>
          <SearchableSelect
            options={regionOptions}
            value={selectedRegion}
            onChange={(value) => {
              onRegionChange(value);
              onCityChange("");
            }}
            placeholder={getRegionPlaceholder(selectedCountry, !!selectedCountry)}
            disabled={!selectedCountry || regionOptions.length === 0}
            required={regionOptions.length > 0}
            name="region"
            searchPlaceholder={`Buscar ${getRegionLabel(selectedCountry).toLowerCase()}...`}
          />
          {fieldErrors.region && (
            <p className="text-xs text-destructive">{fieldErrors.region}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Ciudad</label>
          <SearchableSelect
            options={cityOptions}
            value={selectedCity}
            onChange={onCityChange}
            placeholder={getCityPlaceholder(getRegionLabel(selectedCountry), !!selectedRegion)}
            disabled={!selectedRegion || cityOptions.length === 0}
            required={cityOptions.length > 0}
            name="city"
            searchPlaceholder="Buscar ciudad..."
          />
          {fieldErrors.city && (
            <p className="text-xs text-destructive">{fieldErrors.city}</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tipo de academia</label>
        <select
          name="academyType"
          value={academyType}
          onChange={(event) => onAcademyTypeChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {ACADEMY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Personaliza la experiencia según la disciplina principal de tu academia.
        </p>
      </div>
      {effectiveUserId && (
        <LimitIndicator academyId={null} resource="academies" className="mt-2" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onGoBack}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Volver
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          Guardar y continuar
        </button>
      </div>
    </form>
  );
}

