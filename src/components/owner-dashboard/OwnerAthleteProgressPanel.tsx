"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Flag, MessageSquareText } from "lucide-react";

import {
  APPARATUS_BY_DISCIPLINE,
  apparatusLabels,
  DISCIPLINES,
  disciplineLabels,
  OBJECTIVE_STATUSES,
  OBJECTIVE_TITLE_MAX,
  OBSERVATION_BODY_MAX,
  objectiveStatusLabels,
  observationVisibilityLabels,
  type Apparatus,
  type AthleteObjectiveView,
  type AthleteObservationView,
  type AthleteProgressView,
  type Discipline,
  type ObjectiveStatus,
  type ObservationVisibility,
} from "@/modules/athlete-progress/domain/athlete-progress";

import {
  FAMILY_VISIBILITY_HELP,
  fetchAthleteProgress,
  fetchSessionAthleteProgress,
  formatProgressDate,
  newClientRequestId,
  patchObservation,
  postObjective,
  postObjectiveStatus,
  postObservation,
  PROGRESS_UNAVAILABLE_MESSAGE,
  type ProgressScope,
} from "./owner-athlete-progress-client";
import { ownerTone, ownerUi } from "./owner-ui";

/** En Pasar lista solo se muestran las últimas observaciones. */
const COMPACT_OBSERVATIONS = 5;

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AthleteProgressView };

const statusChip: Record<ObjectiveStatus, string> = {
  in_progress: ownerUi.chipAccent,
  achieved: ownerUi.chipSuccess,
  discarded: ownerUi.chip,
};

const statusAction: Record<ObjectiveStatus, string> = {
  in_progress: "Reabrir",
  achieved: "Marcar conseguido",
  discarded: "Descartar",
};

/**
 * Objetivos y observaciones de una gimnasta (P2 #17) dentro de su ficha.
 * Lee y escribe solo por la API, que vuelve a autorizar rol, sede, gimnasta y
 * plan. `readOnly` refleja el modo solo lectura del plan: se puede consultar,
 * pero los controles de escritura quedan desactivados.
 */
export function OwnerAthleteProgressPanel({
  organizationId,
  locationId,
  athleteId,
  sessionRef,
  athleteName,
  readOnly,
  compact = false,
}: {
  organizationId: string;
  locationId: string;
  /** Ficha de Grupos: la gimnasta se conoce. */
  athleteId?: string;
  /** Pasar lista: la gimnasta sale de su inscripción en la sesión (servidor). */
  sessionRef?: { sessionId: string; enrollmentId: string };
  athleteName: string;
  readOnly: boolean;
  /** Modo de Pasar lista: consulta y cambios de estado, sin formularios de alta. */
  compact?: boolean;
}) {
  const headingId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const scope: ProgressScope = { organizationId, locationId };

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }));
    const scopeInput = { organizationId, locationId };
    const result = athleteId
      ? await fetchAthleteProgress(scopeInput, athleteId)
      : sessionRef
        ? await fetchSessionAthleteProgress(scopeInput, sessionRef.sessionId, sessionRef.enrollmentId)
        : ({ status: "error", message: "Falta la gimnasta.", code: 0 } as const);
    if (current !== sequence.current) return;
    if (result.status === "ok") setState({ status: "ready", data: result.data });
    else if (result.status === "unavailable") setState({ status: "unavailable" });
    else setState({ status: "error", message: result.message });
  }, [organizationId, locationId, athleteId, sessionRef?.sessionId, sessionRef?.enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterWrite = useCallback(
    async (message: string) => {
      setNotice(message);
      await load();
    },
    [load]
  );

  return (
    <section aria-labelledby={headingId} className={`${ownerUi.subtlePanel} grid gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-display text-lg font-black uppercase leading-none text-z-ink">
          {compact ? "Objetivos y últimas observaciones" : "Objetivos y observaciones"}
        </h3>
        <p className={ownerUi.help}>{athleteName}</p>
      </div>
      <div role="status" aria-live="polite">
        {notice ? <p className={ownerUi.noticeInfo}>{notice}</p> : null}
      </div>

      {state.status === "loading" ? (
        <p className={ownerUi.muted} role="status">
          Cargando objetivos y observaciones…
        </p>
      ) : null}
      {state.status === "unavailable" ? <p className={ownerTone.noticeWarning}>{PROGRESS_UNAVAILABLE_MESSAGE}</p> : null}
      {state.status === "error" ? (
        <div className={`${ownerUi.noticeError} grid gap-3`}>
          <p role="alert">{state.message}</p>
          <button type="button" className={ownerUi.secondaryButton} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <ProgressContent
          scope={scope}
          athleteId={state.data.athlete.id}
          data={state.data}
          readOnly={readOnly}
          onSaved={afterWrite}
          compact={compact}
        />
      ) : null}
    </section>
  );
}

function ProgressContent({
  scope,
  athleteId,
  data,
  readOnly,
  onSaved,
  compact,
}: {
  scope: ProgressScope;
  athleteId: string;
  data: AthleteProgressView;
  readOnly: boolean;
  onSaved: (message: string) => Promise<void>;
  compact: boolean;
}) {
  const writable = data.canWrite && !readOnly;
  const visibleObservations = compact ? data.observations.slice(0, COMPACT_OBSERVATIONS) : data.observations;
  return (
    <div className="grid gap-5">
      {data.athlete.archived ? (
        <p className={ownerTone.noticeWarning}>Ficha archivada: los objetivos y observaciones son de solo lectura.</p>
      ) : null}
      {readOnly && !data.athlete.archived ? (
        <p className={ownerTone.noticeWarning}>
          La academia está en solo lectura: puedes consultar, pero no añadir ni cambiar objetivos u observaciones.
        </p>
      ) : null}

      <div className="grid gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-z-ink">
          <Flag className="h-4 w-4" aria-hidden="true" /> Objetivos
        </h4>
        {data.objectives.length === 0 ? (
          <p className={ownerUi.muted}>Todavía no hay objetivos para esta gimnasta.</p>
        ) : (
          <ul className="grid gap-2">
            {data.objectives.map((objective) => (
              <ObjectiveItem
                key={objective.id}
                scope={scope}
                athleteId={athleteId}
                objective={objective}
                writable={writable}
                onSaved={onSaved}
              />
            ))}
          </ul>
        )}
        {data.moreObjectives ? (
          <p className={ownerUi.help}>Hay más objetivos de los que se muestran: se ven los {data.objectives.length} más recientes.</p>
        ) : null}
        {writable && !compact ? <ObjectiveForm scope={scope} athleteId={athleteId} onSaved={onSaved} /> : null}
      </div>

      <div className="grid gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-z-ink">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" /> Observaciones
        </h4>
        {data.observations.length === 0 ? (
          <p className={ownerUi.muted}>Todavía no hay observaciones.</p>
        ) : (
          <ul className="grid gap-2">
            {visibleObservations.map((observation) => (
              <ObservationItem
                key={observation.id}
                scope={scope}
                athleteId={athleteId}
                observation={observation}
                objectives={data.objectives}
                writable={writable}
                onSaved={onSaved}
              />
            ))}
          </ul>
        )}
        {data.moreObservations || visibleObservations.length < data.observations.length ? (
          <p className={ownerUi.help}>
            Se muestran las {visibleObservations.length} observaciones más recientes; hay más anteriores.
          </p>
        ) : null}
        {writable && !compact ? (
          <ObservationForm scope={scope} athleteId={athleteId} objectives={data.objectives} onSaved={onSaved} />
        ) : null}
      </div>
    </div>
  );
}

function ObjectiveItem({
  scope,
  athleteId,
  objective,
  writable,
  onSaved,
}: {
  scope: ProgressScope;
  athleteId: string;
  objective: AthleteObjectiveView;
  writable: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(status: ObjectiveStatus) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await postObjectiveStatus(scope, athleteId, objective.id, {
      expectedRevision: objective.revision,
      status,
    });
    setBusy(false);
    if (result.status === "ok") await onSaved(`Objetivo «${objective.title}»: ${objectiveStatusLabels[status].toLowerCase()}.`);
    else setError(result.status === "unavailable" ? PROGRESS_UNAVAILABLE_MESSAGE : result.message);
  }

  return (
    <li className={`${ownerUi.listItem} grid gap-2`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words font-semibold text-z-ink">{objective.title}</p>
        <span className={statusChip[objective.status]}>{objectiveStatusLabels[objective.status]}</span>
      </div>
      <p className={ownerUi.help}>
        {[
          objective.discipline ? disciplineLabels[objective.discipline] : null,
          objective.apparatus ? apparatusLabels[objective.apparatus] : null,
          objective.targetDate ? `Para el ${formatProgressDate(objective.targetDate)}` : null,
          `Creado por ${objective.createdByName}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {writable && objective.canChangeStatus ? (
        <div className="flex flex-wrap gap-2">
          {OBJECTIVE_STATUSES.filter((status) => status !== objective.status).map((status) => (
            <button
              key={status}
              type="button"
              className={ownerUi.secondaryButton}
              disabled={busy}
              aria-label={`${statusAction[status]}: ${objective.title}`}
              onClick={() => void change(status)}
            >
              {busy ? "Guardando…" : statusAction[status]}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
      {objective.history.length > 0 ? (
        <details>
          <summary className={`${ownerUi.textLink} cursor-pointer`}>Historial ({objective.history.length})</summary>
          <ol className="mt-2 grid gap-1">
            {objective.history.map((entry) => (
              <li key={entry.revision} className={ownerUi.help}>
                {formatProgressDate(entry.changedAt)} · {entry.changedByName}:{" "}
                {entry.fromStatus
                  ? `${objectiveStatusLabels[entry.fromStatus]} → ${objectiveStatusLabels[entry.toStatus]}`
                  : `creado (${objectiveStatusLabels[entry.toStatus].toLowerCase()})`}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

function ObjectiveForm({
  scope,
  athleteId,
  onSaved,
}: {
  scope: ProgressScope;
  athleteId: string;
  onSaved: (message: string) => Promise<void>;
}) {
  const ids = useId();
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "">("");
  const [apparatus, setApparatus] = useState<Apparatus | "">("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Mismo identificador en los reintentos del mismo envío: el servidor lo
  // reconoce y no duplica el objetivo.
  const [requestId, setRequestId] = useState(newClientRequestId);
  const apparatusOptions: readonly Apparatus[] = discipline ? APPARATUS_BY_DISCIPLINE[discipline] : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (title.trim().length < 2) {
      setError("Escribe el objetivo (al menos 2 caracteres).");
      return;
    }
    setBusy(true);
    setError("");
    const result = await postObjective(scope, athleteId, {
      clientRequestId: requestId,
      title: title.trim(),
      discipline: discipline || null,
      apparatus: apparatus || null,
      targetDate: targetDate || null,
    });
    setBusy(false);
    if (result.status === "ok") {
      setTitle("");
      setDiscipline("");
      setApparatus("");
      setTargetDate("");
      setRequestId(newClientRequestId());
      await onSaved("Objetivo añadido.");
    } else {
      setError(result.status === "unavailable" ? PROGRESS_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-md border border-z-line bg-white p-3.5">
      <div className="grid gap-1.5">
        <label htmlFor={`${ids}-title`} className={ownerUi.label}>
          Nuevo objetivo
        </label>
        <input
          id={`${ids}-title`}
          className={ownerUi.field}
          value={title}
          maxLength={OBJECTIVE_TITLE_MAX}
          placeholder="Ejemplo: rueda sin manos en barra"
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-discipline`} className={ownerUi.smallLabel}>
            Disciplina (opcional)
          </label>
          <select
            id={`${ids}-discipline`}
            className={ownerUi.field}
            value={discipline}
            onChange={(event) => {
              setDiscipline(event.target.value as Discipline | "");
              setApparatus("");
            }}
          >
            <option value="">Sin disciplina</option>
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {disciplineLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-apparatus`} className={ownerUi.smallLabel}>
            Aparato (opcional)
          </label>
          <select
            id={`${ids}-apparatus`}
            className={ownerUi.field}
            value={apparatus}
            disabled={!discipline}
            onChange={(event) => setApparatus(event.target.value as Apparatus | "")}
          >
            <option value="">{discipline ? "Sin aparato" : "Elige antes la disciplina"}</option>
            {apparatusOptions.map((value) => (
              <option key={value} value={value}>
                {apparatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-date`} className={ownerUi.smallLabel}>
            Fecha objetivo (opcional)
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            className={ownerUi.field}
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
      <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
        {busy ? "Guardando…" : "Añadir objetivo"}
      </button>
    </form>
  );
}

function VisibilityChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: ObservationVisibility;
  onChange: (value: ObservationVisibility) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className={ownerUi.smallLabel}>¿Quién puede verla?</legend>
      <div className="flex flex-wrap gap-3">
        {(["team", "family"] as const).map((option) => (
          <label key={option} className="touch-target inline-flex min-h-11 items-center gap-2 text-sm text-z-ink">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {observationVisibilityLabels[option]}
          </label>
        ))}
      </div>
      {value === "family" ? <p className={ownerUi.help}>{FAMILY_VISIBILITY_HELP}</p> : null}
    </fieldset>
  );
}

function ObservationForm({
  scope,
  athleteId,
  objectives,
  onSaved,
}: {
  scope: ProgressScope;
  athleteId: string;
  objectives: AthleteObjectiveView[];
  onSaved: (message: string) => Promise<void>;
}) {
  const ids = useId();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ObservationVisibility>("team");
  const [objectiveId, setObjectiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(newClientRequestId);
  const openObjectives = objectives.filter((objective) => objective.status === "in_progress");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!body.trim()) {
      setError("Escribe la observación.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await postObservation(scope, athleteId, {
      clientRequestId: requestId,
      body: body.trim(),
      visibility,
      objectiveId: objectiveId || null,
    });
    setBusy(false);
    if (result.status === "ok") {
      setBody("");
      setVisibility("team");
      setObjectiveId("");
      setRequestId(newClientRequestId());
      await onSaved("Observación añadida.");
    } else {
      setError(result.status === "unavailable" ? PROGRESS_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-md border border-z-line bg-white p-3.5">
      <div className="grid gap-1.5">
        <label htmlFor={`${ids}-body`} className={ownerUi.label}>
          Nueva observación
        </label>
        <textarea
          id={`${ids}-body`}
          className={`${ownerUi.field} min-h-24 py-2`}
          value={body}
          maxLength={OBSERVATION_BODY_MAX}
          aria-describedby={`${ids}-count`}
          onChange={(event) => setBody(event.target.value)}
          required
        />
        <p id={`${ids}-count`} className={ownerUi.help}>
          {body.length} de {OBSERVATION_BODY_MAX} caracteres
        </p>
      </div>
      <VisibilityChoice name={`${ids}-visibility`} value={visibility} onChange={setVisibility} />
      {openObjectives.length > 0 ? (
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-objective`} className={ownerUi.smallLabel}>
            Objetivo relacionado (opcional)
          </label>
          <select
            id={`${ids}-objective`}
            className={ownerUi.field}
            value={objectiveId}
            onChange={(event) => setObjectiveId(event.target.value)}
          >
            <option value="">Ninguno</option>
            {openObjectives.map((objective) => (
              <option key={objective.id} value={objective.id}>
                {objective.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
      <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
        {busy ? "Guardando…" : "Añadir observación"}
      </button>
    </form>
  );
}

function ObservationItem({
  scope,
  athleteId,
  observation,
  objectives,
  writable,
  onSaved,
}: {
  scope: ProgressScope;
  athleteId: string;
  observation: AthleteObservationView;
  objectives: AthleteObjectiveView[];
  writable: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [body, setBody] = useState(observation.body);
  const [visibility, setVisibility] = useState<ObservationVisibility>(observation.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Al abrir la edición, el foco va al texto; al cerrarla, vuelve a «Editar».
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) editRef.current?.focus();
    else if (wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const objective = objectives.find((item) => item.id === observation.objectiveId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await patchObservation(scope, athleteId, observation.id, {
      expectedRevision: observation.revision,
      body: body.trim(),
      visibility,
    });
    setBusy(false);
    if (result.status === "ok") {
      setEditing(false);
      await onSaved("Observación actualizada.");
    } else {
      setError(result.status === "unavailable" ? PROGRESS_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <li className={`${ownerUi.listItem} grid gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={ownerUi.help}>
          {formatProgressDate(observation.observedOn)} · {observation.authorName}
          {observation.sessionId ? " · en una sesión" : ""}
          {objective ? ` · objetivo «${objective.title}»` : ""}
        </p>
        <span className={observation.visibility === "family" ? ownerTone.chipOutline : ownerUi.chip}>
          {observationVisibilityLabels[observation.visibility]}
        </span>
      </div>
      {editing ? (
        <form onSubmit={(event) => void save(event)} className="grid gap-3">
          <label htmlFor={`${ids}-edit`} className="sr-only">
            Editar observación
          </label>
          <textarea
            ref={editRef}
            id={`${ids}-edit`}
            className={`${ownerUi.field} min-h-24 py-2`}
            value={body}
            maxLength={OBSERVATION_BODY_MAX}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <VisibilityChoice name={`${ids}-visibility`} value={visibility} onChange={setVisibility} />
          {error ? (
            <p role="alert" className={ownerUi.noticeError}>
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={ownerUi.primaryButton} disabled={busy || !body.trim()}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              className={ownerUi.secondaryButton}
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setBody(observation.body);
                setVisibility(observation.visibility);
                setError("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-line break-words text-sm leading-6 text-z-ink">{observation.body}</p>
          {writable && observation.canEdit ? (
            <button
              ref={editButtonRef}
              type="button"
              className={`${ownerUi.secondaryButton} justify-self-start`}
              onClick={() => setEditing(true)}
            >
              Editar
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}
