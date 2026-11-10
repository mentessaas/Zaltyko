"use client";

import { useState } from "react";
import { Archive, Loader2, RotateCcw, PauseCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CiCompetitorRow } from "@/db/schema/competitive-intelligence";
import {
  CLIENT_SIZES,
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_LABELS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
  type LifecycleStatus,
} from "@/lib/competencia/domain";

import { emptyToNull, sendCompetencia } from "../client-api";
import {
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "../ui";
import { useSaver, ErrorLine } from "./shared";

/* ---------- Datos generales y ciclo de vida ---------- */

export function GeneralEditor({
  competitor,
  onClose,
}: {
  competitor: CiCompetitorRow;
  onClose: () => void;
}) {
  const { saving, error, run } = useSaver();
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitor.id}`,
          "PATCH",
          {
            name: String(form.get("name") ?? ""),
            website: emptyToNull(form.get("website")),
            competitorType: String(form.get("competitorType")),
            researchStatus: String(form.get("researchStatus")),
            countries: String(form.get("countries") ?? "")
              .split(/[\s,;]+/)
              .map((value) => value.trim().toUpperCase())
              .filter(Boolean),
            disciplines: form.getAll("disciplines").map(String),
            clientSizes: form.getAll("clientSizes").map(String),
            summary: emptyToNull(form.get("summary")),
          }
        ),
      onClose
    );
  }
  return (
    <form onSubmit={onSubmit} className={`${ciCard} space-y-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ciLabel}>Nombre</span>
          <input
            name="name"
            required
            defaultValue={competitor.name}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Web</span>
          <input
            name="website"
            type="url"
            defaultValue={competitor.website ?? ""}
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Tipo</span>
          <select
            name="competitorType"
            defaultValue={competitor.competitorType}
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
          <span className={ciLabel}>Estado de la investigación</span>
          <select
            name="researchStatus"
            defaultValue={competitor.researchStatus}
            className={`${ciInput} mt-2`}
          >
            {RESEARCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RESEARCH_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={ciLabel}>Países</span>
          <input
            name="countries"
            defaultValue={competitor.countries.join(", ")}
            className={`${ciInput} mt-2`}
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
                defaultChecked={competitor.disciplines.includes(discipline)}
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
                defaultChecked={competitor.clientSizes.includes(size)}
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
          defaultValue={competitor.summary ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}{" "}
          Guardar datos generales
        </button>
        <button type="button" onClick={onClose} className={ciButtonGhost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function LifecycleActions({
  competitor,
}: {
  competitor: CiCompetitorRow;
}) {
  const { saving, error, run } = useSaver();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const setLifecycle = (lifecycleStatus: LifecycleStatus) =>
    run(() =>
      sendCompetencia(
        `/api/super-admin/competencia/competitors/${competitor.id}`,
        "PATCH",
        { lifecycleStatus }
      )
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {competitor.lifecycleStatus === "activo" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setLifecycle("inactivo")}
          className={ciButtonGhost}
        >
          <PauseCircle className="h-4 w-4" aria-hidden /> Marcar inactivo
        </button>
      ) : null}
      {competitor.lifecycleStatus !== "activo" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setLifecycle("activo")}
          className={ciButtonGhost}
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Reactivar
        </button>
      ) : null}
      {competitor.lifecycleStatus !== "archivado" ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setConfirmArchive(true)}
          className={ciButtonGhost}
        >
          <Archive className="h-4 w-4" aria-hidden /> Archivar
        </button>
      ) : null}
      <ErrorLine error={error} />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archivar ${competitor.name}`}
        description="La ficha deja de aparecer en el listado y en la comparación, pero se conservan sus datos, fuentes e historial. Puedes reactivarla cuando quieras."
        confirmText="Archivar"
        loading={saving}
        onConfirm={async () => {
          await setLifecycle("archivado");
          setConfirmArchive(false);
        }}
      />
    </div>
  );
}
