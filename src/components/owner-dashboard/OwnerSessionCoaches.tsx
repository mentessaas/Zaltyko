"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Repeat2, UserRound } from "lucide-react";

import {
  SUBSTITUTION_REASONS,
  SUBSTITUTION_REASON_LABELS,
  sameStaffSet,
  type CoachRef,
  type SessionCoachesView,
  type SubstitutionReason,
} from "@/modules/coach-assignment/domain/coach-assignment";
import type { ScheduleConflict } from "@/modules/schedule-conflicts/domain/schedule-conflicts";
import { ownerUi } from "./owner-ui";
import { ownerTone } from "./owner-tone-ui";
import { OwnerScheduleConflictList } from "./OwnerScheduleConflicts";
import {
  COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE,
  fetchSessionCoaches,
  formatChangedAt,
  formatCoachNames,
  newClientRequestId,
  putSessionCoaches,
} from "./owner-coach-assignment-client";

type Load =
  | { status: "loading" }
  | { status: "ready"; view: SessionCoachesView }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type Draft = { selected: string[]; reason: SubstitutionReason | "" };

function names(coaches: readonly CoachRef[]): string {
  return formatCoachNames(coaches.map((coach) => coach.name));
}

/**
 * Quién entrena en la sesión seleccionada de Pasar lista (O1). Todos los que
 * pasan lista lo ven; solo la dirección, administración y coordinación pueden
 * cambiarlo para esta sesión, sin tocar la clase. Solo se monta si el
 * servidor comprobó que el candidato SQL está aplicado.
 */
export function OwnerSessionCoaches({
  organizationId,
  locationId,
  sessionId,
  coachMode,
  writesBlocked,
}: {
  organizationId: string;
  locationId: string;
  sessionId: string;
  coachMode: boolean;
  writesBlocked: boolean;
}) {
  const formId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // O2: choques tras guardar. Solo avisan; la sustitución ya está guardada.
  const [warnings, setWarnings] = useState<ScheduleConflict[]>([]);
  const pendingRequest = useRef<{ id: string; key: string } | null>(null);
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
    if (target === "first") fieldsetRef.current?.querySelector<HTMLInputElement>("input, select")?.focus();
    if (target === "trigger") triggerRef.current?.focus();
    if (target === "error") errorRef.current?.focus();
  });

  useEffect(() => {
    let active = true;
    setLoad({ status: "loading" });
    setDraft(null);
    setMessage(null);
    setError(null);
    void fetchSessionCoaches({ organizationId, locationId, sessionId }).then((result) => {
      if (!active) return;
      if (result.status === "ok") setLoad({ status: "ready", view: result.data });
      else if (result.status === "unavailable") setLoad({ status: "unavailable" });
      else setLoad({ status: "error", message: result.message });
    });
    return () => {
      active = false;
    };
  }, [organizationId, locationId, sessionId]);

  if (load.status === "loading") {
    return (
      <p role="status" className={ownerUi.help}>
        Cargando quién entrena en esta sesión…
      </p>
    );
  }
  if (load.status === "unavailable") {
    return <p className={ownerUi.help}>{COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE}</p>;
  }
  if (load.status === "error") {
    return (
      <p role="alert" className={ownerUi.noticeError}>
        {load.message}
      </p>
    );
  }

  const { view } = load;
  const canEdit = !coachMode && view.canWrite && view.eligible !== null;
  const options: CoachRef[] = view.eligible
    ? [
        ...view.eligible,
        ...view.coaches.filter((coach) => !view.eligible!.some((item) => item.staffProfileId === coach.staffProfileId)),
      ]
    : [];

  async function submit(staffProfileIds: string[], reason: SubstitutionReason | null) {
    const sorted = [...staffProfileIds].sort();
    const key = `${sorted.join(",")}|${reason ?? ""}`;
    if (!pendingRequest.current || pendingRequest.current.key !== key) {
      pendingRequest.current = { id: newClientRequestId(), key };
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    setWarnings([]);
    const result = await putSessionCoaches({
      organizationId,
      locationId,
      sessionId,
      clientRequestId: pendingRequest.current.id,
      staffProfileIds: sorted,
      expectedStaffProfileIds: view.coaches.map((coach) => coach.staffProfileId),
      reason,
    });
    setSaving(false);
    if (result.status !== "ok") {
      if (result.status === "error" && result.code === 409) {
        // Otra persona cambió la sesión (o el plan pasó a solo lectura): se
        // recarga quién entrena y se pide revisar antes de volver a guardar.
        pendingRequest.current = null;
        const fresh = await fetchSessionCoaches({ organizationId, locationId, sessionId });
        if (fresh.status === "ok") {
          setLoad({ status: "ready", view: fresh.data });
          setDraft(null);
          setError(`${result.message} Hemos cargado quién entrena ahora: revísalo y vuelve a guardar.`);
          focusNext.current = "error";
          return;
        }
      }
      setError(result.status === "unavailable" ? COACH_ASSIGNMENT_UNAVAILABLE_MESSAGE : result.message);
      focusNext.current = "error";
      return;
    }
    pendingRequest.current = null;
    setDraft(null);
    setWarnings(result.data.warnings ?? []);
    focusNext.current = "trigger";
    setLoad({ status: "ready", view: result.data });
    setMessage(
      result.data.substitution
        ? "Sustitución guardada solo para esta sesión. La clase mantiene sus titulares."
        : "Esta sesión vuelve a los titulares de la clase."
    );
  }

  return (
    <section aria-labelledby={`${formId}-title`} className={`grid gap-2 ${ownerUi.subtlePanel}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${formId}-title`} className={`${ownerUi.label} flex items-center gap-2`}>
          <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-z-soft" />
          Quién entrena
        </h3>
        {view.substitution ? (
          <span className={ownerTone.chipWarning}>
            <Repeat2 aria-hidden="true" className="h-3.5 w-3.5" />
            Sustitución
          </span>
        ) : null}
      </div>
      <p className="break-words text-sm text-z-ink">
        {view.coaches.length > 0 ? names(view.coaches) : "Nadie asignado en esta sesión."}
      </p>
      {coachMode && view.assignedToViewer ? (
        <p className={ownerUi.help}>Tienes esta sesión asignada.</p>
      ) : null}
      {view.substitution ? (
        <p className={ownerUi.help}>
          {view.substitution.reason && !coachMode ? `Motivo: ${SUBSTITUTION_REASON_LABELS[view.substitution.reason]}. ` : ""}
          Cambio de {view.substitution.changedByName} el {formatChangedAt(view.substitution.changedAt)}.
          {view.titulars.length > 0 ? ` Titulares de la clase: ${names(view.titulars)}.` : " La clase no tiene titular."}
        </p>
      ) : null}

      {canEdit && !draft ? (
        <div className="flex flex-wrap gap-2">
          <button
            ref={triggerRef}
            type="button"
            className={ownerUi.secondaryButton}
            disabled={writesBlocked || saving}
            onClick={() => {
              focusNext.current = "first";
              setMessage(null);
              setError(null);
              setDraft({
                selected: view.coaches.map((coach) => coach.staffProfileId),
                reason: view.substitution?.reason ?? "",
              });
            }}
          >
            Cambiar en esta sesión
          </button>
          {view.substitution ? (
            <button
              type="button"
              className={ownerUi.secondaryButton}
              disabled={writesBlocked || saving}
              onClick={() => void submit(view.titulars.map((coach) => coach.staffProfileId), null)}
            >
              Quitar la sustitución
            </button>
          ) : null}
        </div>
      ) : null}
      {canEdit && writesBlocked ? (
        <p className={ownerUi.help}>Solo lectura: se puede consultar quién entrena, no cambiarlo.</p>
      ) : null}

      {canEdit && draft ? (
        <fieldset ref={fieldsetRef} className="grid gap-3" aria-describedby={`${formId}-help`}>
          {/* El título «Quién entrena» ya está encima: la leyenda solo nombra el
              grupo para los lectores de pantalla y no se repite en pantalla. */}
          <legend className="sr-only">Quién entrena en esta sesión</legend>
          <p id={`${formId}-help`} className={ownerUi.help}>
            Solo cambia esta sesión; la clase mantiene sus titulares. Aparecen las personas del equipo con rol
            Entrenador/a y acceso a esta sede.
          </p>
          {options.length === 0 ? (
            <p className={ownerTone.noticeWarning}>
              Nadie del equipo con rol Entrenador/a tiene acceso a esta sede todavía. Dale acceso desde Equipo.
            </p>
          ) : (
            <ul className="grid gap-2">
              {options.map((coach) => {
                const inputId = `${formId}-${coach.staffProfileId}`;
                return (
                  <li key={coach.staffProfileId}>
                    <label
                      htmlFor={inputId}
                      className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-z-line bg-white px-3 py-2 text-sm transition-colors hover:border-mat has-[:checked]:border-mat has-[:checked]:bg-mat-wash"
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-mat"
                        checked={draft.selected.includes(coach.staffProfileId)}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            selected: event.target.checked
                              ? [...draft.selected, coach.staffProfileId]
                              : draft.selected.filter((id) => id !== coach.staffProfileId),
                          })
                        }
                      />
                      <span className="min-w-0 break-words">{coach.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {!sameStaffSet(draft.selected, view.titulars.map((coach) => coach.staffProfileId)) ? (
            <div className="grid gap-1">
              <label className={ownerUi.label} htmlFor={`${formId}-reason`}>
                Motivo (opcional)
              </label>
              <select
                id={`${formId}-reason`}
                className={ownerUi.field}
                value={draft.reason}
                disabled={saving}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value as SubstitutionReason | "" })}
              >
                <option value="">Sin motivo</option>
                {SUBSTITUTION_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {SUBSTITUTION_REASON_LABELS[reason]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className={ownerUi.help}>Coincide con los titulares de la clase: no queda como sustitución.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ownerUi.primaryButton}
              disabled={saving || writesBlocked}
              onClick={() => void submit(draft.selected, draft.reason === "" ? null : draft.reason)}
            >
              {saving ? "Guardando…" : "Guardar para esta sesión"}
            </button>
            <button
              type="button"
              className={ownerUi.secondaryButton}
              disabled={saving}
              onClick={() => {
                focusNext.current = "trigger";
                setDraft(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </fieldset>
      ) : null}

      {message ? (
        <p role="status" aria-live="polite" className={ownerUi.noticeInfo}>
          {message}
        </p>
      ) : null}
      <OwnerScheduleConflictList conflicts={warnings} variant="saved" />
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
