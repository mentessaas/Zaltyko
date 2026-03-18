"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";

import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { BrandingEditor, type BrandingData } from "@/components/settings/BrandingEditor";
import { ScheduleEditor, type ScheduleData } from "@/components/settings/ScheduleEditor";
import { SocialLinksEditor, type SocialLinksData } from "@/components/settings/SocialLinksEditor";
import { TimezoneSelector } from "@/components/settings/TimezoneSelector";
import { useAcademyContext } from "@/hooks/use-academy-context";

interface AcademySettings {
  // Basic info
  name: string;
  publicDescription: string;
  isPublic: boolean;
  academyType: string;

  // Branding
  branding: BrandingData;

  // Schedule
  schedule: ScheduleData;

  // Contact & Social
  contact: SocialLinksData;

  // Timezone
  timezone: string;

  // Billing (Stripe)
  stripePublicKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  taxId: string;
  invoicePrefix: string;
}

const DEFAULT_SETTINGS: AcademySettings = {
  name: "",
  publicDescription: "",
  isPublic: true,
  academyType: "artistica",
  branding: {
    primaryColor: "#DC2626",
    secondaryColor: "#EF4444",
    accentColor: "#F59E0B",
    fontHeading: "Inter",
    fontBody: "Inter",
    logoUrl: "",
    faviconUrl: "",
  },
  schedule: {
    slots: [],
  },
  contact: {
    website: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    socialInstagram: "",
    socialFacebook: "",
    socialTwitter: "",
    socialYoutube: "",
  },
  timezone: "America/Mexico_City",
  stripePublicKey: "",
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  taxId: "",
  invoicePrefix: "INV",
};

const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia Artística" },
  { value: "ritmica", label: "Gimnasia Rítmica" },
  { value: "trampolin", label: "Trampolín" },
  { value: "parkour", label: "Parkour" },
  { value: "danza", label: "Danza" },
  { value: "general", label: "Gimnasia General" },
];

export default function SettingsPage() {
  const router = useRouter();
  const context = useAcademyContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState("basic");

  // Cargar settings existentes
  useEffect(() => {
    async function loadSettings() {
      if (!context?.academyId) return;

      try {
        const response = await fetch(`/api/academies/${context.academyId}/settings`);

        if (response.ok) {
          const data = await response.json();
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data,
            branding: { ...DEFAULT_SETTINGS.branding, ...data.branding },
            schedule: { ...DEFAULT_SETTINGS.schedule, ...data.schedule },
            contact: { ...DEFAULT_SETTINGS.contact, ...data.contact },
          });
        }
      } catch (err) {
        console.error("Error loading settings:", err);
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
    } catch (err: any) {
      setError(err.message || "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  }, [context?.academyId, settings]);

  const updateSettings = <K extends keyof AcademySettings>(key: K, value: AcademySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SettingsLayout activeSection={activeTab}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Configuración de la Academia</h1>
            <p className="text-muted-foreground">
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

        {/* Estados */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center gap-2">
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
              <span className="hidden sm:inline">Facturación</span>
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
                  <Label htmlFor="academyType">Tipo de academia</Label>
                  <Select
                    id="academyType"
                    value={settings.academyType}
                    onValueChange={(value) => updateSettings("academyType", value)}
                    className="w-full"
                  >
                    {ACADEMY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
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
                    <p className="text-xs text-muted-foreground">
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
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Stripe</CardTitle>
                <CardDescription>
                  Configura las credenciales de Stripe para procesar pagos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stripePublicKey">Stripe Public Key</Label>
                  <Input
                    id="stripePublicKey"
                    type="text"
                    value={settings.stripePublicKey}
                    onChange={(e) => updateSettings("stripePublicKey", e.target.value)}
                    placeholder="pk_live_..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripeSecretKey">Stripe Secret Key</Label>
                  <Input
                    id="stripeSecretKey"
                    type="password"
                    value={settings.stripeSecretKey}
                    onChange={(e) => updateSettings("stripeSecretKey", e.target.value)}
                    placeholder="sk_live_..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripeWebhookSecret">Stripe Webhook Secret</Label>
                  <Input
                    id="stripeWebhookSecret"
                    type="password"
                    value={settings.stripeWebhookSecret}
                    onChange={(e) => updateSettings("stripeWebhookSecret", e.target.value)}
                    placeholder="whsec_..."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Información fiscal</CardTitle>
                <CardDescription>
                  Configura los datos para facturacion
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taxId">RFC / NIF / Tax ID</Label>
                  <Input
                    id="taxId"
                    value={settings.taxId}
                    onChange={(e) => updateSettings("taxId", e.target.value)}
                    placeholder="X1234567XX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">Prefijo de facturas</Label>
                  <Input
                    id="invoicePrefix"
                    value={settings.invoicePrefix}
                    onChange={(e) => updateSettings("invoicePrefix", e.target.value)}
                    placeholder="INV"
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
