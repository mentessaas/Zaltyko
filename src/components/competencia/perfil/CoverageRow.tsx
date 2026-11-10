"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import type {
  CiCompetitorFlowRow,
  CiFlowRow,
  CiSourceRow,
} from "@/db/schema/competitive-intelligence";
import {
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  FLOW_COVERAGES,
  FLOW_COVERAGE_LABELS,
} from "@/lib/competencia/domain";

import { emptyToNull, sendCompetencia } from "../client-api";
import {
  CoveragePill,
  EvidencePill,
  ZaltykoStatusPill,
  ciButtonPrimary,
  ciInput,
  ciLabel,
} from "../ui";
import { useSaver, ErrorLine } from "./shared";

/* ---------- Flujos de producto ---------- */

export function CoverageRow({
  competitorId,
  flow,
  current,
  sources,
}: {
  competitorId: string;
  flow: CiFlowRow;
  current?: CiCompetitorFlowRow;
  sources: CiSourceRow[];
}) {
  const { saving, error, run } = useSaver();
  const [open, setOpen] = useState(false);
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        sendCompetencia(
          `/api/super-admin/competencia/competitors/${competitorId}/flows`,
          "PUT",
          {
            flowId: flow.id,
            coverage: String(form.get("coverage")),
            evidenceLevel: String(form.get("evidenceLevel")),
            sourceId: emptyToNull(form.get("sourceId")),
            notes: emptyToNull(form.get("notes")),
          }
        ),
      () => setOpen(false)
    );
  }
  return (
    <li className="border-b border-white/10 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{flow.name}</p>
          <p className="text-xs text-white/50">
            Zaltyko: <ZaltykoStatusPill status={flow.zaltykoStatus} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <CoveragePill coverage={current?.coverage ?? "desconocido"} />
          {current ? <EvidencePill level={current.evidenceLevel} /> : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
            aria-expanded={open}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />{" "}
            {open ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>
      {current?.notes && !open ? (
        <p className="mt-1 text-xs text-white/55">{current.notes}</p>
      ) : null}
      {open ? (
        <form onSubmit={onSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ciLabel}>¿Lo resuelve?</span>
            <select
              name="coverage"
              defaultValue={current?.coverage ?? "desconocido"}
              className={`${ciInput} mt-2`}
            >
              {FLOW_COVERAGES.map((coverage) => (
                <option key={coverage} value={coverage}>
                  {FLOW_COVERAGE_LABELS[coverage]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ciLabel}>Evidencia</span>
            <select
              name="evidenceLevel"
              defaultValue={current?.evidenceLevel ?? "sin_evidencia"}
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
            <span className={ciLabel}>Fuente</span>
            <select
              name="sourceId"
              defaultValue={current?.sourceId ?? ""}
              className={`${ciInput} mt-2`}
            >
              <option value="">Sin fuente</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title ?? source.url}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={ciLabel}>Notas</span>
            <input
              name="notes"
              defaultValue={current?.notes ?? ""}
              className={`${ciInput} mt-2`}
            />
          </label>
          <div className="sm:col-span-2">
            <ErrorLine error={error} />
            <button type="submit" disabled={saving} className={ciButtonPrimary}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}{" "}
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
