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

interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  applicableTo: "all" | "specific" | "level";
  levelId?: string;
  minAmount: string;
  maxDiscount: string;
  startDate: string;
  endDate: string;
  maxUses: string;
  isActive: boolean;
}

interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicableTo: string;
  minAmount: number | null;
  maxDiscount: number | null;
  startDate: string;
  endDate: string | null;
  maxUses: number | null;
  isActive: boolean;
}

interface DiscountFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DiscountFormData) => Promise<void>;
  discount?: Discount | null;
  isLoading?: boolean;
}

const defaultFormData: DiscountFormData = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  applicableTo: "all",
  minAmount: "",
  maxDiscount: "",
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: "",
  maxUses: "",
  isActive: true,
};

export function DiscountForm({
  isOpen,
  onClose,
  onSubmit,
  discount,
  isLoading = false,
}: DiscountFormProps) {
  const [formData, setFormData] = useState<DiscountFormData>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (discount) {
      setFormData({
        code: discount.code || "",
        name: discount.name,
        description: discount.description || "",
        discountType: discount.discountType as "percentage" | "fixed",
        discountValue: discount.discountValue.toString(),
        applicableTo: discount.applicableTo as "all" | "specific" | "level",
        minAmount: discount.minAmount?.toString() || "",
        maxDiscount: discount.maxDiscount?.toString() || "",
        startDate: discount.startDate,
        endDate: discount.endDate || "",
        maxUses: discount.maxUses?.toString() || "",
        isActive: discount.isActive,
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
  }, [discount, isOpen]);

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setFormData({ ...formData, code });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

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

    if (formData.minAmount && parseFloat(formData.minAmount) < 0) {
      newErrors.minAmount = "El monto mínimo no puede ser negativo";
    }

    if (formData.maxDiscount && parseFloat(formData.maxDiscount) < 0) {
      newErrors.maxDiscount = "El descuento máximo no puede ser negativo";
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {discount ? "Editar Descuento" : "Nuevo Descuento"}
          </DialogTitle>
          <DialogDescription>
            {discount
              ? "Modifica la información del descuento"
              : "Crea un nuevo código promocional o descuento"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Código Promocional</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Ej: VERANO2024"
                    className="uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateCode}
                  >
                    Generar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dejar vacío para descuentos sin código
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej: Descuento de Verano"
                  error={errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descripción opcional del descuento"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="discount-type">Tipo</Label>
                <select
                  id="discount-type"
                  value={formData.discountType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discountType: e.target.value as "percentage" | "fixed",
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Cantidad Fija (EUR)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-value">
                  Valor {formData.discountType === "percentage" ? "(%)" : "(EUR)"} *
                </Label>
                <Input
                  id="discount-value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.discountValue}
                  onChange={(e) =>
                    setFormData({ ...formData, discountValue: e.target.value })
                  }
                  error={errors.discountValue}
                />
                {errors.discountValue && (
                  <p className="text-xs text-destructive">{errors.discountValue}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="applicableTo">Aplicar a</Label>
                <select
                  id="applicableTo"
                  value={formData.applicableTo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      applicableTo: e.target.value as "all" | "specific" | "level",
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todos los clientes</option>
                  <option value="specific">Cliente específico</option>
                  <option value="level">Por nivel</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="minAmount">Monto Mínimo (EUR)</Label>
                <Input
                  id="minAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, minAmount: e.target.value })
                  }
                  placeholder="Monto mínimo para aplicar"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxDiscount">
                  Descuento Máximo (EUR)
                  {formData.discountType === "percentage" && " (para %)"}
                </Label>
                <Input
                  id="maxDiscount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.maxDiscount}
                  onChange={(e) =>
                    setFormData({ ...formData, maxDiscount: e.target.value })
                  }
                  placeholder="Límite de descuento"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxUses">Límite de Usos</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  value={formData.maxUses}
                  onChange={(e) =>
                    setFormData({ ...formData, maxUses: e.target.value })
                  }
                  placeholder="Sin límite si se deja vacío"
                />
              </div>
              <div className="space-y-2 flex items-center gap-2 pt-6">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">Descuento activo</Label>
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
