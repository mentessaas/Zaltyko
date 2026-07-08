"use client";

import type { SportConfigOption } from "@/components/groups/types";
import { WEEKDAY_OPTIONS } from "@/lib/classes/constants";
import type { CoachOption, GroupOption } from "./edit-class-dialog-model";

const fieldClassName =
  "w-full rounded-[10px] border border-zaltyko-mist bg-white px-3 py-2 text-sm shadow-none focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15";
const labelClassName = "text-xs font-medium uppercase tracking-[0.05em] text-zaltyko-navy";
const selectedChipClassName = "border-zaltyko-teal bg-zaltyko-teal/10 text-zaltyko-teal";
const unselectedChipClassName =
  "border-zaltyko-mist bg-white text-zaltyko-text-secondary hover:border-zaltyko-teal hover:text-zaltyko-teal";

export function EditClassError({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <div className="rounded-xl border border-zaltyko-coral/35 bg-zaltyko-coral/10 px-4 py-3 text-sm font-medium text-zaltyko-coral">
      <p className="font-semibold">Error al guardar cambios</p>
      <p className="mt-1">{error}</p>
    </div>
  );
}

export function EditClassFooter({
  classTermLower,
  hasChanges,
  isDeleting,
  isPending,
  onClose,
  onDelete,
}: {
  classTermLower: string;
  hasChanges: boolean;
  isDeleting: boolean;
  isPending: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-coral/35 px-4 py-2 text-sm font-semibold text-zaltyko-coral transition hover:bg-zaltyko-coral/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending || isDeleting}
      >
        {isDeleting ? "Eliminando…" : `Eliminar ${classTermLower}`}
      </button>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-zaltyko-indigo px-4 py-2 text-sm font-medium text-zaltyko-indigo transition hover:bg-zaltyko-indigo/5 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="edit-class-form"
          className="min-h-11 rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          title={!hasChanges ? "No hay cambios detectados. Haz clic para guardar de todas formas." : undefined}
        >
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

export function ClassNameSection({
  classTermLower,
  name,
  onNameChange,
}: {
  classTermLower: string;
  name: string;
  onNameChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className={labelClassName}>Nombre de la {classTermLower}</label>
      <input value={name} onChange={(event) => onNameChange(event.target.value)} className={fieldClassName} required />
    </div>
  );
}

export function ClassScheduleSection({
  capacity,
  classTermLower,
  endTime,
  selectedWeekdays,
  startTime,
  onCapacityChange,
  onClearWeekdays,
  onEndTimeChange,
  onStartTimeChange,
  onToggleWeekday,
}: {
  capacity: string;
  classTermLower: string;
  endTime: string;
  selectedWeekdays: string[];
  startTime: string;
  onCapacityChange: (value: string) => void;
  onClearWeekdays: () => void;
  onEndTimeChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onToggleWeekday: (value: string) => void;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className={labelClassName}>Días de la semana</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={onClearWeekdays}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selectedWeekdays.length === 0 ? selectedChipClassName : unselectedChipClassName
              }`}
            >
              Sin día fijo
            </button>
            {WEEKDAY_OPTIONS.map((option) => {
              const selected = selectedWeekdays.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onToggleWeekday(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    selected ? selectedChipClassName : unselectedChipClassName
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zaltyko-text-secondary">
            Selecciona uno o varios días. Déjalo vacío para {classTermLower}s flexibles.
          </p>
        </div>
        <div className="space-y-2">
          <label className={labelClassName}>Capacidad (número de plazas)</label>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => onCapacityChange(event.target.value)}
            className={fieldClassName}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className={labelClassName}>Hora de inicio</label>
          <input
            type="time"
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className={fieldClassName}
          />
        </div>
        <div className="space-y-2">
          <label className={labelClassName}>Hora de fin</label>
          <input
            type="time"
            value={endTime}
            onChange={(event) => onEndTimeChange(event.target.value)}
            className={fieldClassName}
          />
        </div>
      </div>
    </>
  );
}

export function ClassTechnicalFocusSection({
  technicalFocus,
  onTechnicalFocusChange,
}: {
  technicalFocus: string;
  onTechnicalFocusChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className={labelClassName}>Foco técnico del bloque</label>
      <textarea
        value={technicalFocus}
        onChange={(event) => onTechnicalFocusChange(event.target.value)}
        className={`${fieldClassName} min-h-24`}
        placeholder="Describe el objetivo técnico principal de este entrenamiento."
      />
    </div>
  );
}

export function ClassSportSection({
  apparatusLabel,
  apparatusOptions,
  availableGroups,
  effectiveSportConfigId,
  groupSportConfigIds,
  groupTermLower,
  selectedApparatus,
  sportConfigs,
  onApparatusToggle,
  onSportConfigChange,
}: {
  apparatusLabel: string;
  apparatusOptions: Array<{ code: string; label: string }>;
  availableGroups: GroupOption[];
  effectiveSportConfigId: string;
  groupSportConfigIds: string[];
  groupTermLower: string;
  selectedApparatus: string[];
  sportConfigs: SportConfigOption[];
  onApparatusToggle: (value: string) => void;
  onSportConfigChange: (value: string, availableGroups: GroupOption[]) => void;
}) {
  return (
    <div className="space-y-2">
      <label className={labelClassName}>{apparatusLabel}s / material principal</label>
      {sportConfigs.length > 0 && (
        <div className="mb-3 max-w-md">
          <select
            value={effectiveSportConfigId}
            onChange={(event) => onSportConfigChange(event.target.value, availableGroups)}
            className={fieldClassName}
            disabled={groupSportConfigIds.length === 1}
          >
            <option value="">Sin modalidad/rama</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.disciplineName} · {config.branchName}
              </option>
            ))}
          </select>
        </div>
      )}
      {groupSportConfigIds.length > 1 && (
        <p className="text-xs text-zaltyko-coral">
          Hay {groupTermLower}s de distintas ramas. Selecciona una modalidad/rama explícita antes de guardar.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {apparatusOptions.map((item) => {
          const selected = selectedApparatus.includes(item.code);
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => onApparatusToggle(item.code)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selected ? selectedChipClassName : unselectedChipClassName
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClassAssignmentsSection({
  classTermLower,
  coachTermPluralLower,
  compatibleCoaches,
  compatibleGroups,
  groupTermLower,
  hasGroups,
  selectedCoaches,
  selectedGroups,
  terms,
  onToggleCoach,
  onToggleGroup,
}: {
  classTermLower: string;
  coachTermPluralLower: string;
  compatibleCoaches: CoachOption[];
  compatibleGroups: GroupOption[];
  groupTermLower: string;
  hasGroups: boolean;
  selectedCoaches: string[];
  selectedGroups: string[];
  terms: { coach: string; groups: string };
  onToggleCoach: (coachId: string) => void;
  onToggleGroup: (groupId: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-3 rounded-2xl border border-dashed border-zaltyko-mist p-4">
        <header>
          <h3 className="text-sm font-semibold text-zaltyko-navy">{terms.coach}s asignados</h3>
          <p className="text-xs text-zaltyko-text-secondary">
            Selecciona quiénes tienen acceso directo a esta {classTermLower}.
          </p>
        </header>

        <div className="grid gap-2">
          {compatibleCoaches.length === 0 ? (
            <p className="text-sm text-zaltyko-text-secondary">
              No hay {coachTermPluralLower} disponibles para esta rama.
            </p>
          ) : (
            compatibleCoaches.map((coach) => (
              <CoachOptionRow
                key={coach.id}
                coach={coach}
                checked={selectedCoaches.includes(coach.id)}
                onToggle={() => onToggleCoach(coach.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-dashed border-zaltyko-mist p-4">
        <header>
          <h3 className="text-sm font-semibold text-zaltyko-navy">{terms.groups} asignados</h3>
          <p className="text-xs text-zaltyko-text-secondary">
            Selecciona los {groupTermLower}s que participan en esta {classTermLower}.
          </p>
        </header>

        <div className="grid gap-2">
          {!hasGroups ? (
            <p className="text-sm text-zaltyko-text-secondary">
              No hay {groupTermLower}s registrados en la academia.
            </p>
          ) : (
            compatibleGroups.map((group) => (
              <GroupOptionRow
                key={group.id}
                group={group}
                checked={selectedGroups.includes(group.id)}
                onToggle={() => onToggleGroup(group.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function ClassAdvancedOptionsSection({
  allowsFreeTrial,
  cancellationHoursBefore,
  cancellationPolicy,
  classTermLower,
  waitingListEnabled,
  onAllowsFreeTrialChange,
  onCancellationHoursBeforeChange,
  onCancellationPolicyChange,
  onWaitingListEnabledChange,
}: {
  allowsFreeTrial: boolean;
  cancellationHoursBefore: number;
  cancellationPolicy: string;
  classTermLower: string;
  waitingListEnabled: boolean;
  onAllowsFreeTrialChange: (value: boolean) => void;
  onCancellationHoursBeforeChange: (value: number) => void;
  onCancellationPolicyChange: (value: string) => void;
  onWaitingListEnabledChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-zaltyko-mist bg-zaltyko-warm-white p-4">
      <h3 className="text-sm font-semibold text-zaltyko-navy">Opciones avanzadas</h3>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
          <input
            type="checkbox"
            checked={allowsFreeTrial}
            onChange={(event) => onAllowsFreeTrialChange(event.target.checked)}
            className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
          />
          Permite {classTermLower} de prueba gratuita
        </label>

        <label className="flex items-center gap-2 text-sm text-zaltyko-navy">
          <input
            type="checkbox"
            checked={waitingListEnabled}
            onChange={(event) => onWaitingListEnabledChange(event.target.checked)}
            className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
          />
          Habilitar lista de espera cuando esté llena
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className={labelClassName}>Política de cancelación</label>
          <select
            value={cancellationPolicy}
            onChange={(event) => onCancellationPolicyChange(event.target.value)}
            className={fieldClassName}
          >
            <option value="flexible">Flexible (cancelar hasta 2h antes)</option>
            <option value="standard">Estándar (cancelar hasta 24h antes)</option>
            <option value="strict">Estricta (cancelar hasta 48h antes)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClassName}>Horas mínimas para cancelar</label>
          <input
            type="number"
            min={0}
            max={168}
            value={cancellationHoursBefore}
            onChange={(event) => onCancellationHoursBeforeChange(Number(event.target.value))}
            className={fieldClassName}
          />
          <p className="text-xs text-zaltyko-text-secondary">Horas antes de la {classTermLower}</p>
        </div>
      </div>
    </div>
  );
}

function CoachOptionRow({
  coach,
  checked,
  onToggle,
}: {
  coach: CoachOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
        checked ? "border-zaltyko-teal/60 bg-zaltyko-teal/10" : "border-zaltyko-mist bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
      />
      <div>
        <p className="font-medium text-zaltyko-navy">{coach.name}</p>
        <p className="text-xs text-zaltyko-text-secondary">{coach.email ?? "Sin correo"}</p>
      </div>
    </label>
  );
}

function GroupOptionRow({
  group,
  checked,
  onToggle,
}: {
  group: GroupOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
        checked ? "border-zaltyko-teal/60 bg-zaltyko-teal/10" : "border-zaltyko-mist bg-white"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-zaltyko-mist text-zaltyko-teal focus:ring-zaltyko-teal"
      />
      <div className="flex items-center gap-2">
        {group.color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />}
        <p className="font-medium text-zaltyko-navy">{group.name}</p>
      </div>
    </label>
  );
}
