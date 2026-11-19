"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  CATALOG_APPARATUS,
  ELEMENT_LIBRARY_UNAVAILABLE_REASON,
  type CatalogApparatus,
  type CatalogDiscipline,
} from "@/modules/element-library/domain/element-library";
import type { CatalogSearchResult } from "@/modules/element-library/domain/library-requests";
import {
  apparatusLabel,
  SKILL_APPARATUS_BY_DISCIPLINE,
  skillDisciplineLabels,
} from "@/modules/skill-levels/domain/skill-levels";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { formatCatalogValue } from "./format";

/** Lo que recibe quien abre el selector al elegir un elemento. */
export type CatalogPickerElement = {
  id: string;
  name: string;
  shortName: string;
  apparatus: CatalogApparatus;
};

export type CatalogElementPickerProps = {
  organizationId: string;
  locationId: string;
  discipline: CatalogDiscipline;
  /** Aparato con el que se abre el filtro; null muestra todos los de la disciplina. */
  apparatus: string | null;
  onSelect: (element: CatalogPickerElement) => void;
  onClose: () => void;
  /** Título del diálogo; por defecto, el de las plantillas de niveles. */
  title?: string;
  /** Texto tras la disciplina; por defecto, el de las plantillas de niveles. */
  description?: string;
};

const DEFAULT_TITLE = "Añadir desde la biblioteca";
const DEFAULT_DESCRIPTION = "Al elegir un elemento se añade con su nombre corto, que puedes cambiar.";

type SearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: CatalogSearchResult };

const UNAVAILABLE_MESSAGE = "La biblioteca de elementos todavía no está disponible en tu academia.";
const GENERIC_ERROR = "No se ha podido cargar la biblioteca. Comprueba la conexión e inténtalo de nuevo.";
const SEARCH_LIMIT = 50;

function isCatalogApparatus(value: string | null): value is CatalogApparatus {
  return value !== null && (CATALOG_APPARATUS as readonly string[]).includes(value);
}

function problemMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === "object") {
    const { errors, detail } = payload as { errors?: { reason?: unknown }; detail?: unknown };
    if (status === 503 && errors?.reason === ELEMENT_LIBRARY_UNAVAILABLE_REASON) return UNAVAILABLE_MESSAGE;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return GENERIC_ERROR;
}

/**
 * Selector de elementos de la biblioteca (diálogo accesible): filtra por
 * aparato de la disciplina y busca por nombre con GET
 * /api/v1/owner/element-library. Solo lista elementos revisados de la edición
 * publicada. Lo usan las plantillas de niveles y los bloques de los guiones.
 */
export function CatalogElementPicker({
  organizationId,
  locationId,
  discipline,
  apparatus: initialApparatus,
  onSelect,
  onClose,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: CatalogElementPickerProps) {
  const apparatusOptions = SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly CatalogApparatus[];
  const [apparatus, setApparatus] = useState<CatalogApparatus | null>(
    isCatalogApparatus(initialApparatus) && apparatusOptions.includes(initialApparatus) ? initialApparatus : null
  );
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "loading" });
  const sequence = useRef(0);
  const apparatusId = useId();
  const searchId = useId();

  useEffect(() => {
    const current = ++sequence.current;
    setState({ status: "loading" });
    const params = new URLSearchParams({ organizationId, locationId, discipline, limit: String(SEARCH_LIMIT) });
    if (apparatus) params.set("apparatus", apparatus);
    if (query) params.set("q", query);
    void (async () => {
      let next: SearchState;
      try {
        const response = await fetch(`/api/v1/owner/element-library?${params.toString()}`, { cache: "no-store" });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) next = { status: "error", message: problemMessage(response.status, payload) };
        else if (payload && typeof payload === "object" && "data" in payload) {
          next = { status: "ready", result: (payload as { data: CatalogSearchResult }).data };
        } else next = { status: "error", message: GENERIC_ERROR };
      } catch {
        next = { status: "error", message: GENERIC_ERROR };
      }
      if (current === sequence.current) setState(next);
    })();
  }, [organizationId, locationId, discipline, apparatus, query]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(text.trim());
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle className="text-xl">{title}</DialogTitle>
        <DialogDescription>
          {skillDisciplineLabels[discipline]}. {description}
        </DialogDescription>

        <form className="flex flex-wrap items-end gap-3" onSubmit={search}>
          <div className="grid min-w-40 gap-1">
            <label htmlFor={apparatusId} className={ownerUi.smallLabel}>
              Aparato
            </label>
            <select
              id={apparatusId}
              className={ownerUi.field}
              value={apparatus ?? ""}
              onChange={(event) => setApparatus((event.target.value || null) as CatalogApparatus | null)}
            >
              <option value="">Todos los aparatos</option>
              {apparatusOptions.map((option) => (
                <option key={option} value={option}>
                  {apparatusLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <label htmlFor={searchId} className={ownerUi.smallLabel}>
              Buscar por nombre
            </label>
            <input
              id={searchId}
              type="search"
              className={ownerUi.field}
              value={text}
              maxLength={80}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <button type="submit" className={ownerUi.secondaryButton}>
            Buscar
          </button>
        </form>

        {/* Solo el estado y el recuento se anuncian; la lista no. */}
        <div role="status" aria-live="polite">
          {state.status === "loading" ? (
            <p className={ownerUi.muted}>Buscando elementos…</p>
          ) : state.status === "error" ? null : state.result.edition === null ? (
            <p className={ownerUi.muted}>Aún no hay elementos revisados en esta disciplina</p>
          ) : state.result.elements.length === 0 ? (
            <p className={ownerUi.muted}>No hay elementos con esos filtros.</p>
          ) : (
            <p className={ownerUi.help}>
              {state.result.elements.length === 1 ? "1 elemento" : `${state.result.elements.length} elementos`}
              {state.result.truncated ? ". Hay más resultados: afina la búsqueda." : ""}
            </p>
          )}
        </div>
        {state.status === "error" ? (
          <p role="alert" className={ownerUi.noticeError}>
            {state.message}
          </p>
        ) : null}
        {state.status === "ready" && state.result.edition !== null && state.result.elements.length > 0 ? (
          <ul className="grid gap-2">
            {state.result.elements.map((element) => (
              <li key={element.id}>
                <button
                  type="button"
                  className={`${ownerTone.innerPanel} grid w-full gap-1 text-left hover:bg-z-canvas`}
                  onClick={() =>
                    onSelect({
                      id: element.id,
                      name: element.name,
                      shortName: element.shortName,
                      apparatus: element.apparatus,
                    })
                  }
                >
                  <span className="font-semibold text-z-ink">{element.shortName}</span>
                  <span className={ownerUi.help}>
                    {element.name} · {apparatusLabel(element.apparatus)} · Grupo {element.group} ·{" "}
                    {formatCatalogValue(element)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {state.status === "ready" && state.result.edition ? (
          <p className={ownerUi.help}>{state.result.edition.attribution}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
