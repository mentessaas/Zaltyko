"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScholarshipList, Scholarship } from "./ScholarshipList";
import { ScholarshipForm } from "./ScholarshipForm";

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

  const handleSubmit = async (formData: any) => {
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

  const handleToggleActive = async (scholarship: Scholarship) => {
    try {
      await fetch(`/api/scholarships/${scholarship.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: !scholarship.isActive,
        }),
      });
      loadScholarships();
    } catch (error) {
      console.error("Error toggling scholarship:", error);
    }
  };

  const openEditDialog = (scholarship: Scholarship) => {
    setEditingScholarship(scholarship);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingScholarship(null);
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

      <ScholarshipList
        scholarships={scholarships}
        onEdit={openEditDialog}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
      />

      <ScholarshipForm
        isOpen={isDialogOpen}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        scholarship={editingScholarship}
        isLoading={isSaving}
      />
    </div>
  );
}
