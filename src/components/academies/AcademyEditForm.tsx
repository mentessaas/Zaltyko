"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe, Mail, Phone, MapPin, Instagram, Facebook, Twitter, Youtube, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COUNTRY_REGION_OPTIONS, findRegionsByCountry, getRegionLabel, getRegionPlaceholder, getCityPlaceholder } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { ACADEMY_TYPES } from "@/lib/onboardingCopy";
import { SearchableSelect } from "@/components/ui/searchable-select";

const DISCIPLINE_VARIANTS = [
  { value: "artistic_female", label: "Gimnasia artística femenina" },
  { value: "artistic_male", label: "Gimnasia artística masculina" },
  { value: "rhythmic", label: "Gimnasia rítmica" },
] as const;

interface AcademyData {
  id: string;
  name: string;
  country: string | null;
  countryCode?: string | null;
  region: string | null;
  city: string | null;
  academyType: string;
  disciplineVariant?: string | null;
  specializationStatus?: string | null;
  publicDescription: string | null;
  isPublic: boolean;
  logoUrl: string | null;
  website: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialTwitter: string | null;
  socialYoutube: string | null;
}

interface AcademyEditFormProps {
  academy: AcademyData;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function AcademyEditForm({ academy, onSaved, onCancel }: AcademyEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: academy.name || "",
    country: academy.country || "",
    countryCode: academy.countryCode || "ES",
    region: academy.region || "",
    city: academy.city || "",
    academyType: academy.academyType || "artistica",
    disciplineVariant: academy.disciplineVariant || "artistic_female",
    publicDescription: academy.publicDescription || "",
    isPublic: academy.isPublic ?? true,
    logoUrl: academy.logoUrl || "",
    website: academy.website || "",
    contactEmail: academy.contactEmail || "",
    contactPhone: academy.contactPhone || "",
    address: academy.address || "",
    socialInstagram: academy.socialInstagram || "",
    socialFacebook: academy.socialFacebook || "",
    socialTwitter: academy.socialTwitter || "",
    socialYoutube: academy.socialYoutube || "",
  });

  const regionOptions = useMemo(
    () => findRegionsByCountry(formData.countryCode.toLowerCase()),
    [formData.countryCode]
  );

  const cityOptions = useMemo(
    () => findCitiesByRegion(formData.countryCode.toLowerCase(), formData.region),
    [formData.countryCode, formData.region]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/academies/${academy.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          country: formData.country || null,
          countryCode: formData.countryCode || null,
          region: formData.region || null,
          city: formData.city || null,
          academyType: formData.academyType,
          disciplineVariant: formData.disciplineVariant,
          publicDescription: formData.publicDescription.trim() || null,
          isPublic: formData.isPublic,
          logoUrl: formData.logoUrl.trim() || null,
          website: formData.website.trim() || null,
          contactEmail: formData.contactEmail.trim() || null,
          contactPhone: formData.contactPhone.trim() || null,
          address: formData.address.trim() || null,
          socialInstagram: formData.socialInstagram.trim() || null,
          socialFacebook: formData.socialFacebook.trim() || null,
          socialTwitter: formData.socialTwitter.trim() || null,
          socialYoutube: formData.socialYoutube.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Error al actualizar la academia");
      }

      setSuccess(true);
      router.refresh();
      
      if (onSaved) {
        setTimeout(() => {
          onSaved();
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || "Error al guardar los cambios");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ¡Cambios guardados correctamente!
        </div>
      )}

      {/* Información básica */}
      <Card>
        <CardHeader>
          <CardTitle>Información básica</CardTitle>
          <CardDescription>Datos principales de la academia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la academia *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              minLength={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="academyType">Tipo de academia *</Label>
            <Select
              id="academyType"
              value={formData.academyType}
              onValueChange={(value) => setFormData({ ...formData, academyType: value })}
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
            <Label htmlFor="disciplineVariant">Especialización *</Label>
            <Select
              id="disciplineVariant"
              value={formData.disciplineVariant}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  disciplineVariant: value,
                  academyType: value.startsWith("artistic") ? "artistica" : value === "rhythmic" ? "ritmica" : formData.academyType,
                })
              }
              className="w-full"
            >
              {DISCIPLINE_VARIANTS.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
            {academy.specializationStatus === "configured" && (
              <p className="text-xs text-muted-foreground">
                Si esta academia ya está operativa, cambiar la especialización puede requerir una migración guiada.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="publicDescription">Descripción pública</Label>
            <Textarea
              id="publicDescription"
              value={formData.publicDescription}
              onChange={(e) => setFormData({ ...formData, publicDescription: e.target.value })}
              placeholder="Describe tu academia para que aparezca en el directorio público..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Esta descripción aparecerá en el directorio público de academias
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isPublic">Visible en directorio público</Label>
              <p className="text-xs text-muted-foreground">
                Permite que tu academia aparezca en el directorio público
              </p>
            </div>
            <Switch
              id="isPublic"
              checked={formData.isPublic}
              onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ubicación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Ubicación
          </CardTitle>
          <CardDescription>Información de localización de la academia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <SearchableSelect
                options={COUNTRY_REGION_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
                value={formData.countryCode.toLowerCase()}
                onChange={(value) => {
                  const countryLabel = COUNTRY_REGION_OPTIONS.find((country) => country.value === value)?.label ?? value;
                  setFormData({
                    ...formData,
                    countryCode: value.toUpperCase(),
                    country: countryLabel,
                    region: "",
                    city: "",
                  });
                }}
                placeholder="Selecciona un país"
                name="country"
                searchPlaceholder="Buscar país..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">{getRegionLabel(formData.countryCode)}</Label>
              <SearchableSelect
                options={regionOptions}
                value={formData.region}
                onChange={(value) => setFormData({ ...formData, region: value, city: "" })}
                disabled={!formData.countryCode || regionOptions.length === 0}
                placeholder={getRegionPlaceholder(formData.countryCode, !!formData.countryCode)}
                name="region"
                searchPlaceholder={`Buscar ${getRegionLabel(formData.countryCode).toLowerCase()}...`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <SearchableSelect
                options={cityOptions}
                value={formData.city}
                onChange={(value) => setFormData({ ...formData, city: value })}
                disabled={!formData.region || cityOptions.length === 0}
                placeholder={getCityPlaceholder(getRegionLabel(formData.countryCode), !!formData.region)}
                name="city"
                searchPlaceholder="Buscar ciudad..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Dirección completa</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Calle, número, código postal..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contacto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Información de contacto
          </CardTitle>
          <CardDescription>Datos de contacto para el directorio público</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Sitio web
              </Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://ejemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Correo de contacto
              </Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="contacto@academia.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Teléfono
              </Label>
              <Input
                id="contactPhone"
                type="tel"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+34 123 456 789"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">URL del logo</Label>
              <Input
                id="logoUrl"
                type="url"
                value={formData.logoUrl}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Redes sociales */}
      <Card>
        <CardHeader>
          <CardTitle>Redes sociales</CardTitle>
          <CardDescription>Enlaces a tus perfiles sociales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="socialInstagram" className="flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                Instagram
              </Label>
              <Input
                id="socialInstagram"
                type="url"
                value={formData.socialInstagram}
                onChange={(e) => setFormData({ ...formData, socialInstagram: e.target.value })}
                placeholder="https://instagram.com/tuacademia"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="socialFacebook" className="flex items-center gap-2">
                <Facebook className="h-4 w-4" />
                Facebook
              </Label>
              <Input
                id="socialFacebook"
                type="url"
                value={formData.socialFacebook}
                onChange={(e) => setFormData({ ...formData, socialFacebook: e.target.value })}
                placeholder="https://facebook.com/tuacademia"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="socialTwitter" className="flex items-center gap-2">
                <Twitter className="h-4 w-4" />
                Twitter / X
              </Label>
              <Input
                id="socialTwitter"
                type="url"
                value={formData.socialTwitter}
                onChange={(e) => setFormData({ ...formData, socialTwitter: e.target.value })}
                placeholder="https://twitter.com/tuacademia"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="socialYoutube" className="flex items-center gap-2">
                <Youtube className="h-4 w-4" />
                YouTube
              </Label>
              <Input
                id="socialYoutube"
                type="url"
                value={formData.socialYoutube}
                onChange={(e) => setFormData({ ...formData, socialYoutube: e.target.value })}
                placeholder="https://youtube.com/@tuacademia"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
