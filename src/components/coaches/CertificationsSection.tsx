"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Award, Trash2 } from "lucide-react";

interface Certification {
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

interface CertificationsSectionProps {
  certifications: Certification[];
  onChange: (certifications: Certification[]) => void;
}

export function CertificationsSection({
  certifications,
  onChange,
}: CertificationsSectionProps) {
  const updateCertification = (index: number, field: keyof Certification, value: string) => {
    const updated = [...certifications];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeCertification = (index: number) => {
    onChange(certifications.filter((_, i) => i !== index));
  };

  const addCertification = () => {
    onChange([...certifications, { name: "", issuer: "", date: "" }]);
  };

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2">
        <Award className="h-4 w-4" />
        Certificaciones
      </Label>
      <div className="space-y-3">
        {certifications.map((cert, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`cert-name-${index}`}>Nombre de la certificación *</Label>
                    <Input
                      id={`cert-name-${index}`}
                      value={cert.name}
                      onChange={(e) => updateCertification(index, "name", e.target.value)}
                      placeholder="Ej: Entrenador Nivel 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`cert-issuer-${index}`}>Emisor *</Label>
                    <Input
                      id={`cert-issuer-${index}`}
                      value={cert.issuer}
                      onChange={(e) => updateCertification(index, "issuer", e.target.value)}
                      placeholder="Ej: Federación Española de Gimnasia"
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`cert-date-${index}`}>Fecha *</Label>
                    <Input
                      id={`cert-date-${index}`}
                      type="date"
                      value={cert.date}
                      onChange={(e) => updateCertification(index, "date", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`cert-url-${index}`}>URL (opcional)</Label>
                    <Input
                      id={`cert-url-${index}`}
                      type="url"
                      value={cert.url || ""}
                      onChange={(e) => updateCertification(index, "url", e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeCertification(index)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" onClick={addCertification}>
          <Award className="mr-2 h-4 w-4" />
          Añadir certificación
        </Button>
      </div>
    </div>
  );
}

