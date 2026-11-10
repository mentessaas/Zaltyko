"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import {
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
} from "@/lib/competencia/domain";
import { todayIso } from "@/lib/competencia/review";

import { emptyToNull, sendCompetencia } from "./client-api";
import { ciButtonGhost, ciButtonPrimary, ciInput, ciLabel } from "./ui";

export interface SourceFormValues {
  id?: string;
  url: string;
  title: string | null;
  accessedOn: string;
  sourceType: string;
  claim: string;
  evidenceLevel: string;
  notes: string | null;
  accessible: boolean;
}

interface SourceFormProps {
  competitorId?: string | null;
  competitorOptions?: Array<{ id: string; name: string }>;
  initial?: SourceFormValues;
  onDone?: () => void;
}

/** Alta o edición de una fuente. Sin `initial` crea; con `initial.id` actualiza. */
export function SourceForm({
  competitorId = null,
  competitorOptions,
  initial,
  onDone,
}: SourceFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(initial?.id);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError(null);
    const body = {
      url: String(form.get("url") ?? ""),
      title: emptyToNull(form.get("title")),
      accessedOn: String(form.get("accessedOn") ?? ""),
      sourceType: String(form.get("sourceType") ?? "web_oficial"),
      claim: String(form.get("claim") ?? ""),
      evidenceLevel: String(form.get("evidenceLevel") ?? "declarado"),
      notes: emptyToNull(form.get("notes")),
      accessible: form.get("accessible") === "on",
    };
    try {
      if (editing && initial?.id) {
        await sendCompetencia(
          `/api/super-admin/competencia/sources/${initial.id}`,
          "PATCH",
          body
        );
      } else {
        const selected = competitorOptions
          ? emptyToNull(form.get("competitorId"))
          : competitorId;
        await sendCompetencia("/api/super-admin/competencia/sources", "POST", {
          ...body,
          competitorId: selected,
        });
        formElement.reset();
      }
      router.refresh();
      onDone?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar la fuente"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {competitorOptions && !editing ? (
          <label className="block sm:col-span-2">
            <span className={ciLabel}>Empresa</span>
            <select
              name="competitorId"
              defaultValue={competitorId ?? ""}
              className={`${ciInput} mt-2`}
            >
              <option value="">Fuente general (sin empresa)</option>
              {competitorOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block sm:col-span-2">
          <span className={ciLabel}>URL *</span>
          <input
            name="url"
            type="url"
            required
            defaultValue={initial?.url}
            className={`${ciInput} mt-2`}
            placeholder="https://…"
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Título</span>
          <input
            name="title"
            defaultValue={initial?.title ?? ""}
            maxLength={200}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Fecha de consulta *</span>
          <input
            name="accessedOn"
            type="date"
            required
            defaultValue={initial?.accessedOn ?? todayIso()}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Tipo de fuente</span>
          <select
            name="sourceType"
            defaultValue={initial?.sourceType ?? "web_oficial"}
            className={`${ciInput} mt-2`}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Nivel de evidencia</span>
          <select
            name="evidenceLevel"
            defaultValue={initial?.evidenceLevel ?? "declarado"}
            className={`${ciInput} mt-2`}
          >
            {EVIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EVIDENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Afirmación que respalda *</span>
          <textarea
            name="claim"
            required
            minLength={3}
            maxLength={1000}
            rows={2}
            defaultValue={initial?.claim}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Notas</span>
          <textarea
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={initial?.notes ?? ""}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            name="accessible"
            defaultChecked={initial?.accessible ?? true}
            className="h-4 w-4"
          />
          Fuente accesible
        </label>
      </div>
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
          {editing ? "Guardar fuente" : "Añadir fuente"}
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
