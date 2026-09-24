"use client";

import { useState, useEffect, useRef } from "react";
import { Palette, Type, Image, Loader2, Upload } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface BrandingData {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoUrl: string;
  faviconUrl: string;
}

interface BrandingEditorProps {
  academyId: string;
  data: BrandingData;
  onChange: (data: BrandingData) => void;
  disabled?: boolean;
  preview?: boolean;
}

const DEFAULT_BRANDING: BrandingData = {
  primaryColor: "#1FC7B6",
  secondaryColor: "#2B2E83",
  accentColor: "#FF6B57",
  fontHeading: "Space Grotesk",
  fontBody: "Inter",
  logoUrl: "",
  faviconUrl: "",
};

const FONT_OPTIONS = [
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Poppins", label: "Poppins" },
  { value: "Raleway", label: "Raleway" },
  { value: "Nunito", label: "Nunito" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Merriweather", label: "Merriweather" },
];

function ColorPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || "#1FC7B6"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded border border-input p-1"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1FC7B6"
          disabled={disabled}
          className="flex-1 font-mono"
        />
      </div>
    </div>
  );
}

export function BrandingEditor({ academyId, data, onChange, disabled = false, preview = true }: BrandingEditorProps) {
  const [localData, setLocalData] = useState<BrandingData>(data || DEFAULT_BRANDING);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      setLocalData(data);
    }
  }, [data]);

  const handleChange = (field: keyof BrandingData, value: string) => {
    const newData = { ...localData, [field]: value };
    setLocalData(newData);
    onChange(newData);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const acceptedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    if (!acceptedTypes.has(file.type)) {
      setUploadError("El logo debe ser JPG, PNG, GIF o WebP.");
      return;
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setUploadError("El logo no puede superar los 5 MB.");
      return;
    }

    setIsUploadingLogo(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("academyId", academyId);
      body.append("folder", "academy-logo");
      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || "No se pudo subir el logo");
      const url = payload?.data?.url ?? payload?.url;
      if (typeof url !== "string" || !url) throw new Error("El servidor no devolvió la URL del logo");
      handleChange("logoUrl", url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "No se pudo subir el logo");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-foreground">
          <Palette className="h-5 w-5 text-zaltyko-teal" />
          Branding
        </CardTitle>
        <CardDescription>
          Personaliza los colores y tipografía de tu academia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Colores */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-foreground">Colores</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <ColorPicker
              label="Color primario"
              value={localData.primaryColor}
              onChange={(value) => handleChange("primaryColor", value)}
              disabled={disabled}
            />
            <ColorPicker
              label="Color secundario"
              value={localData.secondaryColor}
              onChange={(value) => handleChange("secondaryColor", value)}
              disabled={disabled}
            />
            <ColorPicker
              label="Color de acento"
              value={localData.accentColor}
              onChange={(value) => handleChange("accentColor", value)}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Tipografía */}
        <div className="space-y-4 border-t border-border pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Type className="h-4 w-4 text-zaltyko-indigo" />
            Tipografía
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Fuente para encabezados</Label>
              <select
                className="w-full rounded-card border border-border bg-card px-3 py-2 text-sm"
                value={localData.fontHeading}
                onChange={(e) => handleChange("fontHeading", e.target.value)}
                disabled={disabled}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Fuente para texto</Label>
              <select
                className="w-full rounded-card border border-border bg-card px-3 py-2 text-sm"
                value={localData.fontBody}
                onChange={(e) => handleChange("fontBody", e.target.value)}
                disabled={disabled}
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Logos */}
        <div className="space-y-4 border-t border-border pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Image className="h-4 w-4 text-zaltyko-indigo" />
            Logotipos
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Logo de la academia</Label>
              <div className="flex items-center gap-3">
                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleLogoUpload} className="hidden" disabled={disabled || isUploadingLogo} />
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={disabled || isUploadingLogo}>
                  {isUploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {isUploadingLogo ? "Subiendo…" : "Subir logo"}
                </Button>
                <span className="text-xs text-muted-foreground">JPG, PNG, GIF o WebP · máximo 5 MB</span>
              </div>
              <Input
                type="url"
                value={localData.logoUrl}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                disabled={disabled}
              />
              {uploadError ? <p className="text-xs text-destructive" role="alert">{uploadError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>URL del favicon</Label>
              <Input
                type="url"
                value={localData.faviconUrl}
                onChange={(e) => handleChange("faviconUrl", e.target.value)}
                placeholder="https://ejemplo.com/favicon.ico"
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* Preview en tiempo real */}
        {preview && (
          <div className="border-t border-border pt-4">
            <h4 className="mb-4 text-sm font-medium text-foreground">Vista previa</h4>
            <div
              className="rounded-2xl border border-border bg-zaltyko-warm-white p-6"
              style={{
                fontFamily: localData.fontBody,
              }}
            >
              <div className="mb-4 flex items-center gap-4">
                {localData.logoUrl ? (
                  <img
                    src={localData.logoUrl}
                    alt="Logo"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded text-white"
                    style={{ backgroundColor: localData.primaryColor }}
                  >
                    Logo
                  </div>
                )}
                <div>
                  <h3
                    className="text-xl font-bold"
                    style={{
                      fontFamily: localData.fontHeading,
                      color: localData.primaryColor,
                    }}
                  >
                    Nombre de la Academia
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Subtítulo de ejemplo
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div
                  className="inline-block rounded px-3 py-1 text-sm text-white"
                  style={{ backgroundColor: localData.primaryColor }}
                >
                  Botón primario
                </div>
                <div
                  className="inline-block rounded px-3 py-1 text-sm text-white"
                  style={{ backgroundColor: localData.secondaryColor }}
                >
                  Botón secundario
                </div>
                <div
                  className="inline-block rounded px-3 py-1 text-sm text-white"
                  style={{ backgroundColor: localData.accentColor }}
                >
                  Botón acento
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
