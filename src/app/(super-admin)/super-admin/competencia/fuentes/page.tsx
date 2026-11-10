import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { SourceForm } from "@/components/competencia/SourceForm";
import {
  EmptyNote,
  EvidencePill,
  PageIntro,
  Pill,
  SubNav,
  UnavailableNotice,
  ciButtonGhost,
  ciButtonPrimary,
  ciCard,
  ciInput,
  ciLabel,
} from "@/components/competencia/ui";
import {
  EVIDENCE_LEVELS,
  EVIDENCE_LEVEL_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  type SourceType,
} from "@/lib/competencia/domain";
import {
  isCompetitiveIntelligenceAvailable,
  listCompetitorOptions,
  listSources,
} from "@/lib/competencia/storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || null;

export default async function FuentesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isCompetitiveIntelligenceAvailable())) {
    return (
      <div className="space-y-6">
        <PageIntro eyebrow="Inteligencia competitiva" title="Fuentes" />
        <UnavailableNotice />
      </div>
    );
  }
  const query = await searchParams;
  const competitorId = pick(query.competitorId);
  const evidence = pick(query.evidence);
  const type = pick(query.type);
  const q = pick(query.q)?.slice(0, 120) ?? null;
  const filters = {
    competitorId: competitorId && UUID.test(competitorId) ? competitorId : null,
    evidence:
      evidence && (EVIDENCE_LEVELS as readonly string[]).includes(evidence)
        ? evidence
        : null,
    type:
      type && (SOURCE_TYPES as readonly string[]).includes(type) ? type : null,
    q,
  };
  const [rows, options] = await Promise.all([
    listSources(filters),
    listCompetitorOptions(true),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <PageIntro eyebrow="Inteligencia competitiva" title="Registro de fuentes">
        Cada fuente guarda la URL, la fecha de consulta, el tipo, la afirmación
        que respalda y su nivel de evidencia. Una función anunciada en una web
        solo prueba que la anuncian.
      </PageIntro>
      <SubNav active="fuentes" />

      <details className={ciCard}>
        <summary className="cursor-pointer font-semibold text-white">
          Añadir fuente
        </summary>
        <div className="mt-3">
          <SourceForm
            competitorOptions={options.map(({ id, name }) => ({ id, name }))}
          />
        </div>
      </details>

      <form
        method="get"
        className={`${ciCard} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}
        role="search"
      >
        <label className="block">
          <span className={ciLabel}>Buscar</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Afirmación, URL o nota"
            className={`${ciInput} mt-2`}
          />
        </label>
        <label className="block">
          <span className={ciLabel}>Empresa</span>
          <select
            name="competitorId"
            defaultValue={filters.competitorId ?? ""}
            className={`${ciInput} mt-2`}
          >
            <option value="">Todas</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Evidencia</span>
          <select
            name="evidence"
            defaultValue={filters.evidence ?? ""}
            className={`${ciInput} mt-2`}
          >
            <option value="">Cualquiera</option>
            {EVIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EVIDENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ciLabel}>Tipo</span>
          <select
            name="type"
            defaultValue={filters.type ?? ""}
            className={`${ciInput} mt-2`}
          >
            <option value="">Todos</option>
            {SOURCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {SOURCE_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={ciButtonPrimary}>
            Filtrar
          </button>
          {hasFilters ? (
            <Link
              href="/super-admin/competencia/fuentes"
              className={ciButtonGhost}
            >
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyNote
          title={
            hasFilters
              ? "Ninguna fuente coincide con estos filtros"
              : "Todavía no hay fuentes"
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ source, competitorName, competitorSlug }) => (
            <li key={source.id} className={`${ciCard} space-y-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-w-0 items-center gap-1 break-all font-medium text-zaltyko-electric hover:underline"
                >
                  {source.title ?? source.url}{" "}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
                {competitorSlug ? (
                  <Link
                    href={`/super-admin/competencia/${competitorSlug}`}
                    className="text-xs text-white/70 hover:underline"
                  >
                    {competitorName}
                  </Link>
                ) : (
                  <span className="text-xs text-white/50">Fuente general</span>
                )}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
