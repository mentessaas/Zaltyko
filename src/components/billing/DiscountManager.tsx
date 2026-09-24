"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DiscountList, Discount } from "./DiscountList";
import { DiscountForm } from "./DiscountForm";
import { logger } from "@/lib/logger";

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
  const [error, setError] = useState<string | null>(null);

  const loadDiscounts = async () => {
    try {
      const response = await fetch(`/api/discounts?academyId=${academyId}`);
      const payload = await response.json();
      const data = payload?.data ?? payload;
      const items = Array.isArray(data) ? data : data?.items;
      if (items) {
        setDiscounts(items);
      }
    } catch (error) {
      logger.error("Error loading discounts:", error);
    }
  };

  useEffect(() => {
    if (initialDiscounts.length === 0) {
      loadDiscounts();
    }
  }, [academyId]);

  const handleSubmit = async (formData: any) => {
    setIsSaving(true);
    setError(null);

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
      loadDiscounts();
    } catch (error) {
      logger.error("Error saving discount:", error);
      setError(error instanceof Error ? error.message : "No se pudo guardar el descuento.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este descuento?")) return;

    try {
      const response = await fetch(`/api/discounts/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar el descuento.");
      loadDiscounts();
    } catch (error) {
      logger.error("Error deleting discount:", error);
      setError(error instanceof Error ? error.message : "No se pudo eliminar el descuento.");
    }
  };

  const handleToggleActive = async (discount: Discount) => {
    try {
      const response = await fetch(`/api/discounts/${discount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !discount.isActive,
        }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar el estado del descuento.");
      loadDiscounts();
    } catch (error) {
      logger.error("Error toggling discount:", error);
      setError(error instanceof Error ? error.message : "No se pudo actualizar el descuento.");
    }
  };

  const openEditDialog = (discount: Discount) => {
    setEditingDiscount(discount);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingDiscount(null);
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

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" className="font-semibold underline" onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      <DiscountList
        discounts={discounts}
        onEdit={openEditDialog}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
      />

      <DiscountForm
        isOpen={isDialogOpen}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        discount={editingDiscount}
        isLoading={isSaving}
      />
    </div>
  );
}
