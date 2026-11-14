"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  apparatusLabel,
  computeLevelCompletion,
  elementStatusLabels,
  skillDisciplineLabels,
  statusOf,
  type ElementStatus,
  type RosterAthleteView,
  type SkillRosterView,
  type SkillTemplateSummary,
} from "@/modules/skill-levels/domain/skill-levels";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";

import {
  athleteSheetHref,
  fetchRoster,
  fetchTemplates,
  newClientRequestId,
  postEvaluation,
  postLevelPass,
  SKILL_UNAVAILABLE_MESSAGE,
  type RosterSource,
  type SkillScope,
} from "./skill-levels-client";
import { ProgressMeter } from "./SkillTemplateProgress";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SkillRosterView };

const MARK_ACTIONS: ReadonlyArray<{ status: ElementStatus; className: string }> = [
  { status: "in_progress", className: ownerUi.secondaryButton },
  { status: "achieved", className: ownerUi.primaryButton },
  { status: "not_started", className: ownerUi.secondaryButton },
];

/**
 * Evaluación rápida de un grupo o de una clase: se eligen los elementos de un
 * nivel, se marcan varias gimnastas a la vez y se guarda el estado de una vez.
 * Pensado para el móvil en el tapiz: filas y botones grandes, una sola acción
 * visible abajo. La vista de progreso por nivel está debajo. Todo pasa por la
 * API, que vuelve a autorizar cada gimnasta, la sede y el plan.
 */
export function SkillRosterEvaluator({
  organizationId,
  locationId,
  source,
  initialTemplateId,
}: {
  organizationId: string;
  locationId: string;
  source: RosterSource;
  initialTemplateId: string | null;
}) {
  const scope = useMemo<SkillScope>(() => ({ organizationId, locationId }), [organizationId, locationId]);
  const [templates, setTemplates] = useState<SkillTemplateSummary[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const templateSelectId = useId();

  // Plantillas activas de la academia, para elegir con cuál se evalúa.
  useEffect(() => {
    let cancelled = false;
    void fetchTemplates(scope).then((result) => {
      if (cancelled) return;
      if (result.status === "ok") {
        const active = result.data.templates.filter((template) => !template.archived);
        setTemplates(active);
        setTemplateId((current) => current ?? active[0]?.id ?? null);
        if (active.length === 0) setState({ status: "ready", data: emptyRoster() });
      } else if (result.status === "unavailable") setState({ status: "unavailable" });
      else setState({ status: "error", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const load = useCallback(async () => {
    if (!templateId) return;
    const current = ++sequence.current;
    setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }));
    const result = await fetchRoster(scope, source, templateId);
    if (current !== sequence.current) return;
    if (result.status === "ok") setState({ status: "ready", data: result.data });
    else if (result.status === "unavailable") setState({ status: "unavailable" });
    else setState({ status: "error", message: result.message });
  }, [scope, source, templateId]);

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
    <section className="grid gap-5" aria-label="Evaluación de niveles">
      <div className={`${ownerUi.subtlePanel} grid gap-2`}>
        <label htmlFor={templateSelectId} className={ownerUi.label}>
          Plantilla de niveles
        </label>
        <select
          id={templateSelectId}
          className={ownerUi.field}
          value={templateId ?? ""}
          disabled={!templates || templates.length === 0}
          onChange={(event) => {
            setNotice("");
            setTemplateId(event.target.value || null);
          }}
        >
          {templates?.length === 0 ? <option value="">Sin plantillas</option> : null}
          {(templates ?? []).map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} · {skillDisciplineLabels[template.discipline]}
            </option>
          ))}
        </select>
      </div>

      <div role="status" aria-live="polite">
        {notice ? <p className={ownerUi.noticeInfo}>{notice}</p> : null}
      </div>

      {state.status === "loading" ? (
        <p className={ownerUi.muted} role="status">
          Cargando gimnastas…
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
      {state.status === "ready" && state.data.template.id === "" ? (
        <p className={ownerUi.muted}>
          La academia todavía no tiene plantillas de niveles. La dirección puede crear una en Niveles y progresión.
        </p>
      ) : null}
      {state.status === "ready" && state.data.template.id !== "" ? (
        <RosterContent key={state.data.template.id} scope={scope} data={state.data} onSaved={afterWrite} />
      ) : null}
    </section>
  );
}

function emptyRoster(): SkillRosterView {
  return {
    label: "",
    template: { id: "", name: "", discipline: "artistic_female", archived: false, levels: [] },
    athletes: [],
    truncated: false,
    canWrite: false,
    readOnly: false,
    availableTemplates: [],
  };
}

function RosterContent({
  scope,
  data,
  onSaved,
}: {
  scope: SkillScope;
  data: SkillRosterView;
  onSaved: (message: string) => Promise<void>;
}) {
  const { template, athletes } = data;
  const writable = data.canWrite && !data.readOnly && !template.archived;
  // Nivel por defecto: el más bajo en el que trabaja alguien del grupo.
  const defaultLevelId = useMemo(() => {
    const workingIds = new Set(athletes.map((athlete) => athlete.currentLevelId).filter(Boolean));
    return template.levels.find((level) => workingIds.has(level.id))?.id ?? template.levels[0]?.id ?? "";
  }, [athletes, template.levels]);
  const [levelId, setLevelId] = useState(defaultLevelId);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);
  const [achievedOn, setAchievedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const levelSelectId = useId();
  const dateId = useId();

  const level = template.levels.find((entry) => entry.id === levelId) ?? template.levels[0] ?? null;
  const allAthleteIds = athletes.map((athlete) => athlete.id);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function mark(status: ElementStatus) {
    if (busy || selectedElements.length === 0 || selectedAthletes.length === 0) return;
    setBusy(true);
    setError("");
    const result = await postEvaluation(scope, {
      clientRequestId: newClientRequestId(),
      templateId: template.id,
      athleteIds: selectedAthletes,
      elementIds: selectedElements,
      status,
      achievedOn: status === "achieved" && achievedOn ? achievedOn : null,
    });
    setBusy(false);
    if (result.status === "ok") {
      setSelectedAthletes([]);
      await onSaved(
        result.data.changed === 0
          ? "Sin cambios: ya estaba así."
          : `${result.data.changed} marcas guardadas como «${elementStatusLabels[status].toLowerCase()}».`
      );
    } else {
      setError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  async function passLevel(athlete: RosterAthleteView) {
    if (busy || !athlete.currentLevelId) return;
    setBusy(true);
    setError("");
    const result = await postLevelPass(scope, athlete.id, {
      clientRequestId: newClientRequestId(),
      templateId: template.id,
      levelId: athlete.currentLevelId,
    });
    setBusy(false);
    if (result.status === "ok") await onSaved(`${athlete.name} ha superado el nivel.`);
    else setError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
  }

  const ready = athletes.filter((athlete) => athlete.readyToPass);

  return (
    <div className="grid gap-6">
      {data.readOnly ? (
        <p className={ownerTone.noticeWarning}>
          La academia está en solo lectura: puedes consultar el progreso, pero no evaluar ni pasar de nivel.
        </p>
      ) : null}
      {template.archived ? <p className={ownerTone.noticeWarning}>Plantilla archivada: solo lectura.</p> : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={ownerUi.sectionTitle}>{data.label}</h2>
        <p className={ownerUi.help}>
          {athletes.length} gimnastas · {skillDisciplineLabels[template.discipline]}
        </p>
      </div>
      {data.truncated ? (
        <p className={ownerTone.noticeWarning}>Hay más gimnastas de las que se muestran: se ven las primeras {athletes.length}.</p>
      ) : null}

      {athletes.length === 0 ? <p className={ownerUi.muted}>No hay gimnastas con inscripción o pertenencia vigente.</p> : null}

      {athletes.length > 0 && level ? (
        <div className="grid gap-5">
          {writable ? (
            <div className={`${ownerUi.card} grid gap-4`}>
              <div className="grid gap-2">
                <label htmlFor={levelSelectId} className={ownerUi.label}>
                  1. Nivel y elementos
                </label>
                <select
                  id={levelSelectId}
                  className={ownerUi.field}
                  value={level.id}
                  onChange={(event) => {
                    setLevelId(event.target.value);
                    setSelectedElements([]);
                  }}
                >
                  {template.levels.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                {level.elements.length === 0 ? (
                  <p className={ownerUi.muted}>Este nivel todavía no tiene elementos.</p>
                ) : (
                  <fieldset className="grid gap-1">
                    <legend className="sr-only">Elementos del nivel {level.name}</legend>
                    {level.elements.map((element) => (
                      <label
                        key={element.id}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-z-line bg-white px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-[#1E3FA8]"
                          checked={selectedElements.includes(element.id)}
                          onChange={() => setSelectedElements((list) => toggle(list, element.id))}
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-z-ink">{element.name}</span>
                          <span className={ownerUi.help}>
                            {apparatusLabel(element.apparatus)}
                            {element.required ? "" : " · Opcional"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>

              <fieldset className="grid gap-1">
                <legend className={`${ownerUi.label} mb-1`}>
                  2. Gimnastas ({selectedAthletes.length} de {athletes.length})
                </legend>
                <div className="mb-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ownerUi.secondaryButton}
                    onClick={() => setSelectedAthletes(selectedAthletes.length === athletes.length ? [] : allAthleteIds)}
                  >
                    {selectedAthletes.length === athletes.length ? "Quitar todas" : "Seleccionar todas"}
                  </button>
                </div>
                {athletes.map((athlete) => {
                  const single = selectedElements.length === 1 ? statusOf(new Map(Object.entries(athlete.statuses)), selectedElements[0]!) : null;
                  return (
                    <label
                      key={athlete.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-z-line bg-white px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 accent-[#1E3FA8]"
                        checked={selectedAthletes.includes(athlete.id)}
                        onChange={() => setSelectedAthletes((list) => toggle(list, athlete.id))}
                      />
                      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-z-ink">{athlete.name}</span>
                      {single ? <span className={ownerUi.chip}>{elementStatusLabels[single]}</span> : null}
                    </label>
                  );
                })}
              </fieldset>

              <div className="grid gap-3">
                <p className={ownerUi.label}>3. Marcar como</p>
                <div className="flex flex-wrap gap-2">
                  {MARK_ACTIONS.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      className={action.className}
                      disabled={busy || selectedElements.length === 0 || selectedAthletes.length === 0}
                      onClick={() => void mark(action.status)}
                    >
                      {busy ? "Guardando…" : elementStatusLabels[action.status]}
                    </button>
                  ))}
                </div>
                <details>
                  <summary className={`${ownerUi.textLink} cursor-pointer`}>Fecha del logro (por defecto, hoy)</summary>
                  <div className="mt-2 grid max-w-xs gap-1">
                    <label htmlFor={dateId} className={ownerUi.smallLabel}>
                      Solo se usa al marcar «Conseguido»
                    </label>
                    <input
                      id={dateId}
                      type="date"
                      className={ownerUi.field}
                      value={achievedOn}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setAchievedOn(event.target.value)}
                    />
                  </div>
                </details>
                {error ? (
                  <p role="alert" className={ownerUi.noticeError}>
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {ready.length > 0 && writable ? (
            <div className={`${ownerUi.card} grid gap-3`}>
              <h3 className={ownerUi.sectionTitle}>Listas para pasar de nivel</h3>
              <ul className="grid gap-2">
                {ready.map((athlete) => {
                  const current = template.levels.find((entry) => entry.id === athlete.currentLevelId);
                  return (
                    <li key={athlete.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-semibold text-z-ink">
                        {athlete.name} · {current?.name}
                      </span>
                      <button
                        type="button"
                        className={ownerUi.brandButton}
                        disabled={busy}
                        onClick={() => void passLevel(athlete)}
                      >
                        Pasar de nivel
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <ProgressTable scope={scope} data={data} />
        </div>
      ) : null}
    </div>
  );
}

/** Progreso por nivel de cada gimnasta: superado, o porcentaje de obligatorios conseguidos. */
function ProgressTable({ scope, data }: { scope: SkillScope; data: SkillRosterView }) {
  const { template, athletes } = data;
  return (
    <div className={`${ownerUi.cardFlush}`}>
      <div className={ownerUi.cardHeader}>
        <h3 className={ownerUi.sectionTitle}>Progreso del grupo</h3>
      </div>
      <div className="overflow-x-auto">
        <table className={ownerTone.table}>
          <caption className="sr-only">Progreso por nivel de cada gimnasta en {template.name}</caption>
          <thead>
            <tr className={ownerTone.tableHeadRow}>
              <th scope="col" className={ownerTone.tableHeadCell}>
                Gimnasta
              </th>
              {template.levels.map((level) => (
                <th key={level.id} scope="col" className={ownerTone.tableHeadCell}>
                  {level.name}
                </th>
              ))}
              <th scope="col" className={ownerTone.tableHeadCell}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const statuses = new Map(Object.entries(athlete.statuses) as Array<[string, ElementStatus]>);
              return (
                <tr key={athlete.id} className={ownerTone.tableRow}>
                  <th scope="row" className={`${ownerTone.tableCell} font-semibold text-z-ink`}>
                    <Link href={athleteSheetHref(scope, athlete.id)} className={ownerUi.textLink}>
                      {athlete.name}
                    </Link>
                  </th>
                  {template.levels.map((level) => {
                    const passed = athlete.passedLevelIds.includes(level.id);
                    const completion = computeLevelCompletion(
                      {
                        id: level.id,
                        position: level.position,
                        elements: level.elements.map((element) => ({ id: element.id, required: element.required })),
                      },
                      statuses
                    );
                    return (
                      <td key={level.id} className={ownerTone.tableCell}>
                        {passed ? (
                          <span className={ownerUi.chipSuccess}>Superado</span>
                        ) : (
                          <span className={athlete.currentLevelId === level.id ? ownerUi.chipAccent : ownerUi.help}>
                            {completion.requiredElements === 0 ? "—" : `${completion.percent} %`}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`${ownerTone.tableCell} min-w-28`}>
                    <ProgressMeter percent={athlete.overallPercent} label={`Total de ${athlete.name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
