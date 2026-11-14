"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UserRound } from "lucide-react";

import type { CoachRef } from "@/modules/coach-assignment/domain/coach-assignment";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { OwnerScheduleConflictList } from "./OwnerScheduleConflicts";
import { ownerTone, ownerUi } from "./owner-ui";
import {
  COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE,
  fetchClassCoaches,
  formatCoachNames,
  newClientRequestId,
  putClassCoaches,
} from "./owner-coach-assignment-client";

type Editor =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "ready"; eligible: CoachRef[]; current: CoachRef[]; selected: string[]; saving: boolean };

/**
 * Titulares de una clase (O1) dentro de su ficha en Clases. Solo se monta si
 * el servidor comprobó que el candidato SQL está aplicado. `writesBlocked`
 * refleja el modo solo lectura del plan: se puede consultar, no cambiar.
 */
export function OwnerClassCoaches({
  organizationId,
  locationId,
  classTemplateId,
  className,
  initialTitulars,
  writesBlocked,
}: {
  organizationId: string;
  locationId: string;
  classTemplateId: string;
  className: string;
  initialTitulars: CoachRef[];
  writesBlocked: boolean;
}) {
  const fieldsetId = useId();
  const [titulars, setTitulars] = useState<CoachRef[]>(initialTitulars);
  const [editor, setEditor] = useState<Editor>({ status: "closed" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // O2: choques tras guardar. Solo avisan; el cambio ya está guardado.
  const [warnings, setWarnings] = useState<ScheduleConflict[]>([]);
  // Un reintento de la misma petición reutiliza su id: el servidor la reconoce.
  const pendingRequest = useRef<{ id: string; ids: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Adónde va el foco tras el próximo render: al abrir, a la primera casilla;
  // al guardar o cancelar, de vuelta al botón; ante un error, al aviso.
  const focusNext = useRef<"first" | "trigger" | "error" | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    if (target === "first") fieldsetRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    if (target === "trigger") triggerRef.current?.focus();
    if (target === "error") errorRef.current?.focus();
  });

  async function load(selection?: "keep-error") {
    const result = await fetchClassCoaches({ organizationId, locationId, classTemplateId });
    if (result.status !== "ok") {
      setEditor({ status: "closed" });
      setError(result.status === "unavailable" ? COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE : result.message);
      focusNext.current = "error";
      return;
    }
    setTitulars(result.data.titulars);
    setEditor({
      status: "ready",
      eligible: result.data.eligible,
      current: result.data.titulars,
      selected: result.data.titulars.map((coach) => coach.staffProfileId),
      saving: false,
    });
    focusNext.current = selection === "keep-error" ? "error" : "first";
  }

  async function open() {
    setMessage(null);
    setError(null);
    setWarnings([]);
    setEditor({ status: "loading" });
    await load();
  }

  function close() {
    setEditor({ status: "closed" });
    focusNext.current = "trigger";
  }

  function toggle(staffProfileId: string, checked: boolean) {
    setEditor((state) =>
      state.status === "ready"
        ? {
            ...state,
            selected: checked
              ? [...state.selected, staffProfileId]
              : state.selected.filter((id) => id !== staffProfileId),
          }
        : state
    );
  }

  async function save() {
    if (editor.status !== "ready") return;
    const selected = [...editor.selected].sort();
    const key = selected.join(",");
    if (!pendingRequest.current || pendingRequest.current.ids !== key) {
      pendingRequest.current = { id: newClientRequestId(), ids: key };
    }
    setEditor({ ...editor, saving: true });
    setError(null);
    const result = await putClassCoaches({
      organizationId,
      locationId,
      classTemplateId,
      clientRequestId: pendingRequest.current.id,
      staffProfileIds: selected,
      expectedStaffProfileIds: editor.current.map((coach) => coach.staffProfileId),
    });
    if (result.status !== "ok") {
      if (result.status === "error" && result.code === 409) {
        // Otra persona cambió la lista (o el plan pasó a solo lectura): se
        // recarga la lista actual y se pide revisar antes de volver a guardar.
        pendingRequest.current = null;
        setError(`${result.message} Hemos cargado la lista actual: revísala y vuelve a guardar.`);
        await load("keep-error");
        return;
      }
      setEditor({ ...editor, saving: false });
      setError(result.status === "unavailable" ? COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE : result.message);
      focusNext.current = "error";
      return;
    }
    pendingRequest.current = null;
    setTitulars(result.data.titulars);
    setWarnings(result.data.warnings ?? []);
    close();
    const count = result.data.updatedSessionCount;
    setMessage(
      count > 0
        ? `Titulares guardados. ${count === 1 ? "Se actualizó 1 sesión futura" : `Se actualizaron ${count} sesiones futuras`}; las sustituciones no cambian.`
        : "Titulares guardados. Las próximas sesiones que se generen los heredan."
    );
  }

  // Quien ya está como titular sigue en la lista aunque haya perdido el acceso,
  // para poder quitarlo.
  const options =
    editor.status === "ready"
      ? [
          ...editor.eligible,
          ...editor.current.filter(
            (coach) => !editor.eligible.some((item) => item.staffProfileId === coach.staffProfileId)
          ),
        ]
      : [];

  return (
    <div className="mt-3 border-t border-z-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-start gap-2 text-sm text-z-ink">
          <UserRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-z-soft" />
          <span className="min-w-0 break-words">
            <span className="font-semibold">Titulares: </span>
            {titulars.length > 0 ? formatCoachNames(titulars.map((coach) => coach.name)) : "sin titular asignado"}
          </span>
        </p>
        {editor.status === "closed" ? (
          <button
            ref={triggerRef}
            type="button"
            className={ownerUi.secondaryButton}
            onClick={() => void open()}
            disabled={writesBlocked}
            aria-label={`${titulars.length > 0 ? "Cambiar" : "Asignar"} titulares de ${className}`}
          >
            {titulars.length > 0 ? "Cambiar titulares" : "Asignar titulares"}
          </button>
        ) : null}
      </div>
      {writesBlocked && editor.status === "closed" ? (
        <p className={`mt-2 ${ownerUi.help}`}>Solo lectura: los titulares se pueden consultar, no cambiar.</p>
      ) : null}

      {editor.status === "loading" ? (
        <p role="status" className={`mt-3 ${ownerUi.help}`}>
          Cargando el equipo de esta sede…
        </p>
      ) : null}

      {editor.status === "ready" ? (
        <fieldset ref={fieldsetRef} className={`mt-3 ${ownerUi.subtlePanel}`} aria-describedby={`${fieldsetId}-help`}>
          <legend className={`${ownerUi.label} px-1`}>Titulares de {className}</legend>
          <p id={`${fieldsetId}-help`} className={`mt-1 ${ownerUi.help}`}>
            Solo aparecen personas del equipo con rol Entrenador/a y acceso a esta sede. Las sesiones futuras sin
            sustitución pasan a los titulares que guardes.
          </p>
          {options.length === 0 ? (
            <p className={`mt-3 ${ownerTone.noticeWarning}`}>
              Nadie del equipo con rol Entrenador/a tiene acceso a esta sede todavía. Dale acceso desde Equipo.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {options.map((coach) => {
                const inputId = `${fieldsetId}-${coach.staffProfileId}`;
                return (
                  <li key={coach.staffProfileId}>
                    <label
                      htmlFor={inputId}
                      className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-z-line bg-white px-3 py-2 text-sm"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-mat"
                        checked={editor.selected.includes(coach.staffProfileId)}
                        disabled={editor.saving}
                        onChange={(event) => toggle(coach.staffProfileId, event.target.checked)}
                      />
                      <span className="min-w-0 break-words">{coach.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={ownerUi.primaryButton}
              onClick={() => void save()}
              disabled={editor.saving || writesBlocked}
            >
              {editor.saving ? "Guardando…" : "Guardar titulares"}
            </button>
            <button
              type="button"
              className={ownerUi.secondaryButton}
              onClick={close}
              disabled={editor.saving}
            >
              Cancelar
            </button>
          </div>
        </fieldset>
      ) : null}

      {message ? (
        <p role="status" aria-live="polite" className={`mt-3 ${ownerUi.noticeInfo}`}>
          {message}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div className="mt-3">
          <OwnerScheduleConflictList conflicts={warnings} variant="saved" />
        </div>
      ) : null}
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className={`mt-3 ${ownerUi.noticeError}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
