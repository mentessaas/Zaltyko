"use client";

import { useRef } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import type { GroupOption } from "@/types";

interface AthleteBasicInfoFormProps {
  name: string;
  dob: string;
  groupId: string;
  computedAgeLabel: string;
  status: string;
  groups: GroupOption[];
  athleteLabel?: string;
  groupLabel?: string;
  // Grupos adicionales (multi-grupo). Si onToggleAdditionalGroup no se pasa, la
  // sección no se muestra (compat con formularios de un solo grupo).
  additionalGroupIds?: string[];
  onToggleAdditionalGroup?: (groupId: string) => void;
  onNameChange: (value: string) => void;
  onDobChange: (value: string) => void;
  onGroupIdChange: (value: string) => void;
}

export function AthleteBasicInfoForm({
  name,
  dob,
  groupId,
  computedAgeLabel,
  status,
  groups,
  athleteLabel = "atleta",
  groupLabel = "Grupo",
  additionalGroupIds = [],
  onToggleAdditionalGroup,
  onNameChange,
  onDobChange,
  onGroupIdChange,
}: AthleteBasicInfoFormProps) {
  const birthdateInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
      <header className="mb-4 flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Información general
        </p>
        <h3 className="text-lg font-semibold text-foreground">Datos del {athleteLabel.toLowerCase()}</h3>
        <p className="text-sm text-muted-foreground">
          Mantén actualizados los datos básicos para reportes y comunicación.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Nombre completo</label>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Ej. Sofía Hernández"
            required
          />
        </div>
        <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground md:grid-cols-3">
          <div>
            <p className="uppercase tracking-wide">Edad estimada</p>
            <p className="text-base font-semibold text-foreground">{computedAgeLabel || "—"}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide">Estado</p>
            <p className="text-base font-semibold text-foreground">{status}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide">{groupLabel}</p>
            <p className="text-base font-semibold text-foreground">
              {groups.find((group) => group.id === groupId)?.name ?? "Sin asignar"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Fecha de nacimiento</label>
          <div className="flex items-center gap-2">
            <input
              ref={birthdateInputRef}
              type="date"
              value={dob}
              onChange={(event) => onDobChange(event.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => birthdateInputRef.current?.showPicker?.()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
              aria-label="Seleccionar fecha"
            >
              <CalendarIcon className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{groupLabel} principal</label>
          <select
            value={groupId}
            onChange={(event) => onGroupIdChange(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Sin {groupLabel.toLowerCase()}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Define el {groupLabel.toLowerCase()} para sincronizar asistencia, evaluaciones y reportes.
          </p>
        </div>
      </div>

      {onToggleAdditionalGroup && groups.length > 0 && (
        <div className="mt-6 space-y-2">
          <label className="text-sm font-medium text-foreground">Grupos adicionales</label>
          <p className="text-xs text-muted-foreground">
            Una alumna puede entrenar en varios grupos a la vez. Cada grupo adicional genera su propia cuota.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {groups
              .filter((group) => group.id !== groupId)
              .map((group) => {
                const checked = additionalGroupIds.includes(group.id);
                return (
                  <label
                    key={group.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleAdditionalGroup(group.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-foreground">{group.name}</span>
                  </label>
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
}
