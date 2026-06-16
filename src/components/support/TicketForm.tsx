"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketPriority, TicketCategory } from "./TicketFilters";

interface TicketFormProps {
  academyId: string;
  onSubmit?: (data: TicketFormData) => Promise<void>;
}

interface TicketFormData {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

const categoryOptions: { value: TicketCategory; label: string; description: string }[] = [
  { value: "technical", label: "Técnico", description: "Problemas técnicos, errores, bugs" },
  { value: "billing", label: "Facturación", description: "Pagos, facturas, cobros" },
  { value: "account", label: "Cuenta", description: "Problemas de acceso, configuración" },
  { value: "feature_request", label: "Solicitud de Función", description: "Nuevas funcionalidades" },
  { value: "other", label: "Otro", description: "Otras consultas" },
];

const priorityOptions: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Baja - Sin prisa" },
  { value: "medium", label: "Media - Normal" },
  { value: "high", label: "Alta - Importante" },
  { value: "urgent", label: "Urgente - Crítico" },
];

export function TicketForm({ academyId, onSubmit }: TicketFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<TicketFormData>({
    title: "",
    description: "",
    category: "technical",
    priority: "medium",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (!formData.title.trim() || !formData.description.trim()) {
        throw new Error("Por favor completa todos los campos");
      }

      if (onSubmit) {
        await onSubmit(formData);
      } else {
        const response = await fetch(`/api/support/tickets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formData,
            academyId,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Error al crear el ticket");
        }

        const ticket = await response.json();
        router.push(`/support/${ticket.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Crear nuevo ticket</CardTitle>
        <CardDescription>
          Describe tu problema o consulta. Te responderemos lo antes posible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              placeholder="Breve descripción del problema"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoría</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as TicketCategory })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Prioridad</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value as TicketPriority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              placeholder="Describe detalladamente tu problema o consulta..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={6}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Enviando..." : "Crear ticket"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
