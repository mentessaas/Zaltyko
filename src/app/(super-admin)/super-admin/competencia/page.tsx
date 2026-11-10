import Link from "next/link";
import { Plus } from "lucide-react";

import { SeedButton } from "@/components/competencia/SeedButton";
import {
  EmptyNote,
  OpportunityClassPill,
  PageIntro,
  Pill,
  ReviewPill,
  SubNav,
  UnavailableNotice,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "@/components/competencia/ui";
import { parseCompetitorFilters } from "@/lib/competencia/contracts";
import {
  CLIENT_SIZES,
  CLIENT_SIZE_LABELS,
  COMPETITOR_TYPES,
  COMPETITOR_TYPE_LABELS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  LIFECYCLE_STATUS_LABELS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
  SECTION_KEYS,
  type ClientSize,
  type CompetitorType,
  type Discipline,
  type LifecycleStatus,
  type ResearchStatus,
} from "@/lib/competencia/domain";
import {
  getCompetitiveDashboard,
  isCompetitiveIntelligenceAvailable,
  listCompetitors,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export default async function CompetenciaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="Inteligencia competitiva" title="Competencia" />
        <UnavailableNotice />
      </div>
    );
  }

  const filters = parseCompetitorFilters(await searchParams);
  const [dashboard, competitors] = await Promise.all([
    getCompetitiveDashboard(),
    listCompetitors(filters),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);
  const isEmptyDatabase =
    dashboard.totals.active +
      dashboard.totals.inactive +
      dashboard.totals.archived ===
    0;
  const countryOptions = Array.from(
    new Set(competitors.flatMap((competitor) => competitor.countries))
  ).sort();

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Inteligencia competitiva"
        title="Competencia"
        actions={
          <Link
            href="/super-admin/competencia/nuevo"
            className={ciButtonPrimary}
          >
            <Plus className="h-4 w-4" aria-hidden /> Añadir empresa
          </Link>
        }
      >
        Fichas, fuentes y oportunidades del mercado de software para clubes de
        gimnasia. Cada dato indica su nivel de evidencia y cuándo conviene
        volver a comprobarlo.
      </PageIntro>
      <SubNav active="resumen" />

      {isEmptyDatabase ? (
        <div className={`${ciCard} space-y-3`}>
          <EmptyNote title="Todavía no hay competidores en el panel">
            Carga la investigación del 10 de noviembre de 2026 (9 empresas,
            fuentes, precios, flujos y oportunidades) o empieza añadiendo una
            empresa a mano.
          </EmptyNote>
          <div className="flex flex-wrap justify-center gap-3">
            <SeedButton primary />
            <Link
              href="/super-admin/competencia/nuevo"
              className={ciButtonGhost}
            >
              Añadir empresa
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section
            aria-labelledby="ci-summary"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <h2 id="ci-summary" className="sr-only">
              Resumen
            </h2>
            {[
              {
                label: "Competidores activos",
                value: dashboard.totals.active,
                detail: `${dashboard.totals.inactive} inactivos · ${dashboard.totals.archived} archivados`,
              },
              {
                label: "Pendientes de investigar",
                value: dashboard.totals.pendingResearch,
                detail: "Investigación pendiente o en curso",
              },
              {
                label: "Datos para revisar",
                value: dashboard.staleItems.length,
                detail:
                  "Precios, funciones o mensajes vencidos o desactualizados",
              },
              {
                label: "Fuentes registradas",
                value: dashboard.totals.sources,
                detail: "Con fecha y nivel de evidencia",
              },
            ].map((metric) => (
              <div key={metric.label} className={ciCard}>
                <p className="text-xs uppercase tracking-[0.12em] text-white/55">
                  {metric.label}
                </p>
                <p className="mt-2 font-display text-3xl font-semibold text-white">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-white/55">{metric.detail}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section
              className={`${ciCard} lg:col-span-1`}
              aria-labelledby="ci-opps"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="ci-opps" className="font-semibold text-white">
                  Oportunidades prioritarias
                </h2>
                <Link
                  href="/super-admin/competencia/oportunidades"
                  className="text-xs text-zaltyko-electric hover:underline"
                >
                  Ver todas
                </Link>
              </div>
              {dashboard.topOpportunities.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">
                  Sin oportunidades abiertas.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {dashboard.topOpportunities.map((opportunity) => (
                    <li key={opportunity.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white/50">
                          {opportunity.priority ?? "–"}.
                        </span>
                        <OpportunityClassPill
                          value={opportunity.classification}
                        />
                      </div>
                      <p className="mt-1 text-white">{opportunity.title}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              className={`${ciCard} lg:col-span-1`}
              aria-labelledby="ci-stale"
            >
              <h2 id="ci-stale" className="font-semibold text-white">
                Conviene volver a comprobar
              </h2>
              {dashboard.staleItems.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">
                  Ningún precio, función o mensaje ha superado su plazo de
                  revisión.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dashboard.staleItems.slice(0, 8).map((item) => (
                    <li
                      key={`${item.competitorId}-${item.label}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <Link
                        href={`/super-admin/competencia/${item.competitorSlug}`}
                        className="text-white hover:underline"
                      >
                        {item.competitorName} ·{" "}
                        <span className="text-white/60">{item.label}</span>
                      </Link>
                      <ReviewPill state={item.state} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className={`${ciCard} lg:col-span-1`}
              aria-labelledby="ci-changes"
            >
              <h2 id="ci-changes" className="font-semibold text-white">
                Cambios recientes
              </h2>
              {dashboard.recentChanges.length === 0 ? (
                <p className="mt-3 text-sm text-white/60">
                  Sin cambios registrados.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dashboard.recentChanges.slice(0, 8).map((change) => (
                    <li key={change.id} className="text-sm">
                      <p className="text-white/85">{change.summary}</p>
                      <p className="text-xs text-white/45">
                        {dateTime.format(change.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {dashboard.pendingResearch.length > 0 ? (
            <section className={ciCard} aria-labelledby="ci-pending">
              <h2 id="ci-pending" className="font-semibold text-white">
                Pendientes de investigar
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard.pendingResearch.map((competitor) => (
                  <Link
                    key={competitor.id}
                    href={`/super-admin/competencia/${competitor.slug}`}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/85 hover:bg-white/10"
                  >
                    {competitor.name} ·{" "}
                    {
                      RESEARCH_STATUS_LABELS[
                        competitor.researchStatus as ResearchStatus
                      ]
                    }
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {!isEmptyDatabase ? (
        <section aria-labelledby="ci-list" className="space-y-4">
          <h2
            id="ci-list"
            className="font-display text-xl font-semibold text-white"
          >
            Listado de competidores
          </h2>
          <form
            method="get"
            className={`${ciCard} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}
            role="search"
          >
            <label className="block sm:col-span-2 lg:col-span-4">
              <span className={ciLabel}>Buscar</span>
              <input
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Nombre, web o resumen"
                className={`${ciInput} mt-2`}
              />
            </label>
            <label className="block">
              <span className={ciLabel}>Tipo</span>
              <select
                name="type"
                defaultValue={filters.type ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Todos</option>
                {COMPETITOR_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {COMPETITOR_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>País</span>
              <select
                name="country"
                defaultValue={filters.country ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Todos</option>
                {Array.from(
                  new Set([
                    ...countryOptions,
                    ...(filters.country ? [filters.country] : []),
                  ])
                ).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Disciplina</span>
              <select
                name="discipline"
                defaultValue={filters.discipline ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Todas</option>
                {DISCIPLINES.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {DISCIPLINE_LABELS[discipline]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Tamaño de cliente</span>
              <select
                name="size"
                defaultValue={filters.size ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Todos</option>
                {CLIENT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {CLIENT_SIZE_LABELS[size]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Investigación</span>
              <select
                name="research"
                defaultValue={filters.research ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Cualquier estado</option>
                {RESEARCH_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {RESEARCH_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ciLabel}>Estado</span>
              <select
                name="lifecycle"
                defaultValue={filters.lifecycle ?? ""}
                className={`${ciInput} mt-2`}
              >
                <option value="">Activos e inactivos</option>
                <option value="activo">Solo activos</option>
                <option value="inactivo">Solo inactivos</option>
                <option value="archivado">Archivados</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className={ciButtonPrimary}>
                Filtrar
              </button>
              {hasFilters ? (
                <Link href="/super-admin/competencia" className={ciButtonGhost}>
                  Limpiar
                </Link>
              ) : null}
            </div>
          </form>

          {competitors.length === 0 ? (
            <EmptyNote title="Ningún competidor coincide con estos filtros">
              Prueba a quitar algún filtro o incluye los archivados en «Estado».
            </EmptyNote>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {competitors.map((competitor) => (
                <li
                  key={competitor.id}
                  className={`${ciCard} flex flex-col gap-3`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/competencia/${competitor.slug}`}
                        className="font-semibold text-white hover:underline"
                      >
                        {competitor.name}
                      </Link>
                      <p className="text-xs text-white/55">
                        {
                          COMPETITOR_TYPE_LABELS[
                            competitor.competitorType as CompetitorType
                          ]
                        }
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill
                        variant={
                          competitor.researchStatus === "completa"
                            ? "ok"
                            : "warn"
                        }
                      >
                        {
                          RESEARCH_STATUS_LABELS[
                            competitor.researchStatus as ResearchStatus
                          ]
                        }
                      </Pill>
                      {competitor.lifecycleStatus !== "activo" ? (
                        <Pill variant="neutral">
                          {
                            LIFECYCLE_STATUS_LABELS[
                              competitor.lifecycleStatus as LifecycleStatus
                            ]
                          }
                        </Pill>
                      ) : null}
                    </div>
                  </div>
                  {competitor.summary ? (
                    <p className="text-sm leading-6 text-white/70">
                      {competitor.summary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 text-xs text-white/60">
                    {competitor.countries.map((country) => (
                      <Pill key={country}>{country}</Pill>
                    ))}
                    {competitor.disciplines.map((discipline) => (
                      <Pill key={discipline}>
                        {DISCIPLINE_LABELS[discipline as Discipline] ??
                          discipline}
                      </Pill>
                    ))}
                    {competitor.clientSizes.map((size) => (
                      <Pill key={size}>
                        {CLIENT_SIZE_LABELS[size as ClientSize] ?? size}
                      </Pill>
                    ))}
                  </div>
                  <p className="text-xs text-white/50">
                    {competitor.sectionsFilled}/{SECTION_KEYS.length} secciones
                    con datos · {competitor.sourcesCount} fuentes ·{" "}
                    {competitor.sectionsNeedingReview} pendientes de revisar o
                    vencidas
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
