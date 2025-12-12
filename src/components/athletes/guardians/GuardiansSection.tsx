"use client";

import type { GuardianSummary, GuardianFormData } from "@/types/athlete-edit";
import { GuardianItem } from "./GuardianItem";
import { GuardianForm } from "./GuardianForm";

interface GuardiansSectionProps {
  guardians: GuardianSummary[];
  guardiansLoading: boolean;
  guardianError: string | null;
  guardianForm: GuardianFormData;
  editingGuardianId: string | null;
  editingGuardianForm: GuardianFormData & { isPrimary: boolean };
  isSavingGuardian: boolean;
  onGuardianFormChange: (updates: Partial<GuardianFormData>) => void;
  onEditingFormChange: (updates: Partial<GuardianFormData & { isPrimary: boolean }>) => void;
  onAddGuardian: (event: React.FormEvent<HTMLFormElement>) => void;
  onEditGuardian: (guardian: GuardianSummary) => void;
  onUpdateGuardian: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
  onRemoveGuardian: (linkId: string) => void;
}

export function GuardiansSection({
  guardians,
  guardiansLoading,
  guardianError,
  guardianForm,
  editingGuardianId,
  editingGuardianForm,
  isSavingGuardian,
  onGuardianFormChange,
  onEditingFormChange,
  onAddGuardian,
  onEditGuardian,
  onUpdateGuardian,
  onCancelEdit,
  onRemoveGuardian,
}: GuardiansSectionProps) {
  const guardianCount = guardians.length;

  return (
    <section className="mt-8 space-y-4 rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Contactos familiares ({guardianCount})
          </h3>
          <p className="text-xs text-muted-foreground">
            Añade tutores y responsables para comunicaciones y autorizaciones.
          </p>
        </div>
      </header>

      {guardianError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {guardianError}
        </div>
      )}

      <div className="space-y-3">
        {guardiansLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Cargando contactos…</span>
          </div>
        )}
        {!guardiansLoading && guardianError && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            Error al cargar: {guardianError}
          </div>
        )}
        {!guardiansLoading && guardians.length === 0 && !guardianError && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Aún no hay contactos agregados para este atleta.
          </div>
        )}
        {!guardiansLoading && guardians.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {guardians.length} contacto{guardians.length !== 1 ? "s" : ""} encontrado{guardians.length !== 1 ? "s" : ""}
            </p>
            {guardians.map((guardian) => (
              <GuardianItem
                key={guardian.linkId}
                guardian={guardian}
                isEditing={editingGuardianId === guardian.linkId}
                editingForm={editingGuardianForm}
                isSaving={isSavingGuardian}
                onFormChange={onEditingFormChange}
                onSave={onUpdateGuardian}
                onCancel={onCancelEdit}
                onEdit={() => onEditGuardian(guardian)}
                onRemove={() => onRemoveGuardian(guardian.linkId)}
              />
            ))}
          </div>
        )}
      </div>

      <GuardianForm
        formData={guardianForm}
        error={guardianError}
        onFormChange={onGuardianFormChange}
        onSubmit={onAddGuardian}
      />
    </section>
  );
}

