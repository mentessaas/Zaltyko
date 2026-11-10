"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import type {
  CiSectionRow,
  CiSourceRow,
} from "@/db/schema/competitive-intelligence";
import {
  DATA_STATUSES,
  DATA_STATUS_LABELS,
  DEFAULT_REVIEW_DAYS,
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  SECTION_LABELS,
  type SectionKey,
} from "@/lib/competencia/domain";
import { reviewDueOn, reviewState, todayIso } from "@/lib/competencia/review";

import { emptyToNull, sendCompetencia } from "../client-api";
import {
  EvidencePill,
  ReviewPill,
  SafeExternalLink,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "../ui";
import { useSaver, ErrorLine } from "./shared";

/* ---------- Secciones ---------- */

export function SectionCard({
  competitorId,
  sectionKey,
  section,
  sources,
}: {
  competitorId: string;
  sectionKey: SectionKey;
  section: CiSectionRow | undefined;
  sources: CiSourceRow[];
}) {
  const [editing, setEditing] = useState(false);
  const { saving, error, run } = useSaver();
  const content = section?.content ?? "";
  const state = reviewState({
    content,
    dataStatus: section?.dataStatus ?? "pendiente_revision",
    lastVerifiedOn: section?.lastVerifiedOn ?? null,
    reviewAfterDays:
      section?.reviewAfterDays ?? DEFAULT_REVIEW_DAYS[sectionKey],
  });
  const linkedSources = sources.filter((source) =>
    section?.sourceIds.includes(source.id)
  );
  const dueOn = section ? reviewDueOn(section) : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitorId}/sections/${sectionKey}`,
          "PUT",
          {
            content: String(form.get("content") ?? ""),
            dataStatus: String(form.get("dataStatus")),
            evidenceLevel: String(form.get("evidenceLevel")),
            lastVerifiedOn: emptyToNull(form.get("lastVerifiedOn")),
            reviewAfterDays: Number(
              form.get("reviewAfterDays") ?? DEFAULT_REVIEW_DAYS[sectionKey]
            ),
            sourceIds: form.getAll("sourceIds").map(String),
          }
        ),
      () => setEditing(false)
    );
  }

  return (
    <article className={ciCard} aria-labelledby={`section-${sectionKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`section-${sectionKey}`} className="font-semibold text-white">
          {SECTION_LABELS[sectionKey]}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <ReviewPill state={state} />
          {content.trim() && section ? (
            <EvidencePill level={section.evidenceLevel} />
          ) : null}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
            </button>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <>
          {content.trim() ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/80">
              {content}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-white/45">
              Pendiente de investigar.
            </p>
          )}
          {content.trim() ? (
            <p className="mt-2 text-xs text-white/45">
              {section?.lastVerifiedOn
                ? `Comprobado el ${section.lastVerifiedOn}`
                : "Sin fecha de comprobación"}
              {dueOn ? ` · revisar antes del ${dueOn}` : ""}
            </p>
          ) : null}
          {linkedSources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {linkedSources.map((source) => (
                <li key={source.id} className="text-xs">
                  <SafeExternalLink url={source.url} iconClassName="h-3 w-3">
                    {source.title ?? source.url}
                  </SafeExternalLink>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label className="block">
            <span className="sr-only">Contenido</span>
            <textarea
              name="content"
              rows={5}
              maxLength={8000}
              defaultValue={content}
              className={ciInput}
              placeholder="Hallazgo, con su fuente. Marca las inferencias como tales."
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={ciLabel}>Estado del dato</span>
              <select
                name="dataStatus"
                defaultValue={section?.dataStatus ?? "pendiente_revision"}
                className={`${ciInput} mt-2`}
              >
                {DATA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {DATA_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Nivel de evidencia</span>
              <select
                name="evidenceLevel"
                defaultValue={section?.evidenceLevel ?? "sin_evidencia"}
                className={`${ciInput} mt-2`}
              >
                {EVIDENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {EVIDENCE_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Comprobado el</span>
              <input
                name="lastVerifiedOn"
                type="date"
                defaultValue={section?.lastVerifiedOn ?? todayIso()}
                className={`${ciInput} mt-2`}
              />
            </label>
            <label className="block">
              <span className={ciLabel}>Revisar cada (días)</span>
              <input
                name="reviewAfterDays"
                type="number"
                min={1}
                max={730}
                defaultValue={
                  section?.reviewAfterDays ?? DEFAULT_REVIEW_DAYS[sectionKey]
                }
                className={`${ciInput} mt-2`}
              />
            </label>
          </div>
          {sources.length > 0 ? (
            <fieldset>
              <legend className={ciLabel}>Fuentes que lo respaldan</legend>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {sources.map((source) => (
                  <label
                    key={source.id}
                    className="flex items-start gap-2 text-xs text-white/80"
                  >
                    <input
                      type="checkbox"
                      name="sourceIds"
                      value={source.id}
                      defaultChecked={section?.sourceIds.includes(source.id)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="break-all">
                      {source.title ?? source.url}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-xs text-white/50">
              Añade fuentes en la pestaña «Fuentes» para vincularlas.
            </p>
          )}
          <ErrorLine error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={ciButtonPrimary}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}{" "}
              Guardar sección
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={ciButtonGhost}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
