"use client";

import { useState, useEffect } from "react";
import { Palette, Type, Image } from "lucide-react";

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
  data: BrandingData;
  onChange: (data: BrandingData) => void;
  disabled?: boolean;
  preview?: boolean;
}

const DEFAULT_BRANDING: BrandingData = {
  primaryColor: "#3B82F6",
  secondaryColor: "#8B5CF6",
  accentColor: "#10B981",
  fontHeading: "Inter",
  fontBody: "Inter",
  logoUrl: "",
  faviconUrl: "",
};

const FONT_OPTIONS = [
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
          value={value || "#3B82F6"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-10 w-14 cursor-pointer rounded border border-input p-1"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3B82F6"
          disabled={disabled}
          className="flex-1 font-mono"
        />
      </div>
    </div>
  );
}

export function BrandingEditor({ data, onChange, disabled = false, preview = true }: BrandingEditorProps) {
  const [localData, setLocalData] = useState<BrandingData>(data || DEFAULT_BRANDING);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Branding
        </CardTitle>
        <CardDescription>
          Personaliza los colores y tipografía de tu academia
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Colores */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Colores</h4>
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
        <div className="space-y-4 border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Type className="h-4 w-4" />
            Tipografía
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Fuente para encabezados</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        <div className="space-y-4 border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <Image className="h-4 w-4" />
            Logotipos
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>URL del logo</Label>
              <Input
                type="url"
                value={localData.logoUrl}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                disabled={disabled}
              />
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
          <div className="border-t pt-4">
            <h4 className="mb-4 text-sm font-medium">Vista previa</h4>
            <div
              className="rounded-lg border p-6"
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
