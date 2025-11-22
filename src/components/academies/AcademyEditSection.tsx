"use client";

import { useState, useEffect } from "react";
import { Building2, Edit2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcademyEditForm } from "./AcademyEditForm";

interface AcademyEditSectionProps {
  academyId: string;
}

interface AcademyData {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
  academyType: string;
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

export function AcademyEditSection({ academyId }: AcademyEditSectionProps) {
  const [academy, setAcademy] = useState<AcademyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAcademy() {
      try {
        setLoading(true);
        const response = await fetch(`/api/academies/${academyId}`);
        
        if (!response.ok) {
          throw new Error("Error al cargar los datos de la academia");
        }
        
        const data = await response.json();
        setAcademy(data);
      } catch (err: any) {
        setError(err.message || "Error al cargar la academia");
      } finally {
        setLoading(false);
      }
    }

    if (academyId) {
      loadAcademy();
    }
  }, [academyId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Cargando datos de la academia...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !academy) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{error || "No se pudo cargar la academia"}</p>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Editar información de la academia
              </CardTitle>
              <CardDescription>Actualiza los datos de tu academia</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AcademyEditForm
            academy={academy}
            onSaved={() => {
              setEditing(false);
              // Recargar datos
              window.location.reload();
            }}
            onCancel={() => setEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Información de la academia
            </CardTitle>
            <CardDescription>Datos públicos y de contacto de tu academia</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</p>
            <p className="text-sm font-medium text-foreground">{academy.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</p>
            <p className="text-sm font-medium text-foreground">{academy.academyType || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">País</p>
            <p className="text-sm font-medium text-foreground">{academy.country || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Región</p>
            <p className="text-sm font-medium text-foreground">{academy.region || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ciudad</p>
            <p className="text-sm font-medium text-foreground">{academy.city || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible en directorio</p>
            <p className="text-sm font-medium text-foreground">{academy.isPublic ? "Sí" : "No"}</p>
          </div>
        </div>

        {academy.publicDescription && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Descripción pública</p>
            <p className="text-sm text-foreground whitespace-pre-line">{academy.publicDescription}</p>
          </div>
        )}

        {(academy.website || academy.contactEmail || academy.contactPhone || academy.address) && (
          <div className="pt-4 border-t">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Contacto</p>
            <div className="grid gap-2 text-sm">
              {academy.website && (
                <p>
                  <span className="font-medium">Sitio web:</span>{" "}
                  <a href={academy.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {academy.website}
                  </a>
                </p>
              )}
              {academy.contactEmail && (
                <p>
                  <span className="font-medium">Email:</span>{" "}
                  <a href={`mailto:${academy.contactEmail}`} className="text-primary hover:underline">
                    {academy.contactEmail}
                  </a>
                </p>
              )}
              {academy.contactPhone && (
                <p>
                  <span className="font-medium">Teléfono:</span>{" "}
                  <a href={`tel:${academy.contactPhone}`} className="text-primary hover:underline">
                    {academy.contactPhone}
                  </a>
                </p>
              )}
              {academy.address && (
                <p>
                  <span className="font-medium">Dirección:</span> {academy.address}
                </p>
              )}
            </div>
          </div>
        )}

        {(academy.socialInstagram || academy.socialFacebook || academy.socialTwitter || academy.socialYoutube) && (
          <div className="pt-4 border-t">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Redes sociales</p>
            <div className="flex flex-wrap gap-3">
              {academy.socialInstagram && (
                <a href={academy.socialInstagram} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  Instagram
                </a>
              )}
              {academy.socialFacebook && (
                <a href={academy.socialFacebook} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  Facebook
                </a>
              )}
              {academy.socialTwitter && (
                <a href={academy.socialTwitter} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  Twitter
                </a>
              )}
              {academy.socialYoutube && (
                <a href={academy.socialYoutube} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  YouTube
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

