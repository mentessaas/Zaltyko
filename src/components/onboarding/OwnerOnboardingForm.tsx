"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

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
import { getSportConfigSeedByVariant, getSportConfigSeedsByCountry } from "@/lib/sport-config/catalog";

const ACADEMY_KIND_OPTIONS = [
  { value: "recreational", label: "Recreativa" },
  { value: "competitive", label: "Competitiva" },
  { value: "mixed", label: "Mixta" },
] as const;

export function OwnerOnboardingForm() {
  const initialSeed = getSportConfigSeedsByCountry("es")[0];
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fullName, setFullName] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [disciplineVariant, setDisciplineVariant] = useState<string>(
    initialSeed?.defaultDisciplineVariant ?? "general"
  );
  const [activeDisciplineVariants, setActiveDisciplineVariants] = useState<string[]>([
    initialSeed?.defaultDisciplineVariant ?? "general",
  ]);
  const [academyKind, setAcademyKind] = useState<string>("mixed");
  const [countryCode, setCountryCode] = useState("es");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [activeProgramCodesByVariant, setActiveProgramCodesByVariant] = useState<Record<string, string[]>>({});
  const [activeApparatusCodesByVariant, setActiveApparatusCodesByVariant] = useState<Record<string, string[]>>({});
  const [starterGroupsByVariant, setStarterGroupsByVariant] = useState<Record<string, string[]>>({
    [initialSeed?.defaultDisciplineVariant ?? "general"]: getStarterGroupPresets(
      resolveAcademySpecialization({
        countryCode: "es",
        disciplineVariant: initialSeed?.defaultDisciplineVariant ?? "general",
      })
    ).map((preset) => preset.key),
  });
  const sportSeeds = useMemo(() => getSportConfigSeedsByCountry(countryCode), [countryCode]);
  const disciplineOptions = useMemo(
    () =>
      sportSeeds.map((seed) => ({
        value: seed.defaultDisciplineVariant,
        label: seed.labels.disciplineName,
        seed,
      })),
    [sportSeeds]
  );
  const activeBranchSummaries = useMemo(
    () =>
      activeDisciplineVariants.map((variant) => {
        const branchSpecialization = resolveAcademySpecialization({
          countryCode,
          disciplineVariant: variant,
        });
        const branchStarterPresets = getStarterGroupPresets(branchSpecialization);
        const seed = getSportConfigSeedByVariant(countryCode, variant);
        return {
          variant,
          specialization: branchSpecialization,
          starterPresets: branchStarterPresets,
          starterClassPresets: getStarterClassPresets(branchSpecialization, branchStarterPresets),
          seed,
        };
      }),
    [activeDisciplineVariants, countryCode]
  );

  const regionOptions = useMemo(() => findRegionsByCountry(countryCode), [countryCode]);
  const cityOptions = useMemo(() => findCitiesByRegion(countryCode, region), [countryCode, region]);

  useEffect(() => {
    if (disciplineOptions.length === 0) return;

    setActiveDisciplineVariants((current) => {
      const availableVariants = new Set<string>(disciplineOptions.map((option) => option.value));
      const currentAvailable = current.filter((variant) => availableVariants.has(variant));
      return currentAvailable.length > 0 ? currentAvailable : [disciplineOptions[0].value];
    });

    setDisciplineVariant((current) =>
      disciplineOptions.some((option) => option.value === current) ? current : disciplineOptions[0].value
    );
  }, [disciplineOptions]);

  useEffect(() => {
    setActiveProgramCodesByVariant((current) => {
      const next: Record<string, string[]> = {};
      for (const branch of activeBranchSummaries) {
        next[branch.variant] =
          current[branch.variant] ?? branch.seed?.programs.map((program) => program.code) ?? [];
      }
      return next;
    });

    setActiveApparatusCodesByVariant((current) => {
      const next: Record<string, string[]> = {};
      for (const branch of activeBranchSummaries) {
        next[branch.variant] =
          current[branch.variant] ?? branch.seed?.evaluation.apparatus.map((item) => item.code) ?? [];
      }
      return next;
    });
  }, [activeBranchSummaries]);

  useEffect(() => {
    setStarterGroupsByVariant((current) => {
      const next: Record<string, string[]> = {};
      for (const branch of activeBranchSummaries) {
        next[branch.variant] =
          current[branch.variant] ?? branch.starterPresets.map((preset) => preset.key);
      }
      return next;
    });
  }, [activeBranchSummaries]);

  const toggleActiveBranch = (variant: string) => {
    setActiveDisciplineVariants((current) => {
      const next = current.includes(variant)
        ? current.filter((item) => item !== variant)
        : [...current, variant];
      const normalized = next.length > 0 ? next : [variant];
      if (!normalized.includes(disciplineVariant)) {
        setDisciplineVariant(normalized[0]);
      }
      return normalized;
    });
  };

  const toggleStarterGroup = (variant: string, key: string) => {
    setStarterGroupsByVariant((current) => {
      const selected = current[variant] ?? [];
      return {
        ...current,
        [variant]: selected.includes(key)
          ? selected.filter((item) => item !== key)
          : [...selected, key],
      };
    });
  };

  const toggleCodeByVariant = (
    variant: string,
    code: string,
    setter: Dispatch<SetStateAction<Record<string, string[]>>>
  ) => {
    setter((current) => {
      const selected = current[variant] ?? [];
      if (selected.includes(code) && selected.length <= 1) {
        return current;
      }
      return {
        ...current,
        [variant]: selected.includes(code)
          ? selected.filter((item) => item !== code)
          : [...selected, code],
      };
    });
  };

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
          activeDisciplineVariants,
          academyKind,
          countryCode,
          country: COUNTRY_REGION_OPTIONS.find((item) => item.value === countryCode)?.label ?? countryCode,
          region,
          city,
          activeProgramCodesByVariant,
          activeApparatusCodesByVariant,
          starterGroupsByVariant,
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
        <div className="space-y-2 sm:col-span-2">
          <Label>Disciplina principal</Label>
          <Select
            value={disciplineVariant}
            onValueChange={(value) => {
              setDisciplineVariant(value);
              setActiveDisciplineVariants((current) =>
                current.includes(value) ? current : [...current, value]
              );
            }}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una disciplina" />
            </SelectTrigger>
            <SelectContent>
              {disciplineOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Esta especialización define aparatos, categorías y lenguaje técnico por defecto.
          </p>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Ramas activas</Label>
            <p className="text-xs text-muted-foreground">
              Puedes activar artística femenina, artística masculina y rítmica en la misma academia.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {disciplineOptions.map((option) => {
              const selected = activeDisciplineVariants.includes(option.value);
              const seed = option.seed;
              return (
                <label
                  key={option.value}
                  className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleActiveBranch(option.value)}
                      disabled={pending}
                      className="mt-1"
                    />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {seed?.evaluation.apparatus.map((item) => item.label).slice(0, 3).join(", ") ??
                          "Configuración base"}
                      </p>
                    </div>
                  </div>
                </label>
              );
            })}
            {disciplineOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay configuraciones deportivas disponibles para este país.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Tipo de academia</Label>
          <Select value={academyKind} onValueChange={setAcademyKind} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona el tipo de academia" />
            </SelectTrigger>
            <SelectContent>
              {ACADEMY_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-medium text-foreground"
        aria-expanded={showAdvanced}
      >
        Configuración avanzada (opcional)
        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      <p className="text-xs text-muted-foreground">
        Ya dejamos programas, aparatos y grupos base preseleccionados según tu disciplina. Abre esto solo si quieres ajustarlos antes de crear la academia.
      </p>

      {showAdvanced && (
      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Estructura inicial sugerida</Label>
            <p className="text-xs text-muted-foreground">
              Puedes entrar con grupos base ya preparados por cada rama activa.
            </p>
          </div>
          <div className="grid gap-3">
            {activeBranchSummaries.map((branch) => (
              <div key={branch.variant} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {branch.specialization.labels.disciplineName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Programas: {branch.seed?.programs.map((program) => program.name).join(", ") ?? "Base"}
                  </p>
                </div>
                {branch.starterPresets.map((preset) => {
                  const selected = (starterGroupsByVariant[branch.variant] ?? []).includes(preset.key);
                  return (
                    <label
                      key={preset.key}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStarterGroup(branch.variant, preset.key)}
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
            ))}
          </div>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Programas y aparatos activos</Label>
            <p className="text-xs text-muted-foreground">
              Se guardarán por rama y no se mezclarán entre configuraciones.
            </p>
          </div>
          <div className="grid gap-3">
            {activeBranchSummaries.map((branch) => (
              <div key={branch.variant} className="space-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{branch.specialization.labels.disciplineName}</p>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Programas</p>
                  <div className="flex flex-wrap gap-2">
                    {(branch.seed?.programs ?? []).map((program) => {
                      const selected = (activeProgramCodesByVariant[branch.variant] ?? []).includes(program.code);
                      return (
                        <label
                          key={program.code}
                          className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              toggleCodeByVariant(branch.variant, program.code, setActiveProgramCodesByVariant)
                            }
                            disabled={pending}
                          />
                          {program.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Aparatos</p>
                  <div className="flex flex-wrap gap-2">
                    {(branch.seed?.evaluation.apparatus ?? branch.specialization.evaluation.apparatus).map((item) => {
                      const selected = (activeApparatusCodesByVariant[branch.variant] ?? []).includes(item.code);
                      return (
                        <label
                          key={item.code}
                          className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              toggleCodeByVariant(branch.variant, item.code, setActiveApparatusCodesByVariant)
                            }
                            disabled={pending}
                          />
                          {item.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="space-y-1">
            <Label>Bloques semanales sugeridos</Label>
            <p className="text-xs text-muted-foreground">
              Si mantienes la estructura inicial, estos entrenamientos se crearán automáticamente.
            </p>
          </div>
          <div className="grid gap-3">
            {activeBranchSummaries.map((branch) => {
              const selectedKeys = starterGroupsByVariant[branch.variant] ?? [];
              return (
                <div key={branch.variant} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {branch.specialization.labels.disciplineName}
                  </p>
                  {branch.starterClassPresets
                    .filter((preset) => !preset.groupPresetKey || selectedKeys.includes(preset.groupPresetKey))
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
                  {selectedKeys.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No se crearán grupos iniciales para esta rama.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

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
