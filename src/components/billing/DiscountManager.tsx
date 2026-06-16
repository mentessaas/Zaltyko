"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DiscountList, Discount } from "./DiscountList";
import { DiscountForm } from "./DiscountForm";

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

  const handleSubmit = async (formData: any) => {
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

  const handleToggleActive = async (discount: Discount) => {
    try {
      await fetch(`/api/discounts/${discount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !discount.isActive,
        }),
      });
      loadDiscounts();
    } catch (error) {
      console.error("Error toggling discount:", error);
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
