"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import {
  COUNTRY_REGION_OPTIONS,
  findRegionsByCountry,
  getCityPlaceholder,
  getRegionLabel,
  getRegionPlaceholder,
} from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";

const DISCIPLINE_OPTIONS = [
  { value: "artistic_female", label: "Gimnasia artistica femenina" },
  { value: "artistic_male", label: "Gimnasia artistica masculina" },
  { value: "rhythmic", label: "Gimnasia ritmica" },
] as const;

export function OwnerOnboardingForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [disciplineVariant, setDisciplineVariant] = useState<string>("artistic_female");
  const [countryCode, setCountryCode] = useState("es");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const specialization = useMemo(
    () =>
      resolveAcademySpecialization({
        countryCode,
        disciplineVariant,
      }),
    [countryCode, disciplineVariant]
  );
  const starterPresets = useMemo(
    () => getStarterGroupPresets(specialization),
    [specialization]
  );
  const starterClassPresets = useMemo(
    () => getStarterClassPresets(specialization, starterPresets),
    [specialization, starterPresets]
  );
  const [starterGroupKeys, setStarterGroupKeys] = useState<string[]>(
    starterPresets.map((preset) => preset.key)
  );

  const regionOptions = useMemo(() => findRegionsByCountry(countryCode), [countryCode]);
  const cityOptions = useMemo(() => findCitiesByRegion(countryCode, region), [countryCode, region]);

  useEffect(() => {
    setStarterGroupKeys(starterPresets.map((preset) => preset.key));
  }, [starterPresets]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch("/api/onboarding/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          academyName,
          disciplineVariant,
          countryCode,
          country: COUNTRY_REGION_OPTIONS.find((item) => item.value === countryCode)?.label ?? countryCode,
          region,
          city,
          starterGroupKeys,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "No se pudo completar la configuracion inicial.");
      }

      toast.pushToast({
        title: "Academia creada",
        description: "Entrando a tu espacio de trabajo.",
        variant: "success",
      });

      router.push(payload.data.redirectUrl);
      router.refresh();
    } catch (error) {
      toast.pushToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error inesperado.",
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Maria Garcia"
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="academyName">Nombre de tu academia</Label>
          <Input
            id="academyName"
            value={academyName}
            onChange={(event) => setAcademyName(event.target.value)}
            placeholder="Club Gimnasia Elite"
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Disciplina principal</Label>
          <Select value={disciplineVariant} onValueChange={setDisciplineVariant} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una disciplina" />
            </SelectTrigger>
            <SelectContent>
              {DISCIPLINE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Esta especializacion define aparatos, categorias y lenguaje tecnico por defecto.
          </p>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Estructura inicial sugerida</Label>
            <p className="text-xs text-muted-foreground">
              Puedes entrar con grupos base ya preparados para {specialization.labels.disciplineName.toLowerCase()}.
            </p>
          </div>
          <div className="grid gap-3">
            {starterPresets.map((preset) => {
              const selected = starterGroupKeys.includes(preset.key);
              return (
                <label
                  key={preset.key}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      setStarterGroupKeys((current) =>
                        current.includes(preset.key)
                          ? current.filter((key) => key !== preset.key)
                          : [...current, preset.key]
                      )
                    }
                    disabled={pending}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{preset.name}</p>
                    <p className="text-xs text-muted-foreground">{preset.level}</p>
                    <p className="text-xs text-muted-foreground">{preset.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Bloques semanales sugeridos</Label>
            <p className="text-xs text-muted-foreground">
              Si mantienes la estructura inicial, estos {specialization.labels.classLabel.toLowerCase()}s se crearán automáticamente.
            </p>
          </div>
          <div className="grid gap-3">
            {starterClassPresets
              .filter((preset) => !preset.groupPresetKey || starterGroupKeys.includes(preset.groupPresetKey))
              .map((preset) => (
                <div
                  key={preset.key}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <p className="font-medium text-foreground">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {preset.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preset.weekdays.length} días por semana · {preset.startTime} - {preset.endTime}
                  </p>
                </div>
              ))}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="countryCode">Pais base</Label>
          <SearchableSelect
            options={COUNTRY_REGION_OPTIONS.map((country) => ({
              value: country.value,
              label: country.label,
            }))}
            value={countryCode}
            onChange={(value) => {
              setCountryCode(value);
              setRegion("");
              setCity("");
            }}
            placeholder="Selecciona un pais"
            name="countryCode"
            searchPlaceholder="Buscar pais..."
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">{getRegionLabel(countryCode)}</Label>
          <SearchableSelect
            options={regionOptions}
            value={region}
            onChange={(value) => {
              setRegion(value);
              setCity("");
            }}
            disabled={pending || !countryCode || regionOptions.length === 0}
            placeholder={getRegionPlaceholder(countryCode, !!countryCode)}
            name="region"
            searchPlaceholder={`Buscar ${getRegionLabel(countryCode).toLowerCase()}...`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <SearchableSelect
            options={cityOptions}
            value={city}
            onChange={setCity}
            disabled={pending || !region || cityOptions.length === 0}
            placeholder={getCityPlaceholder(getRegionLabel(countryCode), !!region)}
            name="city"
            searchPlaceholder="Buscar ciudad..."
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparando tu academia...
          </>
        ) : (
          <>
            <Building2 className="mr-2 h-4 w-4" />
            Entrar a mi academia
          </>
        )}
      </Button>
    </form>
  );
}
