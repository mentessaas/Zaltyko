"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Plus, Trash2 } from "lucide-react";

import {
  BLOCK_CONTENT_MAX,
  BLOCK_DURATION_MAX,
  BLOCK_KINDS,
  blockKindLabels,
  BLOCKS_MAX,
  PLAN_APPARATUS_BY_DISCIPLINE,
  PLAN_DISCIPLINES,
  PLAN_FOCUS_MAX,
  PLAN_NOTE_MAX,
  planApparatusLabels,
  planDisciplineLabels,
  type BlockKind,
  type PlanApparatus,
  type PlanDiscipline,
  type SessionPlanPageView,
} from "@/modules/session-plans/domain/session-plan";

import {
  fetchSessionPlan,
  PLAN_UNAVAILABLE_MESSAGE,
  putBlockDone,
  putClassPlanTemplate,
  putSessionPlan,
  type BlockDraft,
} from "./owner-session-plan-client";
import { ownerUi } from "./owner-ui";
import { OwnerPlanCheckNote, type OwnerPlanCheck } from "./OwnerPlanCheckNote";

/**
 * Plan de la sesión en Pasar lista (P2 #17, segunda parte). Componente aislado:
 * OwnerAttendanceManager solo lo monta cuando el servidor confirmó que el
 * candidato SQL está aplicado. Dentro, un 503 con su motivo muestra «no
 * disponible» y nunca un error.
 * - Antes de la sesión: crear el plan (en blanco o desde la plantilla) y editarlo.
 * - Desde que empieza: marcar bloques hechos. La observación rápida es la de
 *   cada gimnasta («Observación» en su fila).
 * - La dirección puede guardar el plan como plantilla de la clase.
 */

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; view: SessionPlanPageView };

type Draft = {
  clientRequestId: string;
  focus: string;
  note: string;
  blocks: BlockDraft[];
  objectiveIds: string[];
};

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function emptyBlock(): BlockDraft {
  return { id: null, kind: "technique", discipline: null, apparatus: null, content: "", durationMinutes: null };
}

function draftFrom(view: SessionPlanPageView): Draft {
  const plan = view.plan;
  return {
    clientRequestId: newRequestId(),
    focus: plan?.focus ?? "",
    note: plan?.note ?? "",
    blocks: plan
      ? plan.blocks.map((block) => ({
          id: block.id,
          kind: block.kind,
          discipline: block.discipline,
          apparatus: block.apparatus,
          content: block.content,
          durationMinutes: block.durationMinutes,
        }))
      : [emptyBlock()],
    objectiveIds: plan ? plan.objectives.map((objective) => objective.objectiveId) : [],
  };
}

function blockTags(block: { kind: BlockKind; discipline: PlanDiscipline | null; apparatus: PlanApparatus | null }) {
  return [
    blockKindLabels[block.kind],
    block.discipline ? planDisciplineLabels[block.discipline] : null,
    block.apparatus ? planApparatusLabels[block.apparatus] : null,
  ].filter(Boolean);
}

export function OwnerSessionPlanPanel({
  organizationId,
  locationId,
  sessionId,
  readOnly,
  planCheck,
}: {
  organizationId: string;
  locationId: string;
  sessionId: string;
  /** Plan de la academia en solo lectura: se ve el plan, no se cambia. */
  readOnly: boolean;
  /**
   * Por qué no se puede escribir: comprobando el plan, comprobación fallida o
   * solo lectura confirmada. Sin él, `readOnly` se lee como solo lectura.
   */
  planCheck?: OwnerPlanCheck;
}) {
  const titleId = useId();
  const scope = useMemo(() => ({ organizationId, locationId }), [organizationId, locationId]);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  // «Crear desde el modelo» conserva su identificador de petición hasta que
  // tiene éxito: un reintento tras un fallo de red es la misma petición y el
  // servidor lo reconoce como repetición.
  const templateRequestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchSessionPlan(scope, sessionId);
    if (result.status === "ok") setState({ status: "ready", view: result.data });
    else if (result.status === "unavailable") setState({ status: "unavailable" });
    else setState({ status: "error", message: result.message });
  }, [scope, sessionId]);

  useEffect(() => {
    setState({ status: "loading" });
    setDraft(null);
    setMessage(null);
    void load();
  }, [load]);

  async function run(
    action: () => Promise<{ status: string; message?: string }>,
    success: string,
    onSuccess?: () => void
  ) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.status === "ok") {
      onSuccess?.();
      setMessage({ tone: "info", text: success });
      setDraft(null);
      await load();
    } else if (result.status === "unavailable") {
      setState({ status: "unavailable" });
    } else {
      setMessage({ tone: "error", text: result.message ?? "No se ha podido guardar." });
    }
  }

  return (
    <section aria-labelledby={titleId} className={`${ownerUi.subtlePanel} grid gap-3`}>
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-z-soft" aria-hidden="true" />
        <h3 id={titleId} className="text-sm font-bold text-z-ink">
          Guion de la sesión
        </h3>
      </div>
      {state.status === "loading" ? (
        <p role="status" aria-live="polite" className={ownerUi.help}>
          Cargando el guion…
        </p>
      ) : state.status === "unavailable" ? (
        <p role="status" className={ownerUi.help}>
          {PLAN_UNAVAILABLE_MESSAGE}
        </p>
      ) : state.status === "error" ? (
        <div className="grid gap-2">
          <p role="alert" className={ownerUi.noticeError}>
            {state.message}
          </p>
          <button type="button" className={ownerUi.secondaryButton} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : (
        <ReadyPlan
          view={state.view}
          draft={draft}
          busy={busy}
          readOnly={readOnly}
          planCheck={planCheck}
          onEdit={() => setDraft(draftFrom(state.view))}
          onCancel={() => setDraft(null)}
          onDraftChange={setDraft}
          onSave={(current) =>
            void run(
              () =>
                putSessionPlan(scope, sessionId, {
                  clientRequestId: current.clientRequestId,
                  expectedRevision: state.view.plan?.revision ?? null,
                  source: "manual",
                  focus: current.focus.trim() || null,
                  note: current.note.trim() || null,
                  blocks: current.blocks,
                  objectiveIds: current.objectiveIds,
                }),
              "Guion guardado."
            )
          }
          onCreateFromTemplate={() => {
            templateRequestId.current ??= newRequestId();
            const clientRequestId = templateRequestId.current;
            void run(
              () =>
                putSessionPlan(scope, sessionId, {
                  clientRequestId,
                  expectedRevision: null,
                  source: "template",
                  focus: null,
                  note: null,
                  blocks: [],
                  objectiveIds: [],
                }),
              "Guion creado desde el modelo de la clase.",
              () => {
                templateRequestId.current = null;
              }
            );
          }}
          onToggleBlock={(blockId, done) =>
            void run(() => putBlockDone(scope, sessionId, blockId, done), done ? "Bloque marcado como hecho." : "Bloque marcado como pendiente.")
          }
          onSaveAsTemplate={() => {
            const plan = state.view.plan;
            if (!plan) return;
            void run(
              () =>
                putClassPlanTemplate(scope, state.view.session.classTemplateId, {
                  expectedRevision: state.view.template.revision,
                  focus: plan.focus,
                  note: plan.note,
                  blocks: plan.blocks.map((block) => ({
                    kind: block.kind,
                    discipline: block.discipline,
                    apparatus: block.apparatus,
                    content: block.content,
                    durationMinutes: block.durationMinutes,
                  })),
                }),
              "Modelo de la clase guardado. Se copiará en los guiones nuevos de esta clase."
            );
          }}
        />
      )}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function ReadyPlan({
  view,
  draft,
  busy,
  readOnly,
  planCheck,
  onEdit,
  onCancel,
  onDraftChange,
  onSave,
  onCreateFromTemplate,
  onToggleBlock,
  onSaveAsTemplate,
}: {
  view: SessionPlanPageView;
  draft: Draft | null;
  busy: boolean;
  readOnly: boolean;
  planCheck?: OwnerPlanCheck;
  onEdit: () => void;
  onCancel: () => void;
  onDraftChange: (draft: Draft) => void;
  onSave: (draft: Draft) => void;
  onCreateFromTemplate: () => void;
  onToggleBlock: (blockId: string, done: boolean) => void;
  onSaveAsTemplate: () => void;
}) {
  const editable = !readOnly && !view.session.cancelled;
  // El editor se monta solo al abrirse: `.grid` de Tailwind pisa [hidden].
  if (draft) {
    return (
      <PlanEditor
        view={view}
        draft={draft}
        busy={busy}
        onChange={onDraftChange}
        onCancel={onCancel}
        onSave={() => onSave(draft)}
      />
    );
  }

  const plan = view.plan;
  // Solo se dice «solo lectura» cuando el plan lo confirma; mientras se
  // comprueba, estado neutro, y si la comprobación falla, error con reintento.
  const readOnlyNotice = readOnly ? (
    <OwnerPlanCheckNote
      check={planCheck && planCheck !== "ok" ? planCheck : "read_only"}
      readOnlyText="La academia está en solo lectura: puedes ver el guion, pero no cambiarlo."
    />
  ) : view.session.cancelled ? (
    <p className={ownerUi.help}>La sesión está cancelada: su guion es de solo lectura.</p>
  ) : null;

  if (!plan) {
    return (
      <div className="grid gap-2">
        <p className={ownerUi.help}>Esta sesión todavía no tiene guion.</p>
        {readOnlyNotice}
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ownerUi.secondaryButton} onClick={onEdit} disabled={busy}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear guion
            </button>
            {view.template.exists ? (
              <button type="button" className={ownerUi.secondaryButton} onClick={onCreateFromTemplate} disabled={busy}>
                Crear desde el modelo de la clase
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const totalMinutes = plan.blocks.reduce((sum, block) => sum + (block.durationMinutes ?? 0), 0);
  const doneCount = plan.blocks.filter((block) => block.done).length;

  return (
    <div className="grid gap-3">
      {plan.focus ? (
        <p className="text-sm text-z-ink">
          <span className="font-semibold">Foco del día:</span> <span>{plan.focus}</span>
        </p>
      ) : null}
      {plan.blocks.length > 0 ? (
        <>
          <p className={ownerUi.help}>
            {plan.blocks.length === 1 ? "1 bloque" : `${plan.blocks.length} bloques`}
            {totalMinutes > 0 ? ` · unos ${totalMinutes} min` : ""}
            {view.session.started ? ` · ${doneCount} hechos` : ""}
          </p>
          <ol className="grid gap-2">
            {plan.blocks.map((block) => {
              const label = `${blockKindLabels[block.kind]}: ${block.content}`;
              return (
                <li key={block.id} className="grid gap-1 rounded-md border border-z-line bg-white p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {blockTags(block).map((tag) => (
                      <span key={tag} className={ownerUi.chip}>
                        {tag}
                      </span>
                    ))}
                    {block.durationMinutes ? <span className={ownerUi.help}>~{block.durationMinutes} min</span> : null}
                  </div>
                  <p className="whitespace-pre-line break-words text-sm text-z-ink">{block.content}</p>
                  {view.session.canMarkBlocks && !readOnly ? (
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-z-ink">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={block.done}
                        disabled={busy}
                        aria-label={`Hecho: ${label}`}
                        onChange={(event) => onToggleBlock(block.id, event.target.checked)}
                      />
                      Hecho
                    </label>
                  ) : block.done ? (
                    <span className={ownerUi.chipSuccess}>Hecho</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className={ownerUi.help}>El guion no tiene bloques.</p>
      )}
      {plan.objectives.length > 0 ? (
        <div className="grid gap-1">
          <p className={ownerUi.smallLabel}>Objetivos que se trabajan</p>
          <ul className="grid gap-1">
            {plan.objectives.map((objective) => (
              <li key={objective.objectiveId} className="text-sm text-z-ink">
                {objective.athleteName}: {objective.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.note ? <p className="whitespace-pre-line break-words text-sm text-z-soft">{plan.note}</p> : null}
      {view.session.started && !view.session.cancelled ? (
        <p className={ownerUi.help}>
          Para una observación rápida de una gimnasta, usa «Observación» en su fila de la lista.
        </p>
      ) : null}
      {readOnlyNotice}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ownerUi.secondaryButton} onClick={onEdit} disabled={busy}>
            Editar guion
          </button>
          {view.canManageTemplate ? (
            <button type="button" className={ownerUi.secondaryButton} onClick={onSaveAsTemplate} disabled={busy}>
              {view.template.exists ? "Actualizar el modelo de la clase" : "Guardar como modelo de la clase"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PlanEditor({
  view,
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  view: SessionPlanPageView;
  draft: Draft;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const baseId = useId();
  const updateBlock = (index: number, patch: Partial<BlockDraft>) =>
    onChange({
      ...draft,
      blocks: draft.blocks.map((block, position) => (position === index ? { ...block, ...patch } : block)),
    });
  const moveBlock = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    onChange({ ...draft, blocks });
  };
  const invalid = draft.blocks.some((block) => block.content.trim() === "");

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSave();
      }}
    >
      <div className="grid gap-1">
        <label htmlFor={`${baseId}-focus`} className={ownerUi.label}>
          Foco del día <span className="font-normal text-z-soft">(opcional)</span>
        </label>
        <input
          id={`${baseId}-focus`}
          className={ownerUi.field}
          value={draft.focus}
          maxLength={PLAN_FOCUS_MAX}
          onChange={(event) => onChange({ ...draft, focus: event.target.value })}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className={ownerUi.label}>Bloques</legend>
        {draft.blocks.map((block, index) => {
          const id = `${baseId}-block-${index}`;
          const apparatusOptions = block.discipline ? PLAN_APPARATUS_BY_DISCIPLINE[block.discipline] : [];
          return (
            <div
              key={block.id ?? `new-${index}`}
              role="group"
              aria-label={`Bloque ${index + 1}`}
              className="grid gap-2 rounded-md border border-z-line bg-white p-3"
            >
              <p className={ownerUi.smallLabel}>Bloque {index + 1}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="grid gap-1">
                  <label className="text-xs font-semibold text-z-soft" htmlFor={`${id}-kind`}>
                    Tipo
                  </label>
                  <select
                    id={`${id}-kind`}
                    className={ownerUi.field}
                    value={block.kind}
                    onChange={(event) => updateBlock(index, { kind: event.target.value as BlockKind })}
                  >
                    {BLOCK_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {blockKindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-semibold text-z-soft" htmlFor={`${id}-discipline`}>
                    Disciplina
                  </label>
                  <select
                    id={`${id}-discipline`}
                    className={ownerUi.field}
                    value={block.discipline ?? ""}
                    onChange={(event) =>
                      updateBlock(index, {
                        discipline: (event.target.value || null) as PlanDiscipline | null,
                        apparatus: null,
                      })
                    }
                  >
                    <option value="">Sin disciplina</option>
                    {PLAN_DISCIPLINES.map((discipline) => (
                      <option key={discipline} value={discipline}>
                        {planDisciplineLabels[discipline]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-semibold text-z-soft" htmlFor={`${id}-apparatus`}>
                    Aparato
                  </label>
                  <select
                    id={`${id}-apparatus`}
                    className={ownerUi.field}
                    value={block.apparatus ?? ""}
                    disabled={!block.discipline}
                    onChange={(event) =>
                      updateBlock(index, { apparatus: (event.target.value || null) as PlanApparatus | null })
                    }
                  >
                    <option value="">Sin aparato</option>
                    {apparatusOptions.map((apparatus) => (
                      <option key={apparatus} value={apparatus}>
                        {planApparatusLabels[apparatus]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-z-soft" htmlFor={`${id}-content`}>
                  Contenido
                </label>
                <textarea
                  id={`${id}-content`}
                  className={`${ownerUi.field} min-h-20 py-2`}
                  value={block.content}
                  maxLength={BLOCK_CONTENT_MAX}
                  required
                  onChange={(event) => updateBlock(index, { content: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <label className="text-xs font-semibold text-z-soft" htmlFor={`${id}-duration`}>
                    Minutos aprox.
                  </label>
                  <input
                    id={`${id}-duration`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={BLOCK_DURATION_MAX}
                    className={`${ownerUi.field} w-28`}
                    value={block.durationMinutes ?? ""}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      updateBlock(index, {
                        durationMinutes: Number.isFinite(value) ? Math.min(Math.max(value, 1), BLOCK_DURATION_MAX) : null,
                      });
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={ownerUi.iconButton}
                  aria-label={`Subir el bloque ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={ownerUi.iconButton}
                  aria-label={`Bajar el bloque ${index + 1}`}
                  disabled={index === draft.blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={ownerUi.iconButton}
                  aria-label={`Quitar el bloque ${index + 1}`}
                  onClick={() => onChange({ ...draft, blocks: draft.blocks.filter((_, position) => position !== index) })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
        {draft.blocks.length < BLOCKS_MAX ? (
          <button
            type="button"
            className={ownerUi.secondaryButton}
            onClick={() => onChange({ ...draft, blocks: [...draft.blocks, emptyBlock()] })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Añadir bloque
          </button>
        ) : (
          <p className={ownerUi.help}>Un guion admite hasta {BLOCKS_MAX} bloques.</p>
        )}
      </fieldset>

      {view.objectiveOptions.length > 0 ? (
        <fieldset className="grid gap-1">
          <legend className={ownerUi.label}>
            Objetivos de las gimnastas <span className="font-normal text-z-soft">(opcional)</span>
          </legend>
          {view.objectiveOptions.map((objective) => {
            const checked = draft.objectiveIds.includes(objective.objectiveId);
            return (
              <label key={objective.objectiveId} className="flex min-h-11 items-center gap-2 text-sm text-z-ink">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      ...draft,
                      objectiveIds: checked
                        ? draft.objectiveIds.filter((id) => id !== objective.objectiveId)
                        : [...draft.objectiveIds, objective.objectiveId],
                    })
                  }
                />
                <span className="min-w-0 break-words">
                  {objective.athleteName}: {objective.title}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      <div className="grid gap-1">
        <label htmlFor={`${baseId}-note`} className={ownerUi.label}>
          Nota <span className="font-normal text-z-soft">(opcional)</span>
        </label>
        <textarea
          id={`${baseId}-note`}
          className={`${ownerUi.field} min-h-20 py-2`}
          value={draft.note}
          maxLength={PLAN_NOTE_MAX}
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </div>

      {invalid ? <p className={ownerUi.help}>Cada bloque necesita un contenido.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={ownerUi.primaryButton} disabled={busy || invalid}>
          {busy ? "Guardando…" : "Guardar guion"}
        </button>
        <button type="button" className={ownerUi.secondaryButton} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
