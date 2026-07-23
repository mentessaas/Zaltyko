"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Save,
  Building2,
  Palette,
  Clock,
  Globe,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { BrandingEditor } from "@/components/settings/BrandingEditor";
import { ScheduleEditor } from "@/components/settings/ScheduleEditor";
import { SocialLinksEditor } from "@/components/settings/SocialLinksEditor";
import { SportConfigurationDashboard } from "@/components/settings/SportConfigurationDashboard";
import { SportLegacyMigrationAssistant } from "@/components/settings/SportLegacyMigrationAssistant";
import { TimezoneSelector } from "@/components/settings/TimezoneSelector";
import { StripeConnectCard } from "@/components/billing/StripeConnectCard";
import {
  DEFAULT_SETTINGS,
  DISCIPLINE_VARIANTS,
  MULTI_BRANCH_VARIANTS,
  buildActiveSportConfigEditors,
  normalizeAcademySettingsPayload,
  type AcademySettings,
} from "@/components/settings/academy-settings-model";
import { useAcademyContext } from "@/hooks/use-academy-context";
import {
  COUNTRY_REGION_OPTIONS,
  findRegionsByCountry,
  getCityPlaceholder,
  getRegionLabel,
  getRegionPlaceholder,
} from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { TERMINOLOGY_KEYS } from "@/lib/sport-config/catalog";
import { logger } from "@/lib/logger";
import {
  getTerminology,
  getTerminologyWarnings,
  TERMINOLOGY_KEY_LABELS,
} from "@/lib/sport-config/terminology";

export default function SettingsPage() {
  const context = useAcademyContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_SETTINGS);
  // Al volver del onboarding de Stripe Connect (?connect=return|refresh) o con
  // ?tab=billing, abrir directamente la pestaña de Cobros para que
  // StripeConnectCard monte y dispare su refresco automático.
  const initialTab =
    searchParams.get("connect") === "return" ||
    searchParams.get("connect") === "refresh" ||
    searchParams.get("tab") === "billing"
      ? "billing"
      : "basic";
  const [activeTab, setActiveTab] = useState(initialTab);
  const regionOptions = useMemo(
    () => findRegionsByCountry(settings.countryCode.toLowerCase()),
    [settings.countryCode]
  );
  const cityOptions = useMemo(
    () => findCitiesByRegion(settings.countryCode.toLowerCase(), settings.region),
    [settings.countryCode, settings.region]
  );
  const activeSportConfigEditors = useMemo(
    () => buildActiveSportConfigEditors(settings),
    [settings]
  );

  useEffect(() => {
    if (context && !context.isAdmin) {
      router.replace(`/app/${context.academyId}/dashboard`);
    }
  }, [context, router]);

  // Cargar settings existentes
  useEffect(() => {
    async function loadSettings() {
      if (!context?.academyId) return;

      try {
        const response = await fetch(`/api/academies/${context.academyId}/settings`);

        if (response.ok) {
          const payload = await response.json();
          setSettings(normalizeAcademySettingsPayload(payload));
        }
      } catch (err) {
        logger.error("Error loading settings:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [context?.academyId]);

  // Guardar cambios
  const handleSave = useCallback(async () => {
    if (!context?.academyId) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/academies/${context.academyId}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Error al guardar la configuración");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "Error desconocido") || "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  }, [context?.academyId, settings]);

  const updateSettings = <K extends keyof AcademySettings>(key: K, value: AcademySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleActiveDisciplineVariant = (value: string) => {
    setSettings((prev) => {
      const current = new Set(prev.activeDisciplineVariants);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      const activeDisciplineVariants = Array.from(current);
      return {
        ...prev,
        activeDisciplineVariants: activeDisciplineVariants.length > 0 ? activeDisciplineVariants : [value],
        disciplineVariant: activeDisciplineVariants[0] ?? prev.disciplineVariant,
      };
    });
  };

  const toggleSportConfigCode = (
    variant: string,
    code: string,
    key: "activeProgramCodesByVariant" | "activeApparatusCodesByVariant"
  ) => {
    setSettings((prev) => {
      const selected = prev[key][variant] ?? [];
      if (selected.includes(code) && selected.length <= 1) return prev;

      return {
        ...prev,
        [key]: {
          ...prev[key],
          [variant]: selected.includes(code)
            ? selected.filter((item) => item !== code)
            : [...selected, code],
        },
      };
    });
  };

  const updateTerminologyOverride = (variant: string, key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      terminologyOverridesByVariant: {
        ...prev.terminologyOverridesByVariant,
        [variant]: {
          ...(prev.terminologyOverridesByVariant[variant] ?? {}),
          [key]: value,
        },
      },
    }));
  };

  if (context && !context.isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zaltyko-text-secondary" />
      </div>
    );
  }

  return (
    <SettingsLayout activeSection={activeTab}>
      <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
          <div className="zaltyko-motion-lines pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zaltyko-teal"><Settings2 className="h-4 w-4" /> Configuración</div>
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-zaltyko-navy">Ajustes de la academia</h1>
            <p className="text-sm text-zaltyko-text-secondary">
              Gestiona la información, branding y configuración de tu academia
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : success ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? "Guardando..." : success ? "Guardado" : "Guardar cambios"}
          </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 p-4 text-sm text-zaltyko-coral">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-zaltyko-teal/25 bg-zaltyko-teal/10 p-4 text-sm text-zaltyko-teal">
            <CheckCircle className="h-4 w-4" />
            Configuración guardada correctamente
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Básico</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Horarios</span>
            </TabsTrigger>
            <TabsTrigger value="contact" className="gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Contacto</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Cobros</span>
            </TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información básica</CardTitle>
                <CardDescription>
                  Datos principales de tu academia
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre de la academia *</Label>
                  <Input
                    id="name"
                    value={settings.name}
                    onChange={(e) => updateSettings("name", e.target.value)}
                    required
                    minLength={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="disciplineVariant">Especialización de gimnasia</Label>
                  <Select
                    id="disciplineVariant"
                    value={settings.disciplineVariant}
                    onValueChange={(value) => updateSettings("disciplineVariant", value)}
                    className="w-full"
                  >
                    {DISCIPLINE_VARIANTS.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-zaltyko-text-secondary">
                    Esta especialización define niveles, aparatos, evaluaciones y etiquetas visibles en la operación diaria.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
                  <div>
                    <Label>Ramas activas</Label>
                    <p className="text-xs text-zaltyko-text-secondary">
                      Una misma academia puede operar varias ramas sin mezclar aparatos, programas ni terminología.
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    {MULTI_BRANCH_VARIANTS.map((type) => (
                      <label
                        key={type.value}
                        className="flex items-start gap-2 rounded-lg border border-zaltyko-mist bg-white p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={settings.activeDisciplineVariants.includes(type.value)}
                          onChange={() => toggleActiveDisciplineVariant(type.value)}
                        />
                        <span>
                          <span className="block font-medium text-zaltyko-navy">{type.label}</span>
                          <span className="text-xs text-zaltyko-text-secondary">
                            {settings.sportConfigs.find((config) => config.defaultDisciplineVariant === type.value)
                              ?.apparatus.map((item) => item.name)
                              .slice(0, 4)
                              .join(", ") || "Se precargará al guardar"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-zaltyko-mist bg-white p-4">
                  <div>
                    <Label>Programas y aparatos activos por rama</Label>
                    <p className="text-xs text-zaltyko-text-secondary">
                      Estos códigos controlan qué opciones aparecen al crear grupos, clases, evaluaciones y resultados.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {activeSportConfigEditors.map((editor) => (
                      <div key={editor.variant} className="space-y-3 rounded-lg border border-zaltyko-mist bg-zaltyko-warm-white p-4">
                        <div>
                          <p className="font-medium text-zaltyko-navy">{editor.label}</p>
                          <p className="text-xs text-zaltyko-text-secondary">
                            Mantén al menos un programa y un aparato activo.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase text-zaltyko-text-secondary">Programas</p>
                          <div className="flex flex-wrap gap-2">
                            {editor.programs.map((program) => {
                              const selected = (settings.activeProgramCodesByVariant[editor.variant] ?? []).includes(program.code);
                              const locked = selected && editor.usedProgramCodes.includes(program.code);
                              return (
                                <label
                                  key={program.code}
                                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                                    locked
                                      ? "border-zaltyko-teal/30 bg-zaltyko-teal/10 text-zaltyko-navy"
                                      : "border-zaltyko-mist bg-white text-zaltyko-text-secondary"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={locked}
                                    title={locked ? "Este programa ya está en uso y no se puede desactivar desde aquí." : undefined}
                                    onChange={() =>
                                      toggleSportConfigCode(editor.variant, program.code, "activeProgramCodesByVariant")
                                    }
                                  />
                                  {program.name}
                                  {locked && <span className="font-medium text-zaltyko-teal">en uso</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase text-zaltyko-text-secondary">Aparatos</p>
                          <div className="flex flex-wrap gap-2">
                            {editor.apparatus.map((apparatus) => {
                              const selected = (settings.activeApparatusCodesByVariant[editor.variant] ?? []).includes(apparatus.code);
                              const locked = selected && editor.usedApparatusCodes.includes(apparatus.code);
                              return (
                                <label
                                  key={apparatus.code}
                                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                                    locked
                                      ? "border-zaltyko-teal/30 bg-zaltyko-teal/10 text-zaltyko-navy"
                                      : "border-zaltyko-mist bg-white text-zaltyko-text-secondary"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={locked}
                                    title={locked ? "Este aparato ya está en uso y no se puede desactivar desde aquí." : undefined}
                                    onChange={() =>
                                      toggleSportConfigCode(editor.variant, apparatus.code, "activeApparatusCodesByVariant")
                                    }
                                  />
                                  {apparatus.name}
                                  {locked && <span className="font-medium text-zaltyko-teal">en uso</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-zaltyko-mist bg-white p-3">
                          <div>
                            <p className="text-xs font-medium uppercase text-zaltyko-text-secondary">
                              Terminología visible
                            </p>
                            <p className="text-xs text-zaltyko-text-secondary">
                              Estos términos se aplican solo a esta rama dentro de esta academia.
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {TERMINOLOGY_KEYS.map((key) => (
                              <div key={key} className="space-y-1">
                                <Label htmlFor={`terminology-${editor.variant}-${key}`} className="text-xs">
                                  {TERMINOLOGY_KEY_LABELS[key]}
                                </Label>
                                <Input
                                  id={`terminology-${editor.variant}-${key}`}
                                  value={editor.terminology[key] ?? ""}
                                  maxLength={80}
                                  onChange={(event) =>
                                    updateTerminologyOverride(editor.variant, key, event.target.value)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                          <TerminologyPreview terminology={editor.terminology} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {context?.academyId && (
                  <SportConfigurationDashboard academyId={context.academyId} />
                )}

                {context?.academyId && settings.sportConfigs.length > 0 && (
                  <SportLegacyMigrationAssistant
                    academyId={context.academyId}
                    sportConfigs={settings.sportConfigs.map((config) => ({
                      id: config.id,
                      branchName: config.branchName,
                      disciplineName: config.disciplineName,
                      terminology: config.terminology,
                    }))}
                  />
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="countryCode">País base</Label>
                    <SearchableSelect
                      options={COUNTRY_REGION_OPTIONS.map((country) => ({
                        value: country.value.toUpperCase(),
                        label: country.label,
                      }))}
                      value={settings.countryCode}
                      onChange={(value) => {
                        updateSettings("countryCode", value);
                        updateSettings("country", COUNTRY_REGION_OPTIONS.find((item) => item.value.toUpperCase() === value)?.label ?? value);
                        updateSettings("region", "");
                        updateSettings("city", "");
                      }}
                      placeholder="Selecciona un país"
                      name="countryCode"
                      searchPlaceholder="Buscar país..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">{getRegionLabel(settings.countryCode)}</Label>
                    <SearchableSelect
                      options={regionOptions}
                      value={settings.region}
                      onChange={(value) => {
                        updateSettings("region", value);
                        updateSettings("city", "");
                      }}
                      disabled={!settings.countryCode || regionOptions.length === 0}
                      placeholder={getRegionPlaceholder(settings.countryCode, !!settings.countryCode)}
                      name="region"
                      searchPlaceholder={`Buscar ${getRegionLabel(settings.countryCode).toLowerCase()}...`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ciudad</Label>
                    <SearchableSelect
                      options={cityOptions}
                      value={settings.city}
                      onChange={(value) => updateSettings("city", value)}
                      disabled={!settings.region || cityOptions.length === 0}
                      placeholder={getCityPlaceholder(getRegionLabel(settings.countryCode), !!settings.region)}
                      name="city"
                      searchPlaceholder="Buscar ciudad..."
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-zaltyko-mist bg-zaltyko-warm-white p-4 text-sm">
                  <p className="font-medium text-zaltyko-navy">Configuración técnica activa</p>
                  <p className="mt-1 text-zaltyko-text-secondary">
                    {settings.federationConfigVersion} · estado {settings.specializationStatus}
                  </p>
                  <p className="mt-2 text-xs text-zaltyko-text-secondary">
                    Si la academia ya opera con datos reales, cambiar disciplina o país debe tratarse como migración guiada.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publicDescription">Descripción pública</Label>
                  <Textarea
                    id="publicDescription"
                    value={settings.publicDescription}
                    onChange={(e) => updateSettings("publicDescription", e.target.value)}
                    placeholder="Describe tu academia para el directorio público..."
                    rows={4}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isPublic">Visible en directorio público</Label>
                    <p className="text-xs text-zaltyko-text-secondary">
                      Permite que tu academia aparezca en búsquedas públicas
                    </p>
                  </div>
                  <Switch
                    id="isPublic"
                    checked={settings.isPublic}
                    onCheckedChange={(checked) => updateSettings("isPublic", checked)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zona horaria</CardTitle>
                <CardDescription>
                  Configura la zona horaria para tu academia
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TimezoneSelector
                  value={settings.timezone}
                  onChange={(value) => updateSettings("timezone", value)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding" className="mt-6">
            <BrandingEditor
              data={settings.branding}
              onChange={(data) => updateSettings("branding", data)}
            />
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="mt-6">
            <ScheduleEditor
              data={settings.schedule}
              onChange={(data) => updateSettings("schedule", data)}
            />
          </TabsContent>

          {/* Contact Tab */}
          <TabsContent value="contact" className="mt-6">
            <SocialLinksEditor
              data={settings.contact}
              onChange={(data) => updateSettings("contact", data)}
            />
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6 space-y-6">
            {context?.academyId && <StripeConnectCard academyId={context.academyId} />}

            <Card>
              <CardHeader>
                <CardTitle>Datos para recibos internos</CardTitle>
                <CardDescription>
                  Configura referencias administrativas para cuotas y pagos internos de la academia.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taxId">Identificador administrativo</Label>
                  <Input
                    id="taxId"
                    value={settings.taxId}
                    onChange={(e) => updateSettings("taxId", e.target.value)}
                    placeholder="ID interno opcional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">Prefijo de recibos internos</Label>
                  <Input
                    id="invoicePrefix"
                    value={settings.invoicePrefix}
                    onChange={(e) => updateSettings("invoicePrefix", e.target.value)}
                    placeholder="REC"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SettingsLayout>
  );
}

function TerminologyPreview({ terminology }: { terminology: Record<string, string> }) {
  const terms = getTerminology({ terminology });
  const warnings = getTerminologyWarnings({ terminology });
  const lower = (value: string) => value.toLocaleLowerCase();

  return (
    <div className="rounded-lg border border-zaltyko-mist bg-zaltyko-warm-white p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-zaltyko-text-secondary">
        <Eye className="h-3.5 w-3.5" />
        Vista previa operativa
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-zaltyko-mist bg-white p-3">
          <p className="text-xs font-medium text-zaltyko-text-secondary">Acciones</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-md bg-zaltyko-teal px-2 py-1 text-xs font-medium text-white">
              Nuevo {lower(terms.athlete)}
            </span>
            <span className="rounded-md border border-zaltyko-mist px-2 py-1 text-xs text-zaltyko-navy">
              Crear {lower(terms.group)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-zaltyko-mist bg-white p-3">
          <p className="text-xs font-medium text-zaltyko-text-secondary">Listado</p>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-zaltyko-text-secondary">
            <span>{terms.athlete}</span>
            <span>{terms.group}</span>
            <span>{terms.apparatus}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded bg-zaltyko-warm-white px-2 py-1 text-xs text-zaltyko-navy">
            <span>Lucía</span>
            <span>{terms.team}</span>
            <span>{terms.routine}</span>
          </div>
        </div>

        <div className="rounded-lg border border-zaltyko-mist bg-white p-3">
          <p className="text-xs font-medium text-zaltyko-text-secondary">Estados</p>
          <p className="mt-2 text-xs text-zaltyko-navy">
            Sin {lower(terms.group)} asignado
          </p>
          <p className="mt-1 text-xs text-zaltyko-text-secondary">
            {terms.license}: pendiente · {terms.attendance}: registrada
          </p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-zaltyko-coral/25 bg-zaltyko-coral/10 p-3 text-xs text-zaltyko-coral">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}
