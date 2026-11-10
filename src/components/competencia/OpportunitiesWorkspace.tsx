"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";

import type { CiOpportunityRow } from "@/db/schema/competitive-intelligence";
import {
  CONFIDENCE_LEVELS,
  EFFORT_SIZES,
  OPPORTUNITY_CLASSES,
  OPPORTUNITY_CLASS_LABELS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_LABELS,
  type OpportunityStatus,
} from "@/lib/competencia/domain";

import { emptyToNull, numberOrNull, sendCompetencia } from "./client-api";
import {
  EmptyNote,
  OpportunityClassPill,
  Pill,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "./ui";

interface Option {
  id: string;
  name: string;
  slug: string;
}

const TEXT_FIELDS: Array<[keyof CiOpportunityRow, string]> = [
  ["whoPays", "Quién pagaría"],
  ["frequency", "Frecuencia del problema"],
  ["currentCost", "Coste actual"],
  ["minimumSolution", "Solución mínima"],
  ["codeDependencies", "Dependencias del código"],
  ["successMetric", "Métrica de éxito"],
  ["validationPlan", "Cómo validarlo antes de construir"],
];

function OpportunityForm({
  opportunity,
  options,
  onDone,
}: {
  opportunity?: CiOpportunityRow;
  options: Option[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body: Record<string, unknown> = {
      title: String(form.get("title") ?? ""),
      description: emptyToNull(form.get("description")),
      classification: String(form.get("classification")),
      priority: numberOrNull(form.get("priority")),
      confidence: String(form.get("confidence")),
      effort: emptyToNull(form.get("effort")),
      status: String(form.get("status")),
      competitorIds: form.getAll("competitorIds").map(String),
    };
    for (const [field] of TEXT_FIELDS)
      body[field] = emptyToNull(form.get(field));
    setSaving(true);
    setError(null);
    try {
      if (opportunity)
        await sendCompetencia(
          `/api/super-admin/competencia/opportunities/${opportunity.id}`,
          "PATCH",
          body
        );
      else {
        await sendCompetencia(
          "/api/super-admin/competencia/opportunities",
          "POST",
          body
        );
        formElement.reset();
      }
      router.refresh();
      onDone?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la oportunidad"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className={ciLabel}>Oportunidad *</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={200}
            defaultValue={opportunity?.title}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Clasificación</span>
          <select
            name="classification"
            defaultValue={opportunity?.classification ?? "igualar"}
            className={`${ciInput} mt-2`}
          >
            {OPPORTUNITY_CLASSES.map((value) => (
              <option key={value} value={value}>
                {OPPORTUNITY_CLASS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Estado</span>
          <select
            name="status"
            defaultValue={opportunity?.status ?? "hipotesis"}
            className={`${ciInput} mt-2`}
          >
            {OPPORTUNITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {OPPORTUNITY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Prioridad (1 = primera)</span>
          <input
            name="priority"
            type="number"
            min={1}
            max={99}
            defaultValue={opportunity?.priority ?? ""}
            className={`${ciInput} mt-2`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ciLabel}>Confianza</span>
            <select
              name="confidence"
              defaultValue={opportunity?.confidence ?? "baja"}
              className={`${ciInput} mt-2`}
            >
              {CONFIDENCE_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ciLabel}>Esfuerzo</span>
            <select
              name="effort"
              defaultValue={opportunity?.effort ?? ""}
              className={`${ciInput} mt-2`}
            >
              <option value="">—</option>
              {EFFORT_SIZES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className={ciLabel}>Descripción y evidencia</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={opportunity?.description ?? ""}
            className={`${ciInput} mt-2`}
          />
        </label>
        {TEXT_FIELDS.map(([field, label]) => (
          <label key={field} className="block sm:col-span-2">
            <span className={ciLabel}>{label}</span>
            <input
              name={field}
              defaultValue={(opportunity?.[field] as string | null) ?? ""}
              className={`${ciInput} mt-2`}
            />
          </label>
        ))}
      </div>
      {options.length > 0 ? (
        <fieldset>
          <legend className={ciLabel}>Competidores relacionados</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => (
              <label
                key={option.id}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
              >
                <input
                  type="checkbox"
                  name="competitorIds"
                  value={option.id}
                  defaultChecked={opportunity?.competitorIds.includes(
                    option.id
                  )}
                  className="h-4 w-4"
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {opportunity ? "Guardar oportunidad" : "Añadir oportunidad"}
        </button>
        {onDone ? (
          <button type="button" onClick={onDone} className={ciButtonGhost}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function OpportunitiesWorkspace({
  opportunities,
  options,
}: {
  opportunities: CiOpportunityRow[];
  options: Option[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const byId = new Map(options.map((option) => [option.id, option]));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className={ciButtonPrimary}
          aria-expanded={creating}
        >
          <Plus className="h-4 w-4" aria-hidden /> Nueva oportunidad
        </button>
      </div>
      {creating ? (
        <div className={ciCard}>
          <OpportunityForm
            options={options}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : null}

      {opportunities.length === 0 ? (
        <EmptyNote title="Sin oportunidades registradas">
          Clasifica cada una como igualar, superar, diferenciar o posponer, y
          vincúlala a la evidencia.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id} className={ciCard}>
              {editingId === opportunity.id ? (
                <OpportunityForm
                  opportunity={opportunity}
                  options={options}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-white/50">
                          #{opportunity.priority ?? "–"}
                        </span>
                        <OpportunityClassPill
                          value={opportunity.classification}
                        />
                        <Pill
                          variant={
                            opportunity.status === "descartada"
                              ? "neutral"
                              : opportunity.status === "decidida"
                                ? "ok"
                                : "warn"
                          }
                        >
                          {
                            OPPORTUNITY_STATUS_LABELS[
                              opportunity.status as OpportunityStatus
                            ]
                          }
                        </Pill>
                        <Pill>Confianza {opportunity.confidence}</Pill>
                        {opportunity.effort ? (
                          <Pill>Esfuerzo {opportunity.effort}</Pill>
                        ) : null}
                      </div>
                      <p className="mt-2 font-semibold text-white">
                        {opportunity.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingId(opportunity.id)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                    </button>
                  </div>
                  {opportunity.description ? (
                    <p className="text-sm text-white/75">
                      {opportunity.description}
                    </p>
                  ) : null}
                  <dl className="grid gap-x-4 gap-y-1 text-xs text-white/65 sm:grid-cols-2">
                    {TEXT_FIELDS.filter(([field]) => opportunity[field]).map(
                      ([field, label]) => (
                        <div key={field}>
                          <dt className="inline text-white/45">{label}: </dt>
                          <dd className="inline">
                            {String(opportunity[field])}
                          </dd>
                        </div>
                      )
                    )}
                  </dl>
                  {opportunity.competitorIds.length > 0 ? (
                    <p className="text-xs text-white/55">
                      Afecta a:{" "}
                      {opportunity.competitorIds.map((id, index) => {
                        const option = byId.get(id);
                        return (
                          <span key={id}>
                            {index > 0 ? ", " : ""}
                            {option ? (
                              <Link
                                href={`/super-admin/competencia/${option.slug}`}
                                className="text-zaltyko-electric hover:underline"
                              >
                                {option.name}
                              </Link>
                            ) : (
                              "competidor archivado"
                            )}
                          </span>
                        );
                      })}
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
