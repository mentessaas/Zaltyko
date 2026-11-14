"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  apparatusLabel,
  DESCRIPTION_MAX,
  ELEMENT_NAME_MAX,
  GENERAL_APPARATUS_LABEL,
  LEVEL_NAME_MAX,
  MAX_ELEMENTS_PER_LEVEL,
  MAX_LEVELS_PER_TEMPLATE,
  SKILL_APPARATUS_BY_DISCIPLINE,
  SKILL_DISCIPLINES,
  skillDisciplineLabels,
  STARTER_TEMPLATE_NOTICE,
  TEMPLATE_NAME_MAX,
  type SkillApparatus,
  type SkillDiscipline,
  type SkillTemplateSummary,
  type SkillTemplatesListView,
  type SkillTemplateView,
} from "@/modules/skill-levels/domain/skill-levels";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";

import {
  fetchTemplate,
  fetchTemplates,
  newClientRequestId,
  postTemplate,
  putTemplate,
  SKILL_UNAVAILABLE_MESSAGE,
  type CreateTemplateBody,
  type SkillScope,
} from "./skill-levels-client";

type ListState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SkillTemplatesListView };

/**
 * Plantillas de niveles de la academia: crear (en blanco, desde un ejemplo o
 * copiando una propia), editar niveles y elementos, y archivar. Las plantillas
 * de ejemplo son orientativas y no reproducen el reglamento de ninguna
 * federación. Todo pasa por la API, que exige rol de dirección,
 * administración o coordinación para escribir.
 */
export function SkillTemplatesManager({ organizationId, locationId }: { organizationId: string; locationId: string }) {
  const scope: SkillScope = { organizationId, locationId };
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    const result = await fetchTemplates({ organizationId, locationId }, showArchived);
    if (current !== sequence.current) return;
    if (result.status === "ok") setState({ status: "ready", data: result.data });
    else if (result.status === "unavailable") setState({ status: "unavailable" });
    else setState({ status: "error", message: result.message });
  }, [organizationId, locationId, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <p className={ownerUi.muted} role="status">
        Cargando plantillas…
      </p>
    );
  }
  if (state.status === "unavailable") return <p className={ownerTone.noticeWarning}>{SKILL_UNAVAILABLE_MESSAGE}</p>;
  if (state.status === "error") {
    return (
      <div className={`${ownerUi.noticeError} grid gap-3`}>
        <p role="alert">{state.message}</p>
        <button type="button" className={ownerUi.secondaryButton} onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { data } = state;
  const writable = data.canManage && !data.readOnly;

  if (editingId) {
    return (
      <TemplateEditor
        scope={scope}
        templateId={editingId}
        writable={writable}
        onClose={async (message) => {
          setEditingId(null);
          if (message) setNotice(message);
          await load();
        }}
      />
    );
  }

  async function setArchived(template: SkillTemplateSummary, archived: boolean) {
    setError("");
    const full = await fetchTemplate(scope, template.id);
    if (full.status !== "ok") {
      setError(full.status === "error" ? full.message : SKILL_UNAVAILABLE_MESSAGE);
      return;
    }
    const result = await putTemplate(scope, template.id, {
      expectedRevision: full.data.revision,
      name: full.data.name,
      description: full.data.description,
      archived,
      levels: full.data.levels.map((level) => ({
        id: level.id,
        name: level.name,
        description: level.description,
        elements: level.elements.map((element) => ({
          id: element.id,
          name: element.name,
          apparatus: element.apparatus,
          description: element.description,
          required: element.required,
        })),
      })),
    });
    if (result.status === "ok") {
      setNotice(archived ? `«${template.name}» archivada. El progreso se conserva.` : `«${template.name}» restaurada.`);
      await load();
    } else {
      setError(result.status === "error" ? result.message : SKILL_UNAVAILABLE_MESSAGE);
    }
  }

  return (
    <div className="grid gap-6">
      {data.readOnly ? (
        <p className={ownerTone.noticeWarning}>
          La academia está en solo lectura: puedes consultar las plantillas, pero no crearlas ni editarlas.
        </p>
      ) : null}
      {!data.canManage ? (
        <p className={ownerUi.noticeInfo}>
          Solo la dirección, la administración y la coordinación editan las plantillas. Tú las ves y evalúas con ellas.
        </p>
      ) : null}
      <div role="status" aria-live="polite">
        {notice ? <p className={ownerUi.noticeInfo}>{notice}</p> : null}
      </div>
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={ownerUi.sectionTitle}>Plantillas de tu academia</h2>
          <label className="flex min-h-11 items-center gap-2 text-sm text-z-ink">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#1E3FA8]"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Ver archivadas
          </label>
        </div>
        {data.templates.length === 0 ? (
          <p className={ownerUi.muted}>
            Todavía no tienes plantillas. Empieza desde un ejemplo o crea una en blanco.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.templates.map((template) => (
              <li key={template.id} className={`${ownerUi.listItem} grid gap-2`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold text-z-ink">{template.name}</p>
                  {template.archived ? <span className={ownerUi.chip}>Archivada</span> : null}
                </div>
                <p className={ownerUi.help}>
                  {skillDisciplineLabels[template.discipline]} · {template.levelCount} niveles · {template.elementCount}{" "}
                  elementos
                  {template.source === "starter" ? " · Basada en un ejemplo" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ownerUi.secondaryButton} onClick={() => setEditingId(template.id)}>
                    {writable ? "Editar" : "Ver"}
                  </button>
                  {writable ? (
                    <button
                      type="button"
                      className={ownerUi.secondaryButton}
                      onClick={() => void setArchived(template, !template.archived)}
                    >
                      {template.archived ? "Restaurar" : "Archivar"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {writable ? (
        <CreateTemplateForm
          scope={scope}
          data={data}
          onCreated={async (message, newId) => {
            setNotice(message);
            await load();
            setEditingId(newId);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTemplateForm({
  scope,
  data,
  onCreated,
}: {
  scope: SkillScope;
  data: SkillTemplatesListView;
  onCreated: (message: string, templateId: string) => Promise<void>;
}) {
  const [source, setSource] = useState<"starter" | "blank" | "copy">(data.starters.length > 0 ? "starter" : "blank");
  const [starterKey, setStarterKey] = useState(data.starters[0]?.key ?? "");
  const [copyId, setCopyId] = useState(data.templates.find((entry) => !entry.archived)?.id ?? "");
  const [discipline, setDiscipline] = useState<SkillDiscipline>("artistic_female");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(newClientRequestId());
  const nameId = useId();
  const sourceId = useId();

  const activeTemplates = data.templates.filter((entry) => !entry.archived);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    let body: CreateTemplateBody;
    if (source === "blank") {
      if (name.trim().length < 2) return setError("Escribe un nombre de al menos 2 caracteres.");
      body = { source: "blank", discipline, name: name.trim() };
    } else if (source === "starter") {
      body = { source: "starter", starterKey, name: name.trim() ? name.trim() : null };
    } else {
      if (name.trim().length < 2) return setError("Escribe un nombre de al menos 2 caracteres para la copia.");
      body = { source: "copy", templateId: copyId, name: name.trim() };
    }
    setBusy(true);
    setError("");
    const result = await postTemplate(scope, { ...body, clientRequestId: requestId.current });
    setBusy(false);
    if (result.status === "ok") {
      requestId.current = newClientRequestId();
      setName("");
      await onCreated("Plantilla creada. Ajusta los niveles y elementos a tu academia.", result.data.id);
    } else {
      setError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <form onSubmit={submit} className={`${ownerUi.card} grid gap-4`} aria-label="Nueva plantilla">
      <h2 className={ownerUi.sectionTitle}>Nueva plantilla</h2>
      <div className="grid gap-1">
        <label htmlFor={sourceId} className={ownerUi.label}>
          ¿De dónde parte?
        </label>
        <select
          id={sourceId}
          className={ownerUi.field}
          value={source}
          onChange={(event) => setSource(event.target.value as "starter" | "blank" | "copy")}
        >
          <option value="starter">De un ejemplo de Zaltyko</option>
          <option value="blank">En blanco</option>
          {activeTemplates.length > 0 ? <option value="copy">Copia de una plantilla mía</option> : null}
        </select>
      </div>

      {source === "starter" ? (
        <div className="grid gap-2">
          <fieldset className="grid gap-2">
            <legend className={ownerUi.label}>Ejemplo</legend>
            {data.starters.map((starter) => (
              <label
                key={starter.key}
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border border-z-line bg-white px-3 py-2"
              >
                <input
                  type="radio"
                  name="starter"
                  className="mt-1 h-5 w-5 accent-[#1E3FA8]"
                  checked={starterKey === starter.key}
                  onChange={() => setStarterKey(starter.key)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-z-ink">{starter.name}</span>
                  <span className={ownerUi.help}>
                    {skillDisciplineLabels[starter.discipline]} · {starter.levelCount} niveles · {starter.elementCount}{" "}
                    elementos
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className={ownerTone.noticeNeutral}>{STARTER_TEMPLATE_NOTICE}</p>
        </div>
      ) : null}

      {source === "blank" ? (
        <div className="grid gap-1">
          <label htmlFor={`${nameId}-d`} className={ownerUi.label}>
            Disciplina
          </label>
          <select
            id={`${nameId}-d`}
            className={ownerUi.field}
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value as SkillDiscipline)}
          >
            {SKILL_DISCIPLINES.map((entry) => (
              <option key={entry} value={entry}>
                {skillDisciplineLabels[entry]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {source === "copy" ? (
        <div className="grid gap-1">
          <label htmlFor={`${nameId}-c`} className={ownerUi.label}>
            Plantilla que se copia
          </label>
          <select id={`${nameId}-c`} className={ownerUi.field} value={copyId} onChange={(event) => setCopyId(event.target.value)}>
            {activeTemplates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-1">
        <label htmlFor={nameId} className={ownerUi.label}>
          Nombre {source === "starter" ? "(opcional)" : ""}
        </label>
        <input
          id={nameId}
          className={ownerUi.field}
          value={name}
          maxLength={TEMPLATE_NAME_MAX}
          placeholder={source === "starter" ? "Si lo dejas vacío, usa el del ejemplo" : "Por ejemplo: Base 2 GAF"}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className={ownerUi.noticeError}>
          {error}
        </p>
      ) : null}
      <div>
        <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
          {busy ? "Creando…" : "Crear plantilla"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Editor                                                                    */
/* ------------------------------------------------------------------------ */

type DraftElement = {
  key: string;
  id: string | null;
  name: string;
  apparatus: SkillApparatus | null;
  description: string | null;
  required: boolean;
};
type DraftLevel = { key: string; id: string | null; name: string; description: string | null; elements: DraftElement[] };

function toDraft(template: SkillTemplateView): DraftLevel[] {
  return template.levels.map((level) => ({
    key: level.id,
    id: level.id,
    name: level.name,
    description: level.description,
    elements: level.elements.map((element) => ({
      key: element.id,
      id: element.id,
      name: element.name,
      apparatus: element.apparatus,
      description: element.description,
      required: element.required,
    })),
  }));
}

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item!);
  return copy;
}

function TemplateEditor({
  scope,
  templateId,
  writable,
  onClose,
}: {
  scope: SkillScope;
  templateId: string;
  writable: boolean;
  onClose: (message?: string) => Promise<void>;
}) {
  const [template, setTemplate] = useState<SkillTemplateView | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levels, setLevels] = useState<DraftLevel[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const descId = useId();

  const load = useCallback(async () => {
    const result = await fetchTemplate(scope, templateId);
    if (result.status === "ok") {
      setTemplate(result.data);
      setName(result.data.name);
      setDescription(result.data.description ?? "");
      setLevels(toDraft(result.data));
      setLoadError("");
    } else {
      setLoadError(result.status === "error" ? result.message : SKILL_UNAVAILABLE_MESSAGE);
    }
  }, [scope, templateId]);

  useEffect(() => {
    void load();
    // scope es estable por valor (organizationId y locationId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  if (loadError) {
    return (
      <div className={`${ownerUi.noticeError} grid gap-3`}>
        <p role="alert">{loadError}</p>
        <button type="button" className={ownerUi.secondaryButton} onClick={() => void onClose()}>
          Volver a las plantillas
        </button>
      </div>
    );
  }
  if (!template) {
    return (
      <p className={ownerUi.muted} role="status">
        Cargando plantilla…
      </p>
    );
  }

  const discipline = template.discipline;
  const apparatusOptions = SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly SkillApparatus[];
  const editable = writable && !template.archived;

  function updateLevel(index: number, patch: Partial<DraftLevel>) {
    setLevels((list) => list.map((level, i) => (i === index ? { ...level, ...patch } : level)));
  }
  function updateElement(levelIndex: number, elementIndex: number, patch: Partial<DraftElement>) {
    setLevels((list) =>
      list.map((level, i) =>
        i === levelIndex
          ? { ...level, elements: level.elements.map((element, j) => (j === elementIndex ? { ...element, ...patch } : element)) }
          : level
      )
    );
  }

  async function save(archived: boolean) {
    if (busy || !template) return;
    setBusy(true);
    setSaveError("");
    const result = await putTemplate(scope, template.id, {
      expectedRevision: template.revision,
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      archived,
      levels: levels.map((level) => ({
        id: level.id,
        name: level.name.trim(),
        description: level.description,
        elements: level.elements.map((element) => ({
          id: element.id,
          name: element.name.trim(),
          apparatus: element.apparatus,
          description: element.description,
          required: element.required,
        })),
      })),
    });
    setBusy(false);
    if (result.status === "ok") {
      await onClose(archived ? `«${name.trim()}» archivada.` : `«${name.trim()}» guardada.`);
    } else {
      setSaveError(result.status === "unavailable" ? SKILL_UNAVAILABLE_MESSAGE : result.message);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={ownerUi.sectionTitle}>{editable ? "Editar plantilla" : "Plantilla"}</h2>
        <button type="button" className={ownerUi.secondaryButton} onClick={() => void onClose()}>
          Volver a las plantillas
        </button>
      </div>
      {template.archived ? <p className={ownerTone.noticeWarning}>Plantilla archivada. Restáurala desde la lista para editarla.</p> : null}
      {template.source === "starter" ? <p className={ownerTone.noticeNeutral}>{STARTER_TEMPLATE_NOTICE}</p> : null}
      <p className={ownerUi.help}>
        {skillDisciplineLabels[discipline]}. Lo que quites se archiva: el progreso ya registrado se conserva.
      </p>

      <div className={`${ownerUi.card} grid gap-4`}>
        <div className="grid gap-1">
          <label htmlFor={nameId} className={ownerUi.label}>
            Nombre
          </label>
          <input
            id={nameId}
            className={ownerUi.field}
            value={name}
            maxLength={TEMPLATE_NAME_MAX}
            disabled={!editable}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={descId} className={ownerUi.label}>
            Descripción (opcional)
          </label>
          <input
            id={descId}
            className={ownerUi.field}
            value={description}
            maxLength={DESCRIPTION_MAX}
            disabled={!editable}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <ol className="grid gap-4">
        {levels.map((level, levelIndex) => (
          <li key={level.key} className={`${ownerUi.card} grid gap-3`}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <label htmlFor={`${level.key}-name`} className={ownerUi.label}>
                  Nivel {levelIndex + 1}
                </label>
                <input
                  id={`${level.key}-name`}
                  className={ownerUi.field}
                  value={level.name}
                  maxLength={LEVEL_NAME_MAX}
                  disabled={!editable}
                  onChange={(event) => updateLevel(levelIndex, { name: event.target.value })}
                />
              </div>
              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ownerUi.secondaryButton}
                    disabled={levelIndex === 0}
                    aria-label={`Subir el nivel ${level.name}`}
                    onClick={() => setLevels((list) => move(list, levelIndex, -1))}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className={ownerUi.secondaryButton}
                    disabled={levelIndex === levels.length - 1}
                    aria-label={`Bajar el nivel ${level.name}`}
                    onClick={() => setLevels((list) => move(list, levelIndex, 1))}
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    className={ownerTone.dangerOutlineButton}
                    disabled={levels.length === 1}
                    aria-label={`Quitar el nivel ${level.name}`}
                    onClick={() => setLevels((list) => list.filter((_, i) => i !== levelIndex))}
                  >
                    Quitar nivel
                  </button>
                </div>
              ) : null}
            </div>

            <ul className="grid gap-3">
              {level.elements.map((element, elementIndex) => (
                <li key={element.key} className={`${ownerUi.subtlePanel} grid gap-2`}>
                  <div className="grid gap-1">
                    <label htmlFor={`${element.key}-name`} className={ownerUi.smallLabel}>
                      Elemento
                    </label>
                    <input
                      id={`${element.key}-name`}
                      className={ownerUi.field}
                      value={element.name}
                      maxLength={ELEMENT_NAME_MAX}
                      disabled={!editable}
                      onChange={(event) => updateElement(levelIndex, elementIndex, { name: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid min-w-40 gap-1">
                      <label htmlFor={`${element.key}-app`} className={ownerUi.smallLabel}>
                        Aparato
                      </label>
                      <select
                        id={`${element.key}-app`}
                        className={ownerUi.field}
                        value={element.apparatus ?? ""}
                        disabled={!editable}
                        onChange={(event) =>
                          updateElement(levelIndex, elementIndex, {
                            apparatus: (event.target.value || null) as SkillApparatus | null,
                          })
                        }
                      >
                        <option value="">{GENERAL_APPARATUS_LABEL}</option>
                        {apparatusOptions.map((apparatus) => (
                          <option key={apparatus} value={apparatus}>
                            {apparatusLabel(apparatus)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex min-h-12 items-center gap-2 text-sm text-z-ink">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#1E3FA8]"
                        checked={element.required}
                        disabled={!editable}
                        onChange={(event) => updateElement(levelIndex, elementIndex, { required: event.target.checked })}
                      />
                      Obligatorio para pasar de nivel
                    </label>
                    {editable ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={ownerUi.secondaryButton}
                          disabled={elementIndex === 0}
                          aria-label={`Subir ${element.name || "el elemento"}`}
                          onClick={() => updateLevel(levelIndex, { elements: move(level.elements, elementIndex, -1) })}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          className={ownerUi.secondaryButton}
                          disabled={elementIndex === level.elements.length - 1}
                          aria-label={`Bajar ${element.name || "el elemento"}`}
                          onClick={() => updateLevel(levelIndex, { elements: move(level.elements, elementIndex, 1) })}
                        >
                          Bajar
                        </button>
                        <button
                          type="button"
                          className={ownerTone.dangerOutlineButton}
                          aria-label={`Quitar ${element.name || "el elemento"}`}
                          onClick={() =>
                            updateLevel(levelIndex, { elements: level.elements.filter((_, j) => j !== elementIndex) })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            {editable ? (
              <div>
                <button
                  type="button"
                  className={ownerUi.secondaryButton}
                  disabled={level.elements.length >= MAX_ELEMENTS_PER_LEVEL}
                  onClick={() =>
                    updateLevel(levelIndex, {
                      elements: [
                        ...level.elements,
                        { key: crypto.randomUUID(), id: null, name: "", apparatus: null, description: null, required: true },
                      ],
                    })
                  }
                >
                  Añadir elemento
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {editable ? (
        <div className="grid gap-3">
          <div>
            <button
              type="button"
              className={ownerUi.secondaryButton}
              disabled={levels.length >= MAX_LEVELS_PER_TEMPLATE}
              onClick={() =>
                setLevels((list) => [
                  ...list,
                  { key: crypto.randomUUID(), id: null, name: `Nivel ${list.length + 1}`, description: null, elements: [] },
                ])
              }
            >
              Añadir nivel
            </button>
          </div>
          {saveError ? (
            <p role="alert" className={ownerUi.noticeError}>
              {saveError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ownerUi.primaryButton} disabled={busy} onClick={() => void save(false)}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" className={ownerTone.dangerOutlineButton} disabled={busy} onClick={() => void save(true)}>
              Archivar plantilla
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
