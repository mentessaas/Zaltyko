"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerAcademyLookup } from "./OwnerAcademyLookup";
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
import { UTM_STORAGE_KEY, readUtmWithFallback } from "@/lib/growth/utm";

const ACADEMY_KIND_OPTIONS = [
  { value: "recreational", label: "Recreativa" },
  { value: "competitive", label: "Competitiva" },
  { value: "mixed", label: "Mixta" },
] as const;

const OWNER_ONBOARDING_DRAFT_KEY = "zaltyko:owner-onboarding-draft:v1";

type DirectoryAcademyDefaults = { name: string; countryCode: string; region?: string; city?: string };

export function OwnerOnboardingForm({
  directoryEntryId,
  initialAcademy,
  directoryDiscoveryEnabled = false,
  directoryClaimsEnabled = false,
}: {
  directoryEntryId?: string;
  initialAcademy?: DirectoryAcademyDefaults;
  directoryDiscoveryEnabled?: boolean;
  directoryClaimsEnabled?: boolean;
} = {}) {
  const initialCountry = initialAcademy?.countryCode ?? "es";
  const draftKey = directoryEntryId ? `${OWNER_ONBOARDING_DRAFT_KEY}:${directoryEntryId}` : OWNER_ONBOARDING_DRAFT_KEY;
  const initialSeed = getSportConfigSeedsByCountry(initialCountry)[0];
  const router = useRouter();
  const toast = useToast();
  const [reviewedLookup,setReviewedLookup]=useState<string|null>(null);
  const [duplicateEntries,setDuplicateEntries]=useState<{id:string;kind:"academy";slug:string;academy_id:string|null;event_id:null;data:{name:string}}[]>([]);
  const [needsDirectoryReview, setNeedsDirectoryReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fullName, setFullName] = useState("");
  const [academyName, setAcademyName] = useState(initialAcademy?.name ?? "");
  const [disciplineVariant, setDisciplineVariant] = useState<string>(
    initialSeed?.defaultDisciplineVariant ?? "general"
  );
  const [activeDisciplineVariants, setActiveDisciplineVariants] = useState<string[]>([
    initialSeed?.defaultDisciplineVariant ?? "general",
  ]);
  const [academyKind, setAcademyKind] = useState<string>("mixed");
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [region, setRegion] = useState(initialAcademy?.region ?? "");
  const [city, setCity] = useState(initialAcademy?.city ?? "");
  const [activeProgramCodesByVariant, setActiveProgramCodesByVariant] = useState<Record<string, string[]>>({});
  const [activeApparatusCodesByVariant, setActiveApparatusCodesByVariant] = useState<Record<string, string[]>>({});
  const [starterGroupsByVariant, setStarterGroupsByVariant] = useState<Record<string, string[]>>({
    [initialSeed?.defaultDisciplineVariant ?? "general"]: getStarterGroupPresets(
      resolveAcademySpecialization({
        countryCode: initialCountry,
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

  // Conserva únicamente datos de configuración no sensibles para que una
  // interrupción no obligue a repetir el onboarding desde cero.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<{
        fullName: string;
        academyName: string;
        countryCode: string;
        region: string;
        city: string;
        academyKind: string;
        disciplineVariant: string;
      }>;
      if (draft.fullName) setFullName(draft.fullName);
      // A verified directory listing stays the source of its public identity.
      // Do not let an older local draft replace its approved name or location.
      if (!directoryEntryId) {
        if (draft.academyName) setAcademyName(draft.academyName);
        if (draft.countryCode) setCountryCode(draft.countryCode);
        if (draft.region) setRegion(draft.region);
        if (draft.city) setCity(draft.city);
      }
      if (draft.academyKind) setAcademyKind(draft.academyKind);
      if (draft.disciplineVariant) setDisciplineVariant(draft.disciplineVariant);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [directoryEntryId, draftKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ fullName, academyName, countryCode, region, city, academyKind, disciplineVariant })
      );
    } catch {
      // El almacenamiento local puede estar deshabilitado; el formulario sigue funcionando.
    }
  }, [draftKey, fullName, academyName, countryCode, region, city, academyKind, disciplineVariant]);

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
    if(directoryDiscoveryEnabled && !directoryEntryId && reviewedLookup!==JSON.stringify([academyName.trim(),countryCode,city.trim()])) return;
    setPending(true);
    setDuplicateEntries([]);
    setNeedsDirectoryReview(false);

    try {
      const utm = readUtmWithFallback(
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(),
        typeof window !== "undefined" ? window.sessionStorage : undefined,
        UTM_STORAGE_KEY
      );

      const response = await fetch("/api/onboarding/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          directoryEntryId,
          directoryActivation:directoryEntryId?true:undefined,
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
          utm,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if(payload?.code === "ACADEMY_ALREADY_LISTED") setDuplicateEntries(payload.details?.entries ?? []);
        if (payload?.code === "ACADEMY_REVIEW_REQUIRED") {
          setNeedsDirectoryReview(true);
        }
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo completar la configuración inicial.");
      }

      toast.pushToast({
        title: "Academia creada",
        description: "Entrando a tu espacio de trabajo.",
        variant: "success",
      });

      window.localStorage.removeItem(draftKey);

      const redirectUrl = payload?.data?.redirectUrl ?? payload?.redirectUrl;
      if (typeof redirectUrl !== "string" || !redirectUrl.startsWith("/")) {
        toast.pushToast({
          title: "Academia creada",
          description: "No pudimos abrir el acceso directo; te llevamos al dashboard.",
          variant: "warning",
        });
        router.push("/dashboard");
        return;
      }
      router.push(redirectUrl);
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
      {directoryEntryId&&<label className="flex gap-3 rounded-lg border p-4"><input type="checkbox" required/> Quiero crear el espacio de gestión de esta academia y vincularlo a su ficha. Reclamar y gestionar la ficha pública sigue siendo gratuito; no se activa un cobro por esta acción.</label>}
      {directoryEntryId && (
        <p role="note" className="text-sm text-muted-foreground">
          El nombre y la sede se toman de la ficha aprobada. Si necesitas
          corregirlos, solicita primero el cambio desde{" "}
          <Link className="underline" href="/directorio/mis-fichas">
            Mis fichas
          </Link>
          .
        </p>
      )}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3" aria-label="Paso 1 de 5 de la configuración">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">Paso 1 de 5 · Crear el espacio de trabajo</span>
          <span className="text-muted-foreground">≈ 2 minutos</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15" aria-hidden="true">
          <div className="h-full w-1/5 rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {directoryDiscoveryEnabled && !directoryEntryId
            ? directoryClaimsEnabled
              ? "Tu cuenta personal ya está creada. Antes de crear un espacio nuevo, busca tu academia abajo. Si ya tiene ficha, solicita su reclamación gratuita; la activación de la gestión es un paso posterior y separado."
              : "Tu cuenta personal ya está creada. Busca tu academia antes de crearla para evitar duplicados. Si ya tiene ficha mientras las reclamaciones no están activas, solicita ayuda para vincularla."
            : "Tu cuenta personal ya está creada. Al completar este formulario crearás la academia y entrarás a su espacio de trabajo; los grupos, programas, clases y ajustes avanzados se pueden completar después desde allí."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="María García"
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
            placeholder="Club Gimnasia Élite"
            required
            readOnly={Boolean(directoryEntryId)}
            disabled={pending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="countryCode">País base</Label>
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
            placeholder="Selecciona un país"
            name="countryCode"
            searchPlaceholder="Buscar país..."
            disabled={pending || Boolean(directoryEntryId)}
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
                  className="min-h-11 rounded-lg border border-border bg-card px-4 py-3 text-sm"
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
        <div className="space-y-2">
          <Label htmlFor="region">{getRegionLabel(countryCode)}</Label>
          <SearchableSelect
            options={regionOptions}
            value={region}
            onChange={(value) => {
              setRegion(value);
              setCity("");
            }}
            disabled={pending || Boolean(directoryEntryId) || !countryCode || regionOptions.length === 0}
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
            disabled={pending || Boolean(directoryEntryId) || !region || cityOptions.length === 0}
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
                      className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
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
                          className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground"
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
                          className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground"
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
            <Label>Plantilla inicial de clases (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Si mantienes la estructura inicial, estos entrenamientos se crearán automáticamente.
              Si prefieres configurarlos después, desmarca todos los grupos: podrás retomar tu primera clase desde el dashboard.
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
                    <p className="text-xs text-muted-foreground" data-testid="owner-onboarding-classes-skipped">
                      Plantilla omitida por ahora. La academia se creará sin grupos ni clases iniciales; podrás configurarlos después desde el dashboard.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {directoryDiscoveryEnabled && !directoryEntryId && (
        <OwnerAcademyLookup
          name={academyName}
          countryCode={countryCode}
          city={city}
          onCityChange={setCity}
          onReviewed={setReviewedLookup}
          claimsEnabled={directoryClaimsEnabled}
        />
      )}
      {needsDirectoryReview && (
        <div role="alert" className="space-y-2 rounded-lg border p-4">
          <p>
            Para evitar duplicar una academia, necesitamos revisar estos datos
            antes de crear el espacio de gestión.
          </p>
          <Link
            className="block underline"
            href={
              directoryEntryId
                ? `/contact?type=support&directoryEntryId=${encodeURIComponent(directoryEntryId)}`
                : "/contact?type=support"
            }
          >
            Solicitar ayuda para vincular la ficha
          </Link>
        </div>
      )}
      {duplicateEntries.length>0 && <div role="alert" className="space-y-2 rounded-lg border p-4"><p>Esta academia ya tiene una ficha. Revísala y solicita la reclamación o asistencia; no hemos creado otra academia. Si es otra sede con el mismo nombre, solicita asistencia para distinguirlas.</p><Link className="block underline" href="/contact?type=support">Solicitar asistencia para revisar mi sede</Link>{duplicateEntries.map(entry=><Link key={entry.id} className="block underline" href={`/academias/${entry.id}${entry.slug?`-${entry.slug}`:""}`}>{entry.data.name}</Link>)}</div>}
      <Button type="submit" className="w-full" disabled={pending || (directoryDiscoveryEnabled && !directoryEntryId && reviewedLookup!==JSON.stringify([academyName.trim(),countryCode,city.trim()]))}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Preparando tu academia...
          </>
        ) : (
          <>
            <Building2 className="mr-2 h-4 w-4" />
            Crear mi academia y entrar
          </>
        )}
      </Button>
    </form>
  );
}
