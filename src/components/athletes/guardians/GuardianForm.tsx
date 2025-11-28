"use client";

import type { GuardianFormData } from "@/types/athlete-edit";
import { RELATIONSHIP_OPTIONS } from "@/types/athlete-edit";

interface GuardianFormProps {
  formData: GuardianFormData;
  error: string | null;
  onFormChange: (updates: Partial<GuardianFormData>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function GuardianForm({
  formData,
  error,
  onFormChange,
  onSubmit,
}: GuardianFormProps) {
  const isCustomRelationship = !RELATIONSHIP_OPTIONS.includes(formData.relationship as any) || formData.relationship === "";

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-dashed border-border/80 p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Añadir nuevo contacto</p>
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={formData.name}
          onChange={(event) => onFormChange({ name: event.target.value })}
          placeholder="Nombre"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
        <input
          type="email"
          value={formData.email}
          onChange={(event) => onFormChange({ email: event.target.value })}
          placeholder="Correo"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
        <input
          value={formData.phone}
          onChange={(event) => onFormChange({ phone: event.target.value })}
          placeholder="Teléfono"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
        <div className="grid gap-2">
          <select
            value={RELATIONSHIP_OPTIONS.includes(formData.relationship as any) ? formData.relationship : "Otro"}
            onChange={(event) => {
              const value = event.target.value;
              onFormChange({
                relationship: value === "Otro" ? "" : value,
              });
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {RELATIONSHIP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="Otro">Otro (especificar)</option>
          </select>
          {isCustomRelationship && (
            <input
              value={formData.relationship}
              onChange={(event) => onFormChange({ relationship: event.target.value })}
              placeholder="Especifica la relación"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          )}
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.notifyEmail}
            onChange={(event) => onFormChange({ notifyEmail: event.target.checked })}
          />
          Recibir correos
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.notifySms}
            onChange={(event) => onFormChange({ notifySms: event.target.checked })}
          />
          Recibir SMS
        </label>
      </div>
      <button
        type="submit"
        className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80"
      >
        Añadir contacto
      </button>
    </form>
  );
}

