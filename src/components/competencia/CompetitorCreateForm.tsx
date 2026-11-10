"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import {
  CLIENT_SIZES,
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_LABELS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
} from "@/lib/competencia/domain";

import { emptyToNull, sendCompetencia } from "./client-api";
import { ciButtonPrimary, ciCard, ciInput, ciLabel } from "./ui";

export function CompetitorCreateForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const countries = String(form.get("countries") ?? "")
        .split(/[\s,;]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      const result = await sendCompetencia<{ id: string; slug: string }>(
        "/api/super-admin/competencia/competitors",
        "POST",
        {
          name: String(form.get("name") ?? ""),
          website: emptyToNull(form.get("website")),
          competitorType: String(form.get("competitorType") ?? "directo"),
          countries,
          disciplines: form.getAll("disciplines").map(String),
          clientSizes: form.getAll("clientSizes").map(String),
          summary: emptyToNull(form.get("summary")),
        }
      );
      router.push(`/super-admin/competencia/${result.slug}?creado=1`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear el competidor"
      );
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`${ciCard} space-y-5`}
      aria-describedby={error ? "ci-create-error" : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ciLabel}>Nombre *</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            className={`${ciInput} mt-2`}
            placeholder="Nombre comercial"
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Web</span>
          <input
            name="website"
            type="url"
            className={`${ciInput} mt-2`}
            placeholder="https://…"
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Tipo de competidor *</span>
          <select
            name="competitorType"
            required
            defaultValue="directo"
            className={`${ciInput} mt-2`}
          >
            {COMPETITOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {COMPETITOR_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Países (códigos, separados por comas)</span>
          <input
            name="countries"
            className={`${ciInput} mt-2`}
            placeholder="ES, MX"
          />
        </label>
      </div>

      <fieldset>
        <legend className={ciLabel}>Disciplinas</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DISCIPLINES.map((discipline) => (
            <label
              key={discipline}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
            >
              <input
                type="checkbox"
                name="disciplines"
                value={discipline}
                className="h-4 w-4"
              />
              {DISCIPLINE_LABELS[discipline]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={ciLabel}>Tamaño de cliente</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CLIENT_SIZES.map((size) => (
            <label
              key={size}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/85"
            >
              <input
                type="checkbox"
                name="clientSizes"
                value={size}
                className="h-4 w-4"
              />
              {CLIENT_SIZE_LABELS[size]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className={ciLabel}>Resumen</span>
        <textarea
          name="summary"
          rows={3}
          maxLength={2000}
          className={`${ciInput} mt-2`}
          placeholder="Qué venden y a quién, en una o dos frases. Puedes completarlo después."
        />
      </label>

      {error ? (
        <p id="ci-create-error" role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={ciButtonPrimary} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          {saving ? "Creando…" : "Crear ficha"}
        </button>
        <p className="text-xs text-white/50">
          Se crea como «pendiente de investigar». Después añadirás fuentes y
          completarás el análisis.
        </p>
      </div>
    </form>
  );
}
