"use client";

import { Instagram, Facebook, Twitter, Youtube, Globe, Mail, Phone, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface SocialLinksData {
  website: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  socialInstagram: string;
  socialFacebook: string;
  socialTwitter: string;
  socialYoutube: string;
  logoUrl?: string;
}

interface SocialLinksEditorProps {
  data: SocialLinksData;
  onChange: (data: SocialLinksData) => void;
  disabled?: boolean;
}

export function SocialLinksEditor({ data, onChange, disabled = false }: SocialLinksEditorProps) {
  const handleChange = (field: keyof SocialLinksData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Información de contacto
        </CardTitle>
        <CardDescription>Datos de contacto para tus clientes y directorio público</CardDescription>
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
              value={data.website}
              onChange={(e) => handleChange("website", e.target.value)}
              placeholder="https://ejemplo.com"
              disabled={disabled}
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
              value={data.contactEmail}
              onChange={(e) => handleChange("contactEmail", e.target.value)}
              placeholder="contacto@academia.com"
              disabled={disabled}
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
              value={data.contactPhone}
              onChange={(e) => handleChange("contactPhone", e.target.value)}
              placeholder="+34 123 456 789"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl">URL del logo</Label>
            <Input
              id="logoUrl"
              type="url"
              value={data.logoUrl || ""}
              onChange={(e) => handleChange("logoUrl", e.target.value)}
              placeholder="https://ejemplo.com/logo.png"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Dirección completa
          </Label>
          <Input
            id="address"
            value={data.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Calle, número, código postal, ciudad..."
            disabled={disabled}
          />
        </div>

        <div className="border-t pt-4">
          <h4 className="mb-4 text-sm font-medium">Redes sociales</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="socialInstagram" className="flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                Instagram
              </Label>
              <Input
                id="socialInstagram"
                type="url"
                value={data.socialInstagram}
                onChange={(e) => handleChange("socialInstagram", e.target.value)}
                placeholder="https://instagram.com/tuacademia"
                disabled={disabled}
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
                value={data.socialFacebook}
                onChange={(e) => handleChange("socialFacebook", e.target.value)}
                placeholder="https://facebook.com/tuacademia"
                disabled={disabled}
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
                value={data.socialTwitter}
                onChange={(e) => handleChange("socialTwitter", e.target.value)}
                placeholder="https://twitter.com/tuacademia"
                disabled={disabled}
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
                value={data.socialYoutube}
                onChange={(e) => handleChange("socialYoutube", e.target.value)}
                placeholder="https://youtube.com/@tuacademia"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
