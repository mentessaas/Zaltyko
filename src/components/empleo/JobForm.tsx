"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CATEGORIES = [
  { value: "coach", label: "Entrenador" },
  { value: "assistant_coach", label: "Asistente de Entrenador" },
  { value: "administrative", label: "Administrativo" },
  { value: "physiotherapist", label: "Fisioterapeuta" },
  { value: "psychologist", label: "Psicólogo Deportivo" },
  { value: "other", label: "Otro" },
];

const JOB_TYPES = [
  { value: "full_time", label: "Jornada Completa" },
  { value: "part_time", label: "Media Jornada" },
  { value: "internship", label: "Prácticas" },
];

interface JobFormProps {
  academyId?: string;
  userId?: string;
  onSuccess?: () => void;
}

export function JobForm({ academyId, userId, onSuccess }: JobFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: "",
    title: "",
    description: "",
    requirements: "",
    jobType: "full_time",
    salaryMin: "",
    salaryMax: "",
    salaryType: "range",
    howToApply: "external",
    externalUrl: "",
    deadline: "",
    country: "España",
    province: "",
    city: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const salary = formData.salaryType === "contact" ? null : {
        min: formData.salaryMin ? parseInt(formData.salaryMin) : undefined,
        max: formData.salaryMax ? parseInt(formData.salaryMax) : undefined,
        currency: "eur",
        type: formData.salaryType,
      };

      const response = await fetch("/api/empleo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          userId,
          title: formData.title,
          category: formData.category,
          description: formData.description,
          requirements: formData.requirements,
          jobType: formData.jobType,
          salary,
          howToApply: formData.howToApply,
          externalUrl: formData.externalUrl || undefined,
          deadline: formData.deadline || undefined,
          location: formData.city ? {
            country: formData.country,
            province: formData.province,
            city: formData.city,
          } : undefined,
        }),
      });

      if (response.ok) {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/empleo");
        }
      } else {
        const error = await response.json();
        alert(error.message || "Error al crear el puesto");
      }
    } catch (error) {
      console.error(error);
      alert("Error al crear el puesto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category">Categoría *</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })} required>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="jobType">Tipo de contrato *</Label>
          <Select value={formData.jobType} onValueChange={(v) => setFormData({ ...formData, jobType: v })} required>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona tipo" />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="title">Título del puesto *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Ej: Entrenador de Gimnasia Artística"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Descripción del puesto</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe las funciones del puesto..."
          rows={4}
        />
      </div>

      <div>
        <Label htmlFor="requirements">Requisitos</Label>
        <Textarea
          id="requirements"
          value={formData.requirements}
          onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
          placeholder="Requisitos mínimos para el puesto..."
          rows={3}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Salario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tipo de salario</Label>
            <Select value={formData.salaryType} onValueChange={(v) => setFormData({ ...formData, salaryType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fijo</SelectItem>
                <SelectItem value="range">Rango</SelectItem>
                <SelectItem value="contact">Consultar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.salaryType !== "contact" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="salaryMin">Mínimo (€)</Label>
                <Input
                  id="salaryMin"
                  type="number"
                  value={formData.salaryMin}
                  onChange={(e) => setFormData({ ...formData, salaryMin: e.target.value })}
                  placeholder="1200"
                />
              </div>
              <div>
                <Label htmlFor="salaryMax">Máximo (€)</Label>
                <Input
                  id="salaryMax"
                  type="number"
                  value={formData.salaryMax}
                  onChange={(e) => setFormData({ ...formData, salaryMax: e.target.value })}
                  placeholder="1800"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ubicación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="province">Provincia</Label>
              <Input
                id="province"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">Ciudad *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cómo aplicar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Método</Label>
            <Select value={formData.howToApply} onValueChange={(v) => setFormData({ ...formData, howToApply: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">A través de Zaltyko</SelectItem>
                <SelectItem value="external">URL externa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.howToApply === "external" && (
            <div>
              <Label htmlFor="externalUrl">URL externa</Label>
              <Input
                id="externalUrl"
                value={formData.externalUrl}
                onChange={(e) => setFormData({ ...formData, externalUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          )}

          <div>
            <Label htmlFor="deadline">Fecha límite (opcional)</Label>
            <Input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Publicando..." : "Publicar puesto"}
      </Button>
    </form>
  );
}
