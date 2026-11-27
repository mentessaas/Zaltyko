"use client";

import { useId, useState, type FormEvent } from "react";

import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { cn } from "@/lib/utils";
import { ELEMENT_NOTE_MAX } from "@/modules/element-library/domain/element-library";
import type { CatalogElementCard, ElementNoteView } from "@/modules/element-library/domain/library-requests";
import { skillApparatusLabels } from "@/modules/skill-levels/domain/skill-levels";

import { ElementAttribution } from "./ElementAttribution";
import dynamic from "next/dynamic";
import { LIBRARY_UNAVAILABLE_MESSAGE, putElementNote, type LibraryScope } from "./element-library-client";
import { formatCatalogGroup, formatCatalogValue, formatFigReference } from "./format";

const ElementAnimation = dynamic(
  () => import("@/modules/element-library/animation/ElementAnimation").then((module) => module.ElementAnimation),
  { ssr: false },
);

/**
 * Ficha de un elemento (ADR-0029 §1.8 y §2): aparato, grupo, valor, referencia
 * del Código (solo como referencia), descripción si la API la trae, nota de la
 * academia y pie de atribución. El título lo pone quien la abre.
 */
export function ElementCard({
  scope,
  card,
  animationsEnabled,
  groupLabel,
  onNoteSaved,
  onReload,
}: {
  scope: LibraryScope;
  card: CatalogElementCard;
  animationsEnabled: boolean;
  groupLabel?: string | null;
  onNoteSaved: (note: ElementNoteView | null) => void;
  onReload: () => void;
}) {
  const noteId = useId();
  const noteHelpId = useId();
  const [text, setText] = useState(card.note?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const saved = card.note?.text ?? "";
  const dirty = text !== saved;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (card.readOnly || saving || !dirty) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const result = await putElementNote(scope, card.id, {
      expectedRevision: card.note?.revision ?? null,
      note: text.trim() ? text : null,
    });
    setSaving(false);
    if (result.status === "ok") {
      setText(result.data.note?.text ?? "");
      onNoteSaved(result.data.note);
      setMessage(result.data.note ? "Nota guardada." : "Nota borrada.");
      return;
    }
    if (result.status === "unavailable") {
      setError({ message: LIBRARY_UNAVAILABLE_MESSAGE, conflict: false });
      return;
    }
    setError({ message: result.message, conflict: result.code === 409 });
  }

  return (
    <div className="grid gap-5">
      {animationsEnabled ? (
        <ElementAnimation
          key={`${card.edition.code}:${card.elementKey}`}
          elementId={card.id}
          edition={card.edition.code}
          elementKey={card.elementKey}
          organizationId={scope.organizationId}
          locationId={scope.locationId}
        />
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-0.5">
          <dt className={ownerUi.smallLabel}>Nombre corto</dt>
          <dd className="text-sm text-z-ink">{card.shortName}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className={ownerUi.smallLabel}>Aparato</dt>
          <dd className="text-sm text-z-ink">{skillApparatusLabels[card.apparatus]}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className={ownerUi.smallLabel}>Grupo</dt>
          <dd className="text-sm text-z-ink">{formatCatalogGroup(card.group, groupLabel)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className={ownerUi.smallLabel}>Valor</dt>
          <dd className="text-sm font-semibold tabular-nums text-z-ink">{formatCatalogValue(card)}</dd>
        </div>
        {card.figReference ? (
          <div className="grid gap-0.5">
            <dt className={ownerUi.smallLabel}>Referencia FIG</dt>
            <dd className="text-sm tabular-nums text-z-ink">{formatFigReference(card.figReference)}</dd>
          </div>
        ) : null}
      </dl>

      {card.description ? (
        <section className="grid gap-1" aria-labelledby={`${noteId}-description`}>
          <h3 id={`${noteId}-description`} className={ownerUi.label}>
            Descripción
          </h3>
          <p className="text-sm leading-6 text-z-ink">{card.description}</p>
        </section>
      ) : null}

      {card.localVocabulary ? (
        <section className="grid gap-2" aria-labelledby={`${noteId}-local`}>
          <h3 id={`${noteId}-local`} className={ownerUi.label}>
            Así se dice en {card.localVocabulary.countryName}
          </h3>
          <p className={ownerUi.help}>Esta ficha usa las palabras de España. En tu país se dice:</p>
          <dl className="grid gap-2">
            {card.localVocabulary.terms.map((term) => (
              <div key={term.key} className="grid gap-0.5">
                <dt className="text-sm text-z-ink">
                  <span className="sr-only">En España, </span>
                  {term.es}
                </dt>
                <dd className="text-sm font-semibold text-z-ink">
                  <span className="sr-only">en {card.localVocabulary?.countryName}, </span>
                  <span aria-hidden="true">→ </span>
                  {term.local.join(" o ")}
                  {term.note ? <span className={cn(ownerUi.help, "block font-normal")}>{term.note}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <form className="grid gap-2" onSubmit={save} noValidate>
        <label htmlFor={noteId} className={ownerUi.label}>
          Nota de la academia
        </label>
        <p id={noteHelpId} className={ownerUi.help}>
          Esta nota la ve todo el equipo de la academia.
          {card.readOnly ? " Tu academia está en modo solo lectura: puedes leer la nota, pero no cambiarla." : null}
        </p>
        <textarea
          id={noteId}
          aria-describedby={noteHelpId}
          className={cn(ownerUi.field, "min-h-28 py-2 leading-6")}
          value={text}
          maxLength={ELEMENT_NOTE_MAX}
          readOnly={card.readOnly}
          onChange={(event) => {
            setText(event.target.value);
            setMessage(null);
          }}
          placeholder={card.readOnly ? undefined : "Correcciones, ayudas o progresiones que usáis en el club"}
        />
        <p className={cn(ownerUi.help, "tabular-nums")}>
          {text.length}/{ELEMENT_NOTE_MAX} caracteres
        </p>
        {error ? (
          <div role="alert" className={cn(ownerUi.noticeError, "grid gap-2")}>
            <p>{error.message}</p>
            {error.conflict ? (
              <button type="button" className={cn(ownerUi.secondaryButton, "justify-self-start")} onClick={onReload}>
                Cargar la última versión
              </button>
            ) : null}
          </div>
        ) : null}
        <p role="status" aria-live="polite" className={ownerUi.muted}>
          {message}
        </p>
        {card.readOnly ? null : (
          <button type="submit" className={cn(ownerUi.primaryButton, "justify-self-start")} disabled={saving || !dirty}>
            {saving ? "Guardando…" : "Guardar nota"}
          </button>
        )}
      </form>

      <ElementAttribution attribution={card.attribution} documentUrl={card.edition.documentUrl} />
    </div>
  );
}
