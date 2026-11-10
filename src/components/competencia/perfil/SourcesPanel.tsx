"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { CiSourceRow } from "@/db/schema/competitive-intelligence";
import { SOURCE_TYPE_LABELS, type SourceType } from "@/lib/competencia/domain";

import { SourceForm } from "../SourceForm";
import { EmptyNote, EvidencePill, Pill, SafeExternalLink, ciCard } from "../ui";

/* ---------- Fuentes ---------- */

export function SourcesPanel({
  competitorId,
  sources,
}: {
  competitorId: string;
  sources: CiSourceRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className={ciCard}>
        <h3 className="font-semibold text-white">Añadir fuente</h3>
        <div className="mt-3">
          <SourceForm competitorId={competitorId} />
        </div>
      </div>
      {sources.length === 0 ? (
        <EmptyNote title="Sin fuentes todavía">
          Registra la URL, la fecha y qué afirmación respalda cada fuente.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {sources.map((source) => (
            <li key={source.id} className={ciCard}>
              {editingId === source.id ? (
                <SourceForm
                  initial={source}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <SafeExternalLink
                      url={source.url}
                      className="min-w-0 break-all font-medium"
                    >
                      {source.title ?? source.url}
                    </SafeExternalLink>
                    <button
                      type="button"
                      onClick={() => setEditingId(source.id)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                    </button>
                  </div>
                  <p className="text-sm text-white/80">{source.claim}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/55">
                    <EvidencePill level={source.evidenceLevel} />
                    <Pill>
                      {SOURCE_TYPE_LABELS[source.sourceType as SourceType] ??
                        source.sourceType}
                    </Pill>
                    <span>Consultada el {source.accessedOn}</span>
                    {!source.accessible ? (
                      <Pill variant="bad">Inaccesible</Pill>
                    ) : null}
                  </div>
                  {source.notes ? (
                    <p className="text-xs text-white/55">{source.notes}</p>
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
