"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScholarshipList, Scholarship } from "./ScholarshipList";
import { ScholarshipForm } from "./ScholarshipForm";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";
import { logger } from "@/lib/logger";

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  terminology?: Record<string, string>;
}

interface ScholarshipManagerProps {
  academyId: string;
  initialScholarships?: Scholarship[];
  sportConfigs?: SportConfigOption[];
}

export function ScholarshipManager({
  academyId,
  initialScholarships = [],
  sportConfigs = [],
}: ScholarshipManagerProps) {
  const [scholarships, setScholarships] = useState<Scholarship[]>(initialScholarships);
  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [sportConfigId, setSportConfigId] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScholarship, setEditingScholarship] = useState<Scholarship | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const terms = getTerminologyForSportConfig(sportConfigs, sportConfigId);
  const athletesTermLower = terms.athletes.toLowerCase();

  const loadScholarships = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        ...(sportConfigId && { sportConfigId }),
      });
      const response = await fetch(`/api/scholarships?${params}`);
      const data = await response.json();
      const payload = data.data ?? data;
      if (payload.items) {
        setScholarships(payload.items);
      }
    } catch (error) {
      logger.error("Error loading scholarships:", error);
    }
  };

  const loadAthletes = async () => {
    try {
      const params = new URLSearchParams({
        academyId,
        limit: "1000",
        ...(sportConfigId && { sportConfigId }),
      });
      const response = await fetch(`/api/athletes?${params}`);
      const data = await response.json();
      const payload = data.data ?? data;
      setAthletes(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      logger.error("Error loading scholarship athletes:", error);
      setAthletes([]);
    }
  };

  useEffect(() => {
    loadScholarships();
    loadAthletes();
  }, [academyId, sportConfigId]);

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
      logger.error("Error saving scholarship:", error);
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
      logger.error("Error deleting scholarship:", error);
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
      logger.error("Error toggling scholarship:", error);
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
            Administra las becas otorgadas a {athletesTermLower}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={sportConfigId}
            onChange={(event) => setSportConfigId(event.target.value)}
            className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas las ramas</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Beca
          </Button>
        </div>
      </div>

      <ScholarshipList
        scholarships={scholarships}
        terminology={terms}
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
        athletes={athletes}
        terminology={terms}
      />
    </div>
  );
}
