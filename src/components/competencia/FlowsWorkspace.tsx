"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";

import type { CiFlowRow } from "@/db/schema/competitive-intelligence";
import {
  OPPORTUNITY_CLASSES,
  OPPORTUNITY_CLASS_LABELS,
  ZALTYKO_FLOW_STATUSES,
  ZALTYKO_FLOW_STATUS_LABELS,
} from "@/lib/competencia/domain";

import { emptyToNull, sendCompetencia } from "./client-api";
import {
  EmptyNote,
  OpportunityClassPill,
  ZaltykoStatusPill,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "./ui";

function FlowForm({ flow, onDone }: { flow?: CiFlowRow; onDone: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      valuedBy: emptyToNull(form.get("valuedBy")),
      zaltykoStatus: String(form.get("zaltykoStatus")),
      zaltykoCodeRefs: emptyToNull(form.get("zaltykoCodeRefs")),
      demandEvidence: emptyToNull(form.get("demandEvidence")),
      opportunity: emptyToNull(form.get("opportunity")),
      decision: emptyToNull(form.get("decision")),
      sortOrder: Number(form.get("sortOrder") ?? 100),
    };
    setSaving(true);
    setError(null);
    try {
      if (flow)
        await sendCompetencia(
          `/api/super-admin/competencia/flows/${flow.id}`,
          "PATCH",
          body
        );
      else
        await sendCompetencia(
          "/api/super-admin/competencia/flows",
          "POST",
          body
        );
      router.refresh();
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar el flujo"
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={ciLabel}>Flujo *</span>
        <input
          name="name"
          required
          defaultValue={flow?.name}
          className={`${ciInput} mt-2`}
        />
      </label>
      <label className="block">
        <span className={ciLabel}>Estado real en Zaltyko</span>
        <select
          name="zaltykoStatus"
          defaultValue={flow?.zaltykoStatus ?? "ausente"}
          className={`${ciInput} mt-2`}
        >
          {ZALTYKO_FLOW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ZALTYKO_FLOW_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={ciLabel}>Decisión</span>
        <select
          name="decision"
          defaultValue={flow?.decision ?? ""}
          className={`${ciInput} mt-2`}
        >
          <option value="">Sin decidir</option>
          {OPPORTUNITY_CLASSES.map((value) => (
            <option key={value} value={value}>
              {OPPORTUNITY_CLASS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={ciLabel}>Quién lo valora</span>
        <input
          name="valuedBy"
          defaultValue={flow?.valuedBy ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      <label className="block">
        <span className={ciLabel}>Orden</span>
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={10000}
          defaultValue={flow?.sortOrder ?? 100}
          className={`${ciInput} mt-2`}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={ciLabel}>Referencias de código en Zaltyko</span>
        <textarea
          name="zaltykoCodeRefs"
          rows={2}
          defaultValue={flow?.zaltykoCodeRefs ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={ciLabel}>Evidencia de demanda</span>
        <input
          name="demandEvidence"
          defaultValue={flow?.demandEvidence ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={ciLabel}>Oportunidad</span>
        <input
          name="opportunity"
          defaultValue={flow?.opportunity ?? ""}
          className={`${ciInput} mt-2`}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-rose-200 sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={saving} className={ciButtonPrimary}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}{" "}
          {flow ? "Guardar flujo" : "Añadir flujo"}
        </button>
        <button type="button" onClick={onDone} className={ciButtonGhost}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FlowsWorkspace({ flows }: { flows: CiFlowRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className={ciButtonPrimary}
          aria-expanded={creating}
        >
          <Plus className="h-4 w-4" aria-hidden /> Nuevo flujo
        </button>
      </div>
      {creating ? (
        <div className={ciCard}>
          <FlowForm onDone={() => setCreating(false)} />
        </div>
      ) : null}
      {flows.length === 0 ? (
        <EmptyNote title="Sin flujos definidos">
          Los flujos (grupos, asistencia, cuotas…) son las filas de la matriz de
          producto.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {flows.map((flow) => (
            <li key={flow.id} className={ciCard}>
              {editingId === flow.id ? (
                <FlowForm flow={flow} onDone={() => setEditingId(null)} />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-white">{flow.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ZaltykoStatusPill status={flow.zaltykoStatus} />
                      {flow.decision ? (
                        <OpportunityClassPill value={flow.decision} />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEditingId(flow.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                      </button>
                    </div>
                  </div>
                  <dl className="grid gap-1 text-xs text-white/65">
                    {[
                      ["Quién lo valora", flow.valuedBy],
                      ["Código", flow.zaltykoCodeRefs],
                      ["Demanda", flow.demandEvidence],
                      ["Oportunidad", flow.opportunity],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label} className="break-words">
                          <dt className="inline text-white/45">{label}: </dt>
                          <dd className="inline">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
