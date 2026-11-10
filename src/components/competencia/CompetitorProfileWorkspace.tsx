"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CiChangeEventRow,
  CiCompetitorFlowRow,
  CiCompetitorRow,
  CiFlowRow,
  CiOpportunityRow,
  CiPricingPlanRow,
  CiSectionRow,
  CiSourceRow,
} from "@/db/schema/competitive-intelligence";
import {
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPE_LABELS,
  DISCIPLINE_LABELS,
  LIFECYCLE_STATUS_LABELS,
  RESEARCH_STATUS_LABELS,
  SECTION_GROUPS,
  type ClientSize,
  type CompetitorType,
  type Discipline,
  type LifecycleStatus,
} from "@/lib/competencia/domain";

import {
  EmptyNote,
  OpportunityClassPill,
  Pill,
  SafeExternalLink,
  ciButtonGhost,
  ciCard,
} from "./ui";
import { dateTime } from "./perfil/shared";
import { GeneralEditor, LifecycleActions } from "./perfil/GeneralEditor";
import { SectionCard } from "./perfil/SectionCard";
import { SourcesPanel } from "./perfil/SourcesPanel";
import { PricingPanel } from "./perfil/PricingPanel";
import { CoverageRow } from "./perfil/CoverageRow";

export interface CompetitorProfileWorkspaceProps {
  competitor: CiCompetitorRow;
  sections: CiSectionRow[];
  sources: CiSourceRow[];
  pricing: CiPricingPlanRow[];
  flows: CiFlowRow[];
  coverage: CiCompetitorFlowRow[];
  history: CiChangeEventRow[];
  opportunities: CiOpportunityRow[];
}

/* ---------- Ficha completa ---------- */

export function CompetitorProfileWorkspace(
  props: CompetitorProfileWorkspaceProps
) {
  const {
    competitor,
    sections,
    sources,
    pricing,
    flows,
    coverage,
    history,
    opportunities,
  } = props;
  const [editingGeneral, setEditingGeneral] = useState(false);
  const sectionByKey = useMemo(
    () => new Map(sections.map((section) => [section.section, section])),
    [sections]
  );
  const coverageByFlow = useMemo(
    () => new Map(coverage.map((row) => [row.flowId, row])),
    [coverage]
  );

  return (
    <div className="space-y-6">
      <section className={`${ciCard} space-y-3`} aria-label="Datos generales">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill variant="info">
            {
              COMPETITOR_TYPE_LABELS[
                competitor.competitorType as CompetitorType
              ]
            }
          </Pill>
          <Pill
            variant={competitor.researchStatus === "completa" ? "ok" : "warn"}
          >
            {
              RESEARCH_STATUS_LABELS[
                competitor.researchStatus as keyof typeof RESEARCH_STATUS_LABELS
              ]
            }
          </Pill>
          <Pill
            variant={competitor.lifecycleStatus === "activo" ? "ok" : "neutral"}
          >
            {
              LIFECYCLE_STATUS_LABELS[
                competitor.lifecycleStatus as LifecycleStatus
              ]
            }
            {competitor.archivedAt
              ? ` · ${dateTime.format(new Date(competitor.archivedAt))}`
              : ""}
          </Pill>
          {competitor.countries.map((country) => (
            <Pill key={country}>{country}</Pill>
          ))}
          {competitor.disciplines.map((discipline) => (
            <Pill key={discipline}>
              {DISCIPLINE_LABELS[discipline as Discipline] ?? discipline}
            </Pill>
          ))}
          {competitor.clientSizes.map((size) => (
            <Pill key={size}>
              {CLIENT_SIZE_LABELS[size as ClientSize] ?? size}
            </Pill>
          ))}
        </div>
        {competitor.summary ? (
          <p className="text-sm leading-6 text-white/80">
            {competitor.summary}
          </p>
        ) : null}
        {competitor.website ? (
          <SafeExternalLink
            url={competitor.website}
            className="break-all text-sm"
          >
            {competitor.website}
          </SafeExternalLink>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditingGeneral((value) => !value)}
            className={ciButtonGhost}
            aria-expanded={editingGeneral}
          >
            <Pencil className="h-4 w-4" aria-hidden /> Editar datos generales
          </button>
          <LifecycleActions competitor={competitor} />
        </div>
      </section>

      {editingGeneral ? (
        <GeneralEditor
          competitor={competitor}
          onClose={() => setEditingGeneral(false)}
        />
      ) : null}

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-white/5 p-1">
          {SECTION_GROUPS.map((group) => (
            <TabsTrigger
              key={group.id}
              value={group.id}
              className="min-h-[40px]"
            >
              {group.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="fuentes" className="min-h-[40px]">
            Fuentes ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="historial" className="min-h-[40px]">
            Historial
          </TabsTrigger>
        </TabsList>

        {SECTION_GROUPS.map((group) => (
          <TabsContent key={group.id} value={group.id} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {group.sections.map((key) => (
                <SectionCard
                  key={key}
                  competitorId={competitor.id}
                  sectionKey={key}
                  section={sectionByKey.get(key)}
                  sources={sources}
                />
              ))}
            </div>

            {group.id === "negocio" ? (
              <PricingPanel
                competitorId={competitor.id}
                pricing={pricing}
                sources={sources}
              />
            ) : null}

            {group.id === "producto" ? (
              <section className={ciCard} aria-labelledby="ci-flows-title">
                <h3 id="ci-flows-title" className="font-semibold text-white">
                  Flujos de producto
                </h3>
                <p className="mt-1 text-xs text-white/55">
                  «Desconocido» significa que no hay evidencia, no que no
                  exista.
                </p>
                {flows.length === 0 ? (
                  <p className="mt-3 text-sm text-white/60">
                    No hay flujos definidos. Créalos en «Flujos y Zaltyko».
                  </p>
                ) : (
                  <ul className="mt-2">
                    {flows.map((flow) => (
                      <CoverageRow
                        key={flow.id}
                        competitorId={competitor.id}
                        flow={flow}
                        current={coverageByFlow.get(flow.id)}
                        sources={sources}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {group.id === "oportunidades" ? (
              <section className={ciCard} aria-labelledby="ci-linked-opps">
                <h3 id="ci-linked-opps" className="font-semibold text-white">
                  Oportunidades vinculadas
                </h3>
                {opportunities.length === 0 ? (
                  <p className="mt-2 text-sm text-white/60">
                    Ninguna oportunidad menciona todavía a este competidor.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {opportunities.map((opportunity) => (
                      <li
                        key={opportunity.id}
                        className="flex flex-wrap items-center gap-2 text-sm text-white/85"
                      >
                        <OpportunityClassPill
                          value={opportunity.classification}
                        />{" "}
                        {opportunity.title}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/super-admin/competencia/oportunidades"
                  className="mt-3 inline-block text-xs text-zaltyko-electric hover:underline"
                >
                  Gestionar oportunidades
                </Link>
              </section>
            ) : null}
          </TabsContent>
        ))}

        <TabsContent value="fuentes">
          <SourcesPanel competitorId={competitor.id} sources={sources} />
        </TabsContent>

        <TabsContent value="historial">
          {history.length === 0 ? (
            <EmptyNote title="Sin cambios registrados" />
          ) : (
            <ol className={`${ciCard} space-y-3`}>
              {history.map((event) => (
                <li
                  key={event.id}
                  className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
                >
                  <p className="text-sm text-white/85">{event.summary}</p>
                  <p className="text-xs text-white/45">
                    {dateTime.format(new Date(event.createdAt))} ·{" "}
                    {event.action}
                  </p>
                  {event.diff &&
                  Object.keys(event.diff as object).length > 0 ? (
                    <details className="mt-1 text-xs text-white/55">
                      <summary className="cursor-pointer">Ver cambios</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2">
                        {JSON.stringify(event.diff, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
