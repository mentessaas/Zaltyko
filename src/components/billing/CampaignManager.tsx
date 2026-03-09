"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";

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
import { CampaignList, Campaign } from "./CampaignList";
import { Discount } from "./DiscountList";

interface CampaignManagerProps {
  academyId: string;
  initialCampaigns?: Campaign[];
}

export function CampaignManager({
  academyId,
  initialCampaigns = [],
}: CampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    discountId: "",
    name: "",
    description: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    maxUses: "",
    isActive: true,
  });

  const loadCampaigns = async () => {
    try {
      const response = await fetch(`/api/discounts/campaigns?academyId=${academyId}`);
      const data = await response.json();
      if (data.items) {
        setCampaigns(data.items);
      }
    } catch (error) {
      console.error("Error loading campaigns:", error);
    }
  };

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
    if (initialCampaigns.length === 0) {
      loadCampaigns();
    }
    loadDiscounts();
  }, [academyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = editingCampaign
        ? `/api/discounts/campaigns/${editingCampaign.id}`
        : "/api/discounts/campaigns";
      const method = editingCampaign ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          ...formData,
          endDate: formData.endDate || null,
          maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
        }),
      });

      if (!response.ok) throw new Error("Error al guardar campaña");

      setIsDialogOpen(false);
      setEditingCampaign(null);
      resetForm();
      loadCampaigns();
    } catch (error) {
      console.error("Error saving campaign:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta campaña?")) return;

    try {
      await fetch(`/api/discounts/campaigns/${id}`, { method: "DELETE" });
      loadCampaigns();
    } catch (error) {
      console.error("Error deleting campaign:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      discountId: "",
      name: "",
      description: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      maxUses: "",
      isActive: true,
    });
  };

  const openEditDialog = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      discountId: campaign.discountId,
      name: campaign.name,
      description: campaign.description || "",
      startDate: campaign.startDate,
      endDate: campaign.endDate || "",
      maxUses: campaign.maxUses?.toString() || "",
      isActive: campaign.isActive,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campañas de Descuentos</h2>
          <p className="text-muted-foreground mt-1">
            Administra campañas promocionales con códigos y límites de uso
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Campaña
        </Button>
      </div>

      <CampaignList
        campaigns={campaigns}
        onEdit={openEditDialog}
        onDelete={handleDelete}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? "Editar Campaña" : "Nueva Campaña"}
            </DialogTitle>
            <DialogDescription>
              {editingCampaign
                ? "Modifica la información de la campaña"
                : "Crea una nueva campaña promocional"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Campaña *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej: Promoción de Verano 2024"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountId">Descuento Asociado *</Label>
                <select
                  id="discountId"
                  value={formData.discountId}
                  onChange={(e) =>
                    setFormData({ ...formData, discountId: e.target.value })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Seleccionar descuento...</option>
                  {discounts.map((discount) => (
                    <option key={discount.id} value={discount.id}>
                      {discount.name}
                      {discount.code && ` (${discount.code})`} -{" "}
                      {discount.discountType === "percentage"
                        ? `${discount.discountValue}%`
                        : `${discount.discountValue} EUR`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Descripción opcional de la campaña"
                />
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
                    required
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
                  <Label htmlFor="isActive">Campaña activa</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
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
