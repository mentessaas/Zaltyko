"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Globe, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CertificationsSection } from "./CertificationsSection";
import { PhotoGallery } from "./PhotoGallery";

interface CoachPublicProfileEditorProps {
  coachId: string;
  academyId: string;
  initialData: {
    isPublic: boolean;
    publicBio: string | null;
    certifications: Array<{
      name: string;
      issuer: string;
      date: string;
      url?: string;
    }>;
    photoGallery: string[] | null;
    achievements: Array<{
      title: string;
      description?: string;
      date?: string;
    }>;
  };
  onSaved?: () => void;
}

export function CoachPublicProfileEditor({
  coachId,
  academyId,
  initialData,
  onSaved,
}: CoachPublicProfileEditorProps) {
  const [isPublic, setIsPublic] = useState(initialData.isPublic);
  const [publicBio, setPublicBio] = useState(initialData.publicBio || "");
  const [certifications, setCertifications] = useState(initialData.certifications);
  const [photoGallery, setPhotoGallery] = useState<string[]>(initialData.photoGallery || []);
  const [achievements, setAchievements] = useState(initialData.achievements);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/coaches/${coachId}/public`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublic,
          publicBio: publicBio || null,
          certifications,
          photoGallery,
          achievements,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Error al guardar perfil");
      }

      setSuccess("Perfil público actualizado correctamente");
      onSaved?.();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Error al guardar perfil");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Configuración de Perfil Público
          </CardTitle>
          <CardDescription>
            Configura qué información será visible en tu perfil público
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-public" className="flex items-center gap-2">
                {isPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Activar perfil público
              </Label>
              <p className="text-sm text-muted-foreground">
                Cuando está activado, tu perfil será visible públicamente
              </p>
            </div>
            <Switch
              id="is-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          {isPublic && (
            <>
              <div className="space-y-2">
                <Label htmlFor="public-bio">Biografía Pública</Label>
                <Textarea
                  id="public-bio"
                  value={publicBio}
                  onChange={(e) => setPublicBio(e.target.value)}
                  placeholder="Escribe una biografía que será visible en tu perfil público..."
                  rows={6}
                  className="resize-none"
                />
                <p className="text-sm text-muted-foreground">
                  Esta biografía será visible en tu perfil público. Puedes usar Markdown básico.
                </p>
              </div>

              <CertificationsSection
                certifications={certifications}
                onChange={setCertifications}
              />

              <PhotoGallery
                photos={photoGallery}
                onChange={setPhotoGallery}
                academyId={academyId}
              />

              <div className="space-y-2">
                <Label>Logros y Reconocimientos</Label>
                <div className="space-y-2">
                  {achievements.map((achievement, index) => (
                    <div key={index} className="flex gap-2 rounded-lg border p-3">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Título del logro"
                          value={achievement.title}
                          onChange={(e) => {
                            const newAchievements = [...achievements];
                            newAchievements[index] = { ...achievement, title: e.target.value };
                            setAchievements(newAchievements);
                          }}
                        />
                        <Textarea
                          placeholder="Descripción (opcional)"
                          value={achievement.description || ""}
                          onChange={(e) => {
                            const newAchievements = [...achievements];
                            newAchievements[index] = { ...achievement, description: e.target.value };
                            setAchievements(newAchievements);
                          }}
                          rows={2}
                        />
                        <Input
                          type="date"
                          placeholder="Fecha (opcional)"
                          value={achievement.date || ""}
                          onChange={(e) => {
                            const newAchievements = [...achievements];
                            newAchievements[index] = { ...achievement, date: e.target.value };
                            setAchievements(newAchievements);
                          }}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAchievements(achievements.filter((_, i) => i !== index));
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAchievements([...achievements, { title: "" }]);
                    }}
                  >
                    Añadir logro
                  </Button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              {success}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar perfil público
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

