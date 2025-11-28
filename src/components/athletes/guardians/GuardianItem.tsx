"use client";

import Link from "next/link";
import type { GuardianSummary, GuardianFormData } from "@/types/athlete-edit";

interface GuardianItemProps {
  guardian: GuardianSummary;
  isEditing: boolean;
  editingForm: GuardianFormData & { isPrimary: boolean };
  isSaving: boolean;
  onFormChange: (updates: Partial<GuardianFormData & { isPrimary: boolean }>) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function GuardianItem({
  guardian,
  isEditing,
  editingForm,
  isSaving,
  onFormChange,
  onSave,
  onCancel,
  onEdit,
  onRemove,
}: GuardianItemProps) {
  if (isEditing) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm">
        <form onSubmit={onSave} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={editingForm.name}
              onChange={(event) => onFormChange({ name: event.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Nombre"
              required
            />
            <input
              type="email"
              value={editingForm.email}
              onChange={(event) => onFormChange({ email: event.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Correo"
            />
            <input
              value={editingForm.phone}
              onChange={(event) => onFormChange({ phone: event.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Teléfono"
            />
            <input
              value={editingForm.relationship}
              onChange={(event) => onFormChange({ relationship: event.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Relación"
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingForm.notifyEmail}
                onChange={(event) => onFormChange({ notifyEmail: event.target.checked })}
              />
              Recibir correos
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingForm.notifySms}
                onChange={(event) => onFormChange({ notifySms: event.target.checked })}
              />
              Recibir SMS
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingForm.isPrimary}
                onChange={(event) => onFormChange({ isPrimary: event.target.checked })}
              />
              Contacto principal
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar contacto"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs font-semibold text-red-600 hover:underline"
              disabled={isSaving}
            >
              Eliminar
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-semibold">{guardian.name ?? "Sin nombre"}</p>
          <p className="text-xs text-muted-foreground">
            {guardian.email ?? "Sin correo"} · {guardian.phone ?? "Sin teléfono"}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-white/60 px-2 py-0.5 font-semibold text-foreground">
              Relación: {guardian.linkRelationship ?? guardian.email ?? "No especificada"}
            </span>
            {guardian.isPrimary ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                Principal
              </span>
            ) : null}
            {guardian.notifyEmail
              ? <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">Email</span>
              : null}
            {guardian.notifySms
              ? <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-700">SMS</span>
              : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {guardian.profileId ? (
            <Link
              href={`/dashboard/profile/${guardian.profileId}`}
              className="text-primary hover:underline"
            >
              Ver familiar
            </Link>
          ) : (
            <span className="text-muted-foreground">Sin perfil</span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="text-primary hover:underline"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-red-600 hover:underline"
          >
            Quitar
          </button>
        </div>
      </div>
    </div>
  );
}

