"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ScholarshipFormData {
  athleteId: string;
  name: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface Scholarship {
  id: string;
  athleteId: string;
  athleteName: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

interface ScholarshipFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ScholarshipFormData) => Promise<void>;
  scholarship?: Scholarship | null;
  isLoading?: boolean;
  athletes?: Array<{ id: string; name: string }>;
}

const defaultFormData: ScholarshipFormData = {
  athleteId: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: "",
  isActive: true,
};

export function ScholarshipForm({
  isOpen,
  onClose,
  onSubmit,
  scholarship,
  isLoading = false,
  athletes = [],
}: ScholarshipFormProps) {
  const [formData, setFormData] = useState<ScholarshipFormData>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (scholarship) {
      setFormData({
        athleteId: scholarship.athleteId,
        name: scholarship.name,
        description: scholarship.description || "",
        discountType: scholarship.discountType as "percentage" | "fixed",
        discountValue: scholarship.discountValue.toString(),
        startDate: scholarship.startDate,
        endDate: scholarship.endDate || "",
        isActive: scholarship.isActive,
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
  }, [scholarship, isOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.athleteId) {
      newErrors.athleteId = "Selecciona un atleta";
    }

    if (!formData.name.trim()) {
      newErrors.name = "El nombre es requerido";
    }

    if (!formData.discountValue || parseFloat(formData.discountValue) <= 0) {
      newErrors.discountValue = "El valor del descuento debe ser mayor a 0";
    }

    if (
      formData.discountType === "percentage" &&
      parseFloat(formData.discountValue) > 100
    ) {
      newErrors.discountValue = "El porcentaje no puede ser mayor a 100";
    }

    if (!formData.startDate) {
      newErrors.startDate = "La fecha de inicio es requerida";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {scholarship ? "Editar Beca" : "Nueva Beca"}
          </DialogTitle>
          <DialogDescription>
            {scholarship
              ? "Modifica la información de la beca"
              : "Crea una nueva beca para un atleta"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="athlete">Atleta *</Label>
              {athletes.length > 0 ? (
                <select
                  id="athlete"
                  value={formData.athleteId}
                  onChange={(e) =>
                    setFormData({ ...formData, athleteId: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar atleta...</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="athleteId"
                  value={formData.athleteId}
                  onChange={(e) =>
                    setFormData({ ...formData, athleteId: e.target.value })
                  }
                  placeholder="ID del atleta (UUID)"
                  error={errors.athleteId}
                />
              )}
              {errors.athleteId && (
                <p className="text-xs text-destructive">{errors.athleteId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Beca *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ej: Beca Deportivo Destacado"
                error={errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descripción opcional de la beca"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discountType">Tipo de Beca</Label>
                <select
                  id="discountType"
                  value={formData.discountType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discountType: e.target.value as "percentage" | "fixed",
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="percentage">Parcial (%)</option>
                  <option value="fixed">Cantidad Fija (EUR)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Selecciona &quot;Parcial&quot; para porcentajes o
                  &quot;Fija&quot; para monto fijo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountValue">
                  Valor {formData.discountType === "percentage" ? "(%)" : "(EUR)"} *
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  step="0.01"
                  min="0"
                  max={formData.discountType === "percentage" ? 100 : undefined}
                  value={formData.discountValue}
                  onChange={(e) =>
                    setFormData({ ...formData, discountValue: e.target.value })
                  }
                  placeholder={formData.discountType === "percentage" ? "0-100" : "0.00"}
                  error={errors.discountValue}
                />
                {errors.discountValue && (
                  <p className="text-xs text-destructive">{errors.discountValue}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Fecha Inicio *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  error={errors.startDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Fecha Fin</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
              <Label htmlFor="isActive">Beca activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
