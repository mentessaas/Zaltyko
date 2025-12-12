"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Copy, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  currentUses: number;
  isActive: boolean;
}

interface DiscountManagerProps {
  academyId: string;
  initialDiscounts?: Discount[];
}

export function DiscountManager({
  academyId,
  initialDiscounts = [],
}: DiscountManagerProps) {
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
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
  });

  const loadDiscounts = async () => {
    try {
      const response = await fetch(`/api/discounts?academyId=${academyId}`);
      const data = await response.json();
      if (data.items) {
        setDiscounts(data.items);
      }
    } catch (error) {
      console.error("Error loading discounts:", error);
    }
  };

  useEffect(() => {
    if (initialDiscounts.length === 0) {
      loadDiscounts();
    }
  }, [academyId]);

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setFormData({ ...formData, code });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = editingDiscount
        ? `/api/discounts/${editingDiscount.id}`
        : "/api/discounts";
      const method = editingDiscount ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          ...formData,
          discountValue: parseFloat(formData.discountValue),
          minAmount: formData.minAmount ? parseFloat(formData.minAmount) : null,
          maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
          endDate: formData.endDate || null,
          maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
        }),
      });

      if (!response.ok) throw new Error("Error al guardar descuento");

      setIsDialogOpen(false);
      setEditingDiscount(null);
      resetForm();
      loadDiscounts();
    } catch (error) {
      console.error("Error saving discount:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este descuento?")) return;

    try {
      await fetch(`/api/discounts/${id}`, { method: "DELETE" });
      loadDiscounts();
    } catch (error) {
      console.error("Error deleting discount:", error);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    alert("Código copiado al portapapeles");
  };

  const resetForm = () => {
    setFormData({
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
    });
  };

  const openEditDialog = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code || "",
      name: discount.name,
      description: discount.description || "",
      discountType: discount.discountType,
      discountValue: discount.discountValue.toString(),
      applicableTo: discount.applicableTo,
      minAmount: discount.minAmount?.toString() || "",
      maxDiscount: discount.maxDiscount?.toString() || "",
      startDate: discount.startDate,
      endDate: discount.endDate || "",
      maxUses: discount.maxUses?.toString() || "",
      isActive: discount.isActive,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Descuentos</h2>
          <p className="text-muted-foreground mt-1">
            Administra códigos promocionales y descuentos
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Descuento
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {discounts.map((discount) => (
          <Card key={discount.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{discount.name}</CardTitle>
                  {discount.code && (
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {discount.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyCode(discount.code!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </CardDescription>
                  )}
                </div>
                <Badge variant={discount.isActive ? "default" : "outline"}>
                  {discount.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Descuento: </span>
                  {discount.discountType === "percentage"
                    ? `${discount.discountValue}%`
                    : `${discount.discountValue} €`}
                </div>
                <div>
                  <span className="font-medium">Usos: </span>
                  {discount.currentUses}
                  {discount.maxUses && ` / ${discount.maxUses}`}
                </div>
                <div>
                  <span className="font-medium">Desde: </span>
                  {format(new Date(discount.startDate), "PPP", { locale: es })}
                </div>
                {discount.endDate && (
                  <div>
                    <span className="font-medium">Hasta: </span>
                    {format(new Date(discount.endDate), "PPP", { locale: es })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(discount)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(discount.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDiscount ? "Editar Descuento" : "Nuevo Descuento"}
            </DialogTitle>
            <DialogDescription>
              {editingDiscount
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
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="Ej: VERANO2024"
                    />
                    <Button type="button" variant="outline" onClick={generateCode}>
                      Generar
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
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
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discount-type">Tipo</Label>
                  <select
                    id="discount-type"
                    value={formData.discountType}
                    onChange={(e) =>
                      setFormData({ ...formData, discountType: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="percentage">Porcentaje</option>
                    <option value="fixed">Cantidad Fija</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount-value">Valor *</Label>
                  <Input
                    id="discount-value"
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) =>
                      setFormData({ ...formData, discountValue: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-discount">Descuento Máximo</Label>
                  <Input
                    id="max-discount"
                    type="number"
                    step="0.01"
                    value={formData.maxDiscount}
                    onChange={(e) =>
                      setFormData({ ...formData, maxDiscount: e.target.value })
                    }
                    placeholder="Solo para %"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="min-amount">Monto Mínimo</Label>
                  <Input
                    id="min-amount"
                    type="number"
                    step="0.01"
                    value={formData.minAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, minAmount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-uses">Usos Máximos</Label>
                  <Input
                    id="max-uses"
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) =>
                      setFormData({ ...formData, maxUses: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Fecha Inicio *</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">Fecha Fin</Label>
                  <Input
                    id="end-date"
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
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
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
    </div>
  );
}

