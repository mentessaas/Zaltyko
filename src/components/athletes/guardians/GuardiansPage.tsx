"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { GuardiansSection } from "./GuardiansSection";
import type { GuardianSummary, GuardianFormData } from "@/types/athlete-edit";

interface GuardiansPageProps {
  academyId: string;
  athleteId: string;
  athleteName: string;
  academyName: string;
  guardians: GuardianSummary[];
}

export function GuardiansPage({
  academyId,
  athleteId,
  athleteName,
  academyName,
  guardians: initialGuardians,
}: GuardiansPageProps) {
  const router = useRouter();
  const [guardians, setGuardians] = useState<GuardianSummary[]>(initialGuardians);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardianForm, setGuardianForm] = useState<GuardianFormData>({
    name: "",
    email: "",
    phone: "",
    relationship: "",
    notifyEmail: true,
    notifySms: false,
  });
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editingGuardianForm, setEditingGuardianForm] = useState<GuardianFormData & { isPrimary: boolean }>({
    name: "",
    email: "",
    phone: "",
    relationship: "",
    notifyEmail: true,
    notifySms: false,
    isPrimary: false,
  });
  const [isSavingGuardian, setIsSavingGuardian] = useState(false);

  const handleGuardianFormChange = useCallback((updates: Partial<GuardianFormData>) => {
    setGuardianForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleEditingFormChange = useCallback((updates: Partial<GuardianFormData & { isPrimary: boolean }>) => {
    setEditingGuardianForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleAddGuardian = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsSavingGuardian(true);
      setGuardianError(null);

      try {
        const response = await fetch("/api/guardians", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            academyId,
            guardian: guardianForm,
            athleteIds: [athleteId],
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear guardián");
        }

        // Refresh guardians
        const refreshResponse = await fetch(
          `/api/guardians?athleteId=${athleteId}&academyId=${academyId}`
        );
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setGuardians(data.items || []);
        }

        setGuardianForm({
          name: "",
          email: "",
          phone: "",
          relationship: "",
          notifyEmail: true,
          notifySms: false,
        });
      } catch (error) {
        setGuardianError(error instanceof Error ? error.message : "Error desconocido");
      } finally {
        setIsSavingGuardian(false);
      }
    },
    [academyId, athleteId, guardianForm]
  );

  const handleEditGuardian = useCallback((guardian: GuardianSummary) => {
    setEditingGuardianId(guardian.linkId);
    setEditingGuardianForm({
      name: guardian.name || "",
      email: guardian.email || "",
      phone: guardian.phone || "",
      relationship: guardian.linkRelationship || "",
      notifyEmail: guardian.notifyEmail ?? true,
      notifySms: guardian.notifySms ?? false,
      isPrimary: guardian.isPrimary ?? false,
    });
  }, []);

  const handleUpdateGuardian = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingGuardianId) return;

      setIsSavingGuardian(true);
      setGuardianError(null);

      try {
        // Find the guardian to update
        const guardian = guardians.find((g) => g.linkId === editingGuardianId);
        if (!guardian) throw new Error("Guardian not found");

        const response = await fetch(`/api/guardians/${guardian.guardianId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editingGuardianForm.name,
            email: editingGuardianForm.email,
            phone: editingGuardianForm.phone,
            relationship: editingGuardianForm.relationship,
            notifyEmail: editingGuardianForm.notifyEmail,
            notifySms: editingGuardianForm.notifySms,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar guardián");
        }

        // Refresh guardians
        const refreshResponse = await fetch(
          `/api/guardians?athleteId=${athleteId}&academyId=${academyId}`
        );
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setGuardians(data.items || []);
        }

        setEditingGuardianId(null);
      } catch (error) {
        setGuardianError(error instanceof Error ? error.message : "Error desconocido");
      } finally {
        setIsSavingGuardian(false);
      }
    },
    [academyId, athleteId, editingGuardianId, editingGuardianForm, guardians]
  );

  const handleRemoveGuardian = useCallback(
    async (linkId: string) => {
      if (!confirm("¿Estás seguro de que quieres eliminar este contacto?")) return;

      setIsSavingGuardian(true);
      setGuardianError(null);

      try {
        // Find the guardian link to get the guardian ID
        const guardian = guardians.find((g) => g.linkId === linkId);
        if (!guardian) throw new Error("Guardian not found");

        const response = await fetch(
          `/api/guardians/${guardian.guardianId}?athleteId=${athleteId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al eliminar guardián");
        }

        // Refresh guardians
        const refreshResponse = await fetch(
          `/api/guardians?athleteId=${athleteId}&academyId=${academyId}`
        );
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setGuardians(data.items || []);
        }
      } catch (error) {
        setGuardianError(error instanceof Error ? error.message : "Error desconocido");
      } finally {
        setIsSavingGuardian(false);
      }
    },
    [academyId, athleteId, guardians]
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/app/${academyId}/athletes/${athleteId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a {athleteName}
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Contactos Familiares</h1>
        <p className="text-muted-foreground">
          Gestiona los tutores y contactos de {athleteName} en {academyName}
        </p>
      </div>

      <GuardiansSection
        guardians={guardians}
        guardiansLoading={guardiansLoading}
        guardianError={guardianError}
        guardianForm={guardianForm}
        editingGuardianId={editingGuardianId}
        editingGuardianForm={editingGuardianForm}
        isSavingGuardian={isSavingGuardian}
        onGuardianFormChange={handleGuardianFormChange}
        onEditingFormChange={handleEditingFormChange}
        onAddGuardian={handleAddGuardian}
        onEditGuardian={handleEditGuardian}
        onUpdateGuardian={handleUpdateGuardian}
        onCancelEdit={() => setEditingGuardianId(null)}
        onRemoveGuardian={handleRemoveGuardian}
      />
    </div>
  );
}
