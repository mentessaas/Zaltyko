"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CatalogApparatus, CatalogDiscipline } from "@/modules/element-library/domain/element-library";
import type {
  CatalogElementCard,
  CatalogElementSummary,
  CatalogSearchResult,
  ElementNoteView,
} from "@/modules/element-library/domain/library-requests";
import {
  SKILL_APPARATUS_BY_DISCIPLINE,
  skillApparatusLabels,
  skillDisciplineLabels,
} from "@/modules/skill-levels/domain/skill-levels";

import { ElementAttribution } from "./ElementAttribution";
import { ElementCard } from "./ElementCard";
import {
  fetchCatalogElement,
  LIBRARY_UNAVAILABLE_MESSAGE,
  searchCatalog,
  type LibraryScope,
} from "./element-library-client";
import { formatCatalogGroup, formatCatalogValue } from "./format";

/** Por código de edición y aparato, los grupos con su nombre (de `data/editions.json`). */
export type ElementLibraryGroupLabels = Record<string, Partial<Record<string, { key: string; label: string }[]>>>;

export const NO_REVIEWED_ELEMENTS_TEXT = "Aún no hay elementos revisados en esta disciplina";

/** Letra (A a J) o puntos con hasta dos decimales, con coma o punto. */
const VALUE_PATTERN = /^(?:[A-Ja-j]|\d{1,2}(?:[.,]\d{1,2})?)$/;

type SearchState =
  | { status: "loading" }
  | { status: "ok"; data: CatalogSearchResult }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type CardState =
  | { status: "loading" }
  | { status: "ok"; card: CatalogElementCard }
  | { status: "error"; message: string };

function pluralElements(count: number): string {
  return count === 1 ? "1 elemento" : `${count} elementos`;
}

/**
 * Biblioteca de elementos para dirección y entrenadoras (ADR-0029 §1.8 y §2):
 * disciplina, filtros por aparato, grupo y valor, buscador por nombre, lista y
 * ficha con la nota de la academia. Solo texto: sin imágenes ni vídeos.
 */
export function ElementLibraryBrowser({
  organizationId,
  locationId,
  disciplines,
  groupLabels,
}: {
  organizationId: string;
  locationId: string;
  /** Disciplinas con edición publicada, en orden. */
  disciplines: CatalogDiscipline[];
  groupLabels: ElementLibraryGroupLabels;
}) {
  const scope: LibraryScope = { organizationId, locationId };
  const ids = {
    discipline: useId(),
    apparatus: useId(),
    group: useId(),
    query: useId(),
    value: useId(),
    valueError: useId(),
    results: useId(),
  };

  const [discipline, setDiscipline] = useState<CatalogDiscipline | null>(disciplines[0] ?? null);
  const [apparatus, setApparatus] = useState<CatalogApparatus | "">("");
  const [group, setGroup] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ q: string; value: string }>({ q: "", value: "" });
  const [search, setSearch] = useState<SearchState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  // Edición de la última búsqueda: los grupos se siguen ofreciendo mientras carga la siguiente.
  const [editionCode, setEditionCode] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [cardState, setCardState] = useState<CardState>({ status: "loading" });
  const [cardReload, setCardReload] = useState(0);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const searchRequest = useRef(0);
  const cardRequest = useRef(0);

  useEffect(() => {
    if (!discipline) return;
    const requestId = ++searchRequest.current;
    setSearch({ status: "loading" });
    void searchCatalog(
      { organizationId, locationId },
      { discipline, apparatus: apparatus || null, group: group || null, value: applied.value, q: applied.q }
    ).then((result) => {
      if (requestId !== searchRequest.current) return;
      if (result.status === "ok") {
        setSearch({ status: "ok", data: result.data });
        setEditionCode(result.data.edition?.code ?? null);
      } else if (result.status === "unavailable") {
        setSearch({ status: "unavailable" });
      } else {
        setSearch({ status: "error", message: result.message });
      }
    });
  }, [organizationId, locationId, discipline, apparatus, group, applied, retry]);

  useEffect(() => {
    if (!openId) return;
    const requestId = ++cardRequest.current;
    setCardState({ status: "loading" });
    void fetchCatalogElement({ organizationId, locationId }, openId).then((result) => {
      if (requestId !== cardRequest.current) return;
      if (result.status === "ok") setCardState({ status: "ok", card: result.data });
      else if (result.status === "unavailable") setCardState({ status: "error", message: LIBRARY_UNAVAILABLE_MESSAGE });
      else setCardState({ status: "error", message: result.message });
    });
  }, [organizationId, locationId, openId, cardReload]);

  const edition = search.status === "ok" ? search.data.edition : null;
  const elements = search.status === "ok" ? search.data.elements : [];
  const editionGroups = editionCode ? groupLabels[editionCode] : undefined;

  const apparatusOptions = discipline
    ? (SKILL_APPARATUS_BY_DISCIPLINE[discipline] as readonly CatalogApparatus[])
    : [];
  const labelledGroups = apparatus ? (editionGroups?.[apparatus] ?? []) : [];
  const groupOptions =
    labelledGroups.length > 0
      ? labelledGroups
      : [...new Set([...elements.map((element) => element.group), ...(group ? [group] : [])])]
          .sort((left, right) => left.localeCompare(right, "es", { numeric: true }))
          .map((key) => ({ key, label: "" }));

  const hasFilters = Boolean(apparatus || group || applied.q || applied.value);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = valueDraft.trim();
    if (value && !VALUE_PATTERN.test(value)) {
      setValueError("Escribe una letra de la A a la J o unos puntos, por ejemplo 4,20.");
      return;
    }
    setValueError(null);
    setApplied({ q: queryDraft.trim(), value });
  }

  function clearFilters() {
    setApparatus("");
    setGroup("");
    setQueryDraft("");
    setValueDraft("");
    setValueError(null);
    setApplied({ q: "", value: "" });
  }

  function openCard(element: CatalogElementSummary, trigger: HTMLButtonElement) {
    lastTrigger.current = trigger;
    setCardState({ status: "loading" });
    setOpenId(element.id);
  }

  function noteSaved(note: ElementNoteView | null) {
    setCardState((current) => (current.status === "ok" ? { status: "ok", card: { ...current.card, note } } : current));
    setSearch((current) =>
      current.status === "ok"
        ? {
            status: "ok",
            data: {
              ...current.data,
              elements: current.data.elements.map((element) =>
                element.id === openId ? { ...element, hasNote: note !== null } : element
              ),
            },
          }
        : current
    );
  }

  if (!discipline) {
    return (
      <section className={ownerUi.emptyState} aria-live="polite">
        <p className="text-base font-semibold text-z-ink">{NO_REVIEWED_ELEMENTS_TEXT}</p>
        <p className={cn(ownerUi.muted, "mt-1")}>Los elementos aparecen aquí cuando el equipo de Zaltyko los revisa.</p>
      </section>
    );
  }

  const openCardData = cardState.status === "ok" ? cardState.card : null;

  return (
    <div className="grid gap-6">
      <section className={cn(ownerUi.card, "grid gap-4")} aria-label="Filtros de la biblioteca">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <label htmlFor={ids.discipline} className={ownerUi.label}>
              Disciplina
            </label>
            <select
              id={ids.discipline}
              className={ownerUi.field}
              value={discipline}
              onChange={(event) => {
                setDiscipline(event.target.value as CatalogDiscipline);
                setApparatus("");
                setGroup("");
              }}
            >
              {disciplines.map((entry) => (
                <option key={entry} value={entry}>
                  {skillDisciplineLabels[entry]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.apparatus} className={ownerUi.label}>
              Aparato
            </label>
            <select
              id={ids.apparatus}
              className={ownerUi.field}
              value={apparatus}
              onChange={(event) => {
                setApparatus(event.target.value as CatalogApparatus | "");
                setGroup("");
              }}
            >
              <option value="">Todos los aparatos</option>
              {apparatusOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {skillApparatusLabels[entry]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.group} className={ownerUi.label}>
              Grupo
            </label>
            <select
              id={ids.group}
              className={ownerUi.field}
              value={group}
              disabled={!apparatus}
              aria-describedby={apparatus ? undefined : `${ids.group}-help`}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="">Todos los grupos</option>
              {groupOptions.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {formatCatalogGroup(entry.key, entry.label || null)}
                </option>
              ))}
            </select>
            {apparatus ? null : (
              <p id={`${ids.group}-help`} className={ownerUi.help}>
                Elige antes un aparato: cada aparato tiene sus propios grupos.
              </p>
            )}
          </div>
        </div>

        <form className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-start" onSubmit={applySearch} noValidate>
          <div className="grid gap-1.5">
            <label htmlFor={ids.query} className={ownerUi.label}>
              Buscar por nombre
            </label>
            <input
              id={ids.query}
              type="search"
              className={ownerUi.field}
              value={queryDraft}
              maxLength={80}
              placeholder="Por ejemplo, Yurchenko o rondada"
              onChange={(event) => setQueryDraft(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.value} className={ownerUi.label}>
              Valor
            </label>
            <input
              id={ids.value}
              type="text"
              className={ownerUi.field}
              value={valueDraft}
              maxLength={5}
              placeholder="D o 4,20"
              aria-invalid={valueError ? true : undefined}
              aria-describedby={valueError ? ids.valueError : undefined}
              onChange={(event) => setValueDraft(event.target.value)}
            />
            {valueError ? (
              <p id={ids.valueError} className="text-xs font-semibold leading-5 text-signal-ink">
                {valueError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:pt-7">
            <button type="submit" className={ownerUi.primaryButton}>
              Buscar
            </button>
            {hasFilters ? (
              <button type="button" className={ownerUi.secondaryButton} onClick={clearFilters}>
                Quitar filtros
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="grid gap-3" aria-labelledby={ids.results}>
        <h2 id={ids.results} className="sr-only">
          Elementos
        </h2>
        {search.status === "loading" ? (
          <p role="status" className={ownerUi.muted}>
            Cargando elementos…
          </p>
        ) : null}
        {search.status === "unavailable" ? <p className={ownerUi.noticeInfo}>{LIBRARY_UNAVAILABLE_MESSAGE}</p> : null}
        {search.status === "error" ? (
          <div role="alert" className={cn(ownerUi.noticeError, "grid gap-2")}>
            <p>{search.message}</p>
            <button
              type="button"
              className={cn(ownerUi.secondaryButton, "justify-self-start")}
              onClick={() => setRetry((count) => count + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {search.status === "ok" ? (
          !edition || (elements.length === 0 && !hasFilters) ? (
            <div className={ownerUi.emptyState}>
              <p className="text-base font-semibold text-z-ink">{NO_REVIEWED_ELEMENTS_TEXT}</p>
              <p className={cn(ownerUi.muted, "mt-1")}>
                Los elementos aparecen aquí cuando el equipo de Zaltyko los revisa.
              </p>
            </div>
          ) : elements.length === 0 ? (
            <div className={ownerUi.emptyState}>
              <p className="text-base font-semibold text-z-ink">Ningún elemento coincide con la búsqueda.</p>
              <button type="button" className={cn(ownerUi.secondaryButton, "mt-4")} onClick={clearFilters}>
                Quitar filtros
              </button>
            </div>
          ) : (
            <>
              <p role="status" className={ownerUi.muted}>
                {pluralElements(elements.length)}
                {search.data.truncated ? ". Hay más: afina la búsqueda con los filtros para verlos." : ""}
              </p>
              <ul className="grid gap-2">
                {elements.map((element) => (
                  <li key={element.id}>
                    <button
                      type="button"
                      className={cn(
                        ownerUi.listItem,
                        "flex w-full items-start justify-between gap-3 text-left transition-colors hover:border-z-brand-500 hover:bg-z-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500"
                      )}
                      onClick={(event) => openCard(element, event.currentTarget)}
                    >
                      <span className="grid min-w-0 gap-1">
                        <span className="font-semibold text-z-ink [overflow-wrap:anywhere]">{element.shortName}</span>
                        <span className="text-sm text-z-soft [overflow-wrap:anywhere]">{element.name}</span>
                        <span className="text-xs text-z-soft">
                          {skillApparatusLabels[element.apparatus]} · Grupo {element.group}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className={cn(ownerUi.chip, "tabular-nums")}>
                          <span className="sr-only">Valor </span>
                          {formatCatalogValue(element)}
                        </span>
                        {element.hasNote ? <span className={ownerUi.chipAccent}>Con nota</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {search.status === "ok" && edition ? (
          <ElementAttribution attribution={edition.attribution} documentUrl={edition.documentUrl} />
        ) : null}
      </section>

      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            lastTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="pr-10 font-display text-2xl font-black uppercase leading-none text-z-ink">
              {openCardData ? openCardData.name : "Ficha del elemento"}
            </DialogTitle>
            <DialogDescription className={ownerUi.muted}>
              Grupo y valor según el Código de Puntuación, y la nota técnica de tu academia.
            </DialogDescription>
          </DialogHeader>
          {cardState.status === "loading" ? (
            <p role="status" className={ownerUi.muted}>
              Cargando la ficha…
            </p>
          ) : null}
          {cardState.status === "error" ? (
            <p role="alert" className={ownerUi.noticeError}>
              {cardState.message}
            </p>
          ) : null}
          {openCardData ? (
            <ElementCard
              key={`${openCardData.id}:${cardReload}`}
              scope={scope}
              card={openCardData}
              groupLabel={
                groupLabels[openCardData.edition.code]?.[openCardData.apparatus]?.find(
                  (entry) => entry.key === openCardData.group
                )?.label ?? null
              }
              onNoteSaved={noteSaved}
              onReload={() => setCardReload((count) => count + 1)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
