"use client";

import { useId, useState, type FormEvent } from "react";
import { MessageSquarePlus } from "lucide-react";

import {
  OBSERVATION_BODY_MAX,
  observationVisibilityLabels,
  type ObservationVisibility,
} from "@/modules/athlete-progress/domain/athlete-progress";

import {
  FAMILY_VISIBILITY_HELP,
  newClientRequestId,
  postSessionObservation,
  PROGRESS_UNAVAILABLE_MESSAGE,
} from "./owner-athlete-progress-client";
import { ownerUi } from "./owner-ui";

/**
 * Acceso rápido desde Pasar lista (P2 #17): añade una observación a una
 * gimnasta de la sesión. La gimnasta se identifica por su inscripción en la
 * clase de esa sesión; el servidor la deriva y vuelve a autorizarlo todo.
 */
export function OwnerSessionObservationForm({
  organizationId,
  locationId,
  sessionId,
  enrollmentId,
  athleteName,
  disabled,
}: {
  organizationId: string;
  locationId: string;
  sessionId: string;
  enrollmentId: string;
  athleteName: string;
  disabled: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ObservationVisibility>("team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [requestId, setRequestId] = useState(newClientRequestId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    if (!body.trim()) {
      setError("Escribe la observación.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await postSessionObservation({ organizationId, locationId }, sessionId, {
      enrollmentId,
      clientRequestId: requestId,
      body: body.trim(),
      visibility,
    });
    setBusy(false);
    if (result.status === "ok") {
      setBody("");
      setVisibility("team");
      setRequestId(newClientRequestId());
      setOpen(false);
      setSaved(`Observación guardada para ${athleteName}.`);
    } else {
      setError(result.status === "unavailable" ? PROGRESS_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        className={`${ownerUi.secondaryButton} min-h-11`}
        aria-expanded={open}
        aria-controls={`${ids}-form`}
        aria-label={`Añadir observación a ${athleteName}`}
        disabled={disabled}
        onClick={() => {
          setOpen((value) => !value);
          setSaved("");
        }}
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        Observación
      </button>
      <p aria-live="polite" className={saved ? ownerUi.help : "sr-only"}>
        {saved}
      </p>
      <form
        id={`${ids}-form`}
        hidden={!open}
        onSubmit={(event) => void submit(event)}
        className="grid gap-2 rounded-md border border-z-line bg-z-canvas p-3"
      >
        <label htmlFor={`${ids}-body`} className={ownerUi.smallLabel}>
          Observación sobre {athleteName}
        </label>
        <textarea
          id={`${ids}-body`}
          className={`${ownerUi.field} min-h-20 py-2`}
          value={body}
          maxLength={OBSERVATION_BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
        />
        <fieldset className="grid gap-1">
          <legend className={ownerUi.smallLabel}>¿Quién puede verla?</legend>
          <div className="flex flex-wrap gap-3">
            {(["team", "family"] as const).map((option) => (
              <label key={option} className="touch-target inline-flex min-h-11 items-center gap-2 text-sm text-z-ink">
                <input
                  type="radio"
                  name={`${ids}-visibility`}
                  value={option}
                  checked={visibility === option}
                  onChange={() => setVisibility(option)}
                />
                {observationVisibilityLabels[option]}
              </label>
            ))}
          </div>
          {visibility === "family" ? <p className={ownerUi.help}>{FAMILY_VISIBILITY_HELP}</p> : null}
        </fieldset>
        {error ? (
          <p role="alert" className={ownerUi.noticeError}>
            {error}
          </p>
        ) : null}
        <button type="submit" className={ownerUi.primaryButton} disabled={busy || disabled}>
          {busy ? "Guardando…" : "Guardar observación"}
        </button>
      </form>
    </div>
  );
}
