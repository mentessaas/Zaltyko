"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  ELEMENT_STATUSES,
  elementStatusLabels,
  type AthleteSkillsView,
  type ElementStateView,
  type ElementStatus,
  type LevelStateView,
  type TemplateProgressView,
} from "@/modules/skill-levels/domain/skill-levels";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";

import {
  diplomaHref,
  fetchAthleteSkills,
  newClientRequestId,
  postEvaluation,
  postLevelPass,
  SKILL_UNAVAILABLE_MESSAGE,
  type SkillScope,
} from "./skill-levels-client";
import { SkillTemplateProgress } from "./SkillTemplateProgress";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AthleteSkillsView };

/**
 * Hoja de niveles de una gimnasta: estado de cada elemento, nivel actual,
 * paso de nivel y diploma. Lee y escribe solo por la API, que vuelve a
 * autorizar rol, sede, gimnasta y plan. Con el plan en solo lectura o la
 * gimnasta archivada se puede consultar, pero los controles quedan desactivados.
 */
export function SkillAthletePanel({
  organizationId,
  locationId,
  athleteId,
}: {
  organizationId: string;
  locationId: string;
  athleteId: string;
}) {
  const headingId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState("");
  const [requestedTemplateId, setRequestedTemplateId] = useState<string | null>(null);
  const sequence = useRef(0);
  const scope: SkillScope = { organizationId, locationId };

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }));
    const result = await fetchAthleteSkills({ organizationId, locationId }, athleteId, requestedTemplateId);
    if (current !== sequence.current) return;
    if (result.status === "ok") setState({ status: "ready", data: result.data });
    else if (result.status === "unavailable") setState({ status: "unavailable" });
    else setState({ status: "error", message: result.message });
  }, [organizationId, locationId, athleteId, requestedTemplateId]);

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
    <section aria-labelledby={headingId} className="grid gap-4">
      <h2 id={headingId} className={ownerUi.sectionTitle}>
        Niveles y progresión
      </h2>
      <div role="status" aria-live="polite">
        {notice ? <p className={ownerUi.noticeInfo}>{notice}</p> : null}
      </div>
      {state.status === "loading" ? (
        <p className={ownerUi.muted} role="status">
          Cargando niveles…
        </p>
      ) : null}
      {state.status === "unavailable" ? <p className={ownerTone.noticeWarning}>{SKILL_UNAVAILABLE_MESSAGE}</p> : null}
      {state.status === "error" ? (
        <div className={`${ownerUi.noticeError} grid gap-3`}>
          <p role="alert">{state.message}</p>
          <button type="button" className={ownerUi.secondaryButton} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <AthleteSkillsContent
          scope={scope}
          athleteId={athleteId}
          data={state.data}
          onSaved={afterWrite}
          onPickTemplate={setRequestedTemplateId}
        />
      ) : null}
    </section>
  );
}

function AthleteSkillsContent({
  scope,
  athleteId,
  data,
  onSaved,
  onPickTemplate,
}: {
  scope: SkillScope;
  athleteId: string;
  data: AthleteSkillsView;
  onSaved: (message: string) => Promise<void>;
  onPickTemplate: (templateId: string | null) => void;
}) {
  const writable = data.canWrite && !data.readOnly;
  const shownIds = new Set(data.templates.map((entry) => entry.template.id));
  const pickable = data.availableTemplates.filter((template) => !shownIds.has(template.id));
  const pickId = useId();
  return (
    <div className="grid gap-6">
      {data.athlete.archived ? (
        <p className={ownerTone.noticeWarning}>Ficha archivada: el progreso es de solo lectura.</p>
      ) : null}
      {data.readOnly && !data.athlete.archived ? (
        <p className={ownerTone.noticeWarning}>
          La academia está en solo lectura: puedes consultar, pero no evaluar ni pasar de nivel.
        </p>
      ) : null}

      {data.templates.length === 0 ? (
        <p className={ownerUi.muted}>
          {data.availableTemplates.length === 0
            ? "La academia todavía no tiene plantillas de niveles. La dirección puede crear una en Niveles y progresión."
            : "Todavía no hay progreso registrado. Elige una plantilla para empezar a evaluar."}
        </p>
      ) : null}

      {data.templates.map((progress) => (
        <TemplateBlock
          key={progress.template.id}
          scope={scope}
          athleteId={athleteId}
          progress={progress}
          writable={writable && !progress.template.archived}
          onSaved={onSaved}
        />
      ))}

      {pickable.length > 0 ? (
        <div className={`${ownerUi.subtlePanel} grid gap-2`}>
          <label htmlFor={pickId} className={ownerUi.label}>
            Evaluar con otra plantilla
          </label>
          <select
            id={pickId}
            className={ownerUi.field}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) onPickTemplate(event.target.value);
            }}
          >
            <option value="">Elige una plantilla…</option>
            {pickable.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function TemplateBlock({
  scope,
  athleteId,
  progress,
  writable,
  onSaved,
}: {
  scope: SkillScope;
  athleteId: string;
  progress: TemplateProgressView;
  writable: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setStatus(element: ElementStateView, status: ElementStatus) {
    if (busyKey || element.state.status === status) return;
    setBusyKey(element.id);
    setError("");
    const result = await postEvaluation(scope, {
      clientRequestId: newClientRequestId(),
      templateId: progress.template.id,
      athleteIds: [athleteId],
      elementIds: [element.id],
      status,
    });
    setBusyKey(null);
    if (result.status === "ok") await onSaved(`«${element.name}»: ${elementStatusLabels[status].toLowerCase()}.`);
    else setError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
  }

  async function passLevel(level: LevelStateView) {
    if (busyKey) return;
    setBusyKey(level.id);
    setError("");
    const result = await postLevelPass(scope, athleteId, {
      clientRequestId: newClientRequestId(),
      templateId: progress.template.id,
      levelId: level.id,
    });
    setBusyKey(null);
    if (result.status === "ok") await onSaved(`Nivel «${level.name}» superado. Ya puedes imprimir el diploma.`);
    else setError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
  }

  return (
    <div className="grid gap-3">
      <SkillTemplateProgress
        progress={progress}
        diplomaHrefFor={(passId) => diplomaHref(scope, athleteId, passId)}
        renderElementActions={
          writable
            ? (element) => (
                <div role="group" aria-label={`Estado de ${element.name}`} className="flex flex-wrap gap-2">
                  {ELEMENT_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={element.state.status === status ? ownerUi.primaryButton : ownerUi.secondaryButton}
                      aria-pressed={element.state.status === status}
                      disabled={busyKey !== null}
                      onClick={() => void setStatus(element, status)}
                    >
                      {elementStatusLabels[status]}
                    </button>
                  ))}
                </div>
              )
            : undefined
        }
        renderLevelActions={
          writable
            ? (level) =>
                level.current && progress.readyToPass ? (
                  <button
                    type="button"
                    className={ownerUi.brandButton}
                    disabled={busyKey !== null}
                    onClick={() => void passLevel(level)}
                  >
                    {busyKey === level.id ? "Guardando…" : `Pasar de nivel: ${level.name}`}
                  </button>
                ) : null
            : undefined
        }
      />
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
