"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
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

interface ScholarshipManagerProps {
  academyId: string;
  initialScholarships?: Scholarship[];
}

export function ScholarshipManager({
  academyId,
  initialScholarships = [],
}: ScholarshipManagerProps) {
  const [scholarships, setScholarships] = useState<Scholarship[]>(initialScholarships);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScholarship, setEditingScholarship] = useState<Scholarship | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    athleteId: "",
    name: "",
    description: "",
    discountType: "percentage",
    discountValue: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    isActive: true,
  });

  const loadScholarships = async () => {
    try {
      const response = await fetch(`/api/scholarships?academyId=${academyId}`);
      const data = await response.json();
      if (data.items) {
        setScholarships(data.items);
      }
    } catch (error) {
      console.error("Error loading scholarships:", error);
    }
  };

  useEffect(() => {
    if (initialScholarships.length === 0) {
      loadScholarships();
    }
  }, [academyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = editingScholarship
        ? `/api/scholarships/${editingScholarship.id}`
        : "/api/scholarships";
      const method = editingScholarship ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academyId,
          ...formData,
          discountValue: parseFloat(formData.discountValue),
          endDate: formData.endDate || null,
        }),
      });

      if (!response.ok) throw new Error("Error al guardar beca");

      setIsDialogOpen(false);
      setEditingScholarship(null);
      resetForm();
      loadScholarships();
    } catch (error) {
      console.error("Error saving scholarship:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta beca?")) return;

    try {
      await fetch(`/api/scholarships/${id}`, { method: "DELETE" });
      loadScholarships();
    } catch (error) {
      console.error("Error deleting scholarship:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      athleteId: "",
      name: "",
      description: "",
      discountType: "percentage",
      discountValue: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      isActive: true,
    });
  };

  const openEditDialog = (scholarship: Scholarship) => {
    setEditingScholarship(scholarship);
    setFormData({
      athleteId: scholarship.athleteId,
      name: scholarship.name,
      description: scholarship.description || "",
      discountType: scholarship.discountType,
      discountValue: scholarship.discountValue.toString(),
      startDate: scholarship.startDate,
      endDate: scholarship.endDate || "",
      isActive: scholarship.isActive,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Becas</h2>
          <p className="text-muted-foreground mt-1">
            Administra las becas otorgadas a atletas
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Beca
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scholarships.map((scholarship) => (
          <Card key={scholarship.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{scholarship.name}</CardTitle>
                  <CardDescription>{scholarship.athleteName}</CardDescription>
                </div>
                <Badge variant={scholarship.isActive ? "default" : "secondary"}>
                  {scholarship.isActive ? "Activa" : "Inactiva"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Descuento: </span>
                  {scholarship.discountType === "percentage"
                    ? `${scholarship.discountValue}%`
                    : `${scholarship.discountValue} €`}
                </div>
                <div>
                  <span className="font-medium">Desde: </span>
                  {format(new Date(scholarship.startDate), "PPP", { locale: es })}
                </div>
                {scholarship.endDate && (
                  <div>
                    <span className="font-medium">Hasta: </span>
                    {format(new Date(scholarship.endDate), "PPP", { locale: es })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(scholarship)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(scholarship.id)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingScholarship ? "Editar Beca" : "Nueva Beca"}
            </DialogTitle>
            <DialogDescription>
              {editingScholarship
                ? "Modifica la información de la beca"
                : "Crea una nueva beca para un atleta"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="athlete-id">ID de Atleta *</Label>
                <Input
                  id="athlete-id"
                  value={formData.athleteId}
                  onChange={(e) =>
                    setFormData({ ...formData, athleteId: e.target.value })
                  }
                  required
                  placeholder="UUID del atleta"
                />
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
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="discount-type">Tipo de Descuento</Label>
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
                  <Label htmlFor="discount-value">Valor del Descuento *</Label>
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
                  <Label htmlFor="end-date">Fecha Fin (opcional)</Label>
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

