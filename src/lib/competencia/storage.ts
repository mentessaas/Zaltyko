import {
  and,
  arrayContains,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
  asc,
} from "drizzle-orm";

import { db } from "@/db";
import {
  ciChangeEvents,
  ciCompetitorFlows,
  ciCompetitors,
  ciCompetitorSections,
  ciFlows,
  ciOpportunities,
  ciPricingPlans,
  ciSources,
  type CiChangeEventRow,
  type CiCompetitorFlowRow,
  type CiCompetitorRow,
  type CiFlowRow,
  type CiOpportunityRow,
  type CiPricingPlanRow,
  type CiSectionRow,
  type CiSourceRow,
} from "@/db/schema";

import type { CompetitorFilters } from "./contracts";
import { SECTION_KEYS } from "./domain";
import {
  needsAttention,
  reviewDueOn,
  reviewState,
  todayIso,
  type ReviewState,
} from "./review";

export const CI_TABLES = [
  "ci_competitors",
  "ci_sources",
  "ci_competitor_sections",
  "ci_flows",
  "ci_competitor_flows",
  "ci_pricing_plans",
  "ci_opportunities",
  "ci_change_events",
] as const;

const LIST_LIMIT = 500;

/**
 * Las tablas `ci_*` llegan por un candidato SQL que requiere autorización. Si
 * faltan, el panel se muestra como «no disponible» en lugar de fallar a medias.
 */
export async function isCompetitiveIntelligenceAvailable(): Promise<boolean> {
  try {
    const checks = CI_TABLES.map(
      (table) => sql`to_regclass(${`public.${table}`}) is not null`
    );
    const result = await db.execute(
      sql`select (${sql.join(checks, sql` and `)}) as available`
    );
    const row = (result as unknown as { rows?: Array<{ available: boolean }> })
      .rows?.[0];
    return Boolean(row?.available);
  } catch {
    return false;
  }
}

export function isMissingTableError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;
  const causeCode =
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause
      ? String((error.cause as { code: unknown }).code)
      : null;
  return code === "42P01" || causeCode === "42P01";
}

export function isUniqueViolation(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;
  const causeCode =
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause
      ? String((error.cause as { code: unknown }).code)
      : null;
  return code === "23505" || causeCode === "23505";
}

/* ---------- Listado ---------- */

export interface CompetitorListItem extends CiCompetitorRow {
  sectionsFilled: number;
  sectionsNeedingReview: number;
  sourcesCount: number;
}

export async function listCompetitors(
  filters: CompetitorFilters = {}
): Promise<CompetitorListItem[]> {
  const conditions = [];
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(ciCompetitors.name, pattern),
        ilike(ciCompetitors.summary, pattern),
        ilike(ciCompetitors.website, pattern)
      )
    );
  }
  if (filters.type)
    conditions.push(eq(ciCompetitors.competitorType, filters.type));
  if (filters.country)
    conditions.push(arrayContains(ciCompetitors.countries, [filters.country]));
  if (filters.discipline)
    conditions.push(
      arrayContains(ciCompetitors.disciplines, [filters.discipline])
    );
  if (filters.size)
    conditions.push(arrayContains(ciCompetitors.clientSizes, [filters.size]));
  if (filters.research)
    conditions.push(eq(ciCompetitors.researchStatus, filters.research));
  if (!filters.lifecycle)
    conditions.push(ne(ciCompetitors.lifecycleStatus, "archivado"));
  else if (filters.lifecycle !== "todos")
    conditions.push(eq(ciCompetitors.lifecycleStatus, filters.lifecycle));

  const competitors = await db
    .select()
    .from(ciCompetitors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(ciCompetitors.name))
    .limit(LIST_LIMIT);

  if (competitors.length === 0) return [];
  const ids = competitors.map((competitor) => competitor.id);

  const [sections, sourceCounts] = await Promise.all([
    db
      .select({
        competitorId: ciCompetitorSections.competitorId,
        content: ciCompetitorSections.content,
        dataStatus: ciCompetitorSections.dataStatus,
        lastVerifiedOn: ciCompetitorSections.lastVerifiedOn,
        reviewAfterDays: ciCompetitorSections.reviewAfterDays,
      })
      .from(ciCompetitorSections)
      .where(inArray(ciCompetitorSections.competitorId, ids))
      .limit(LIST_LIMIT * SECTION_KEYS.length),
    db
      .select({
        competitorId: ciSources.competitorId,
        total: sql<number>`count(*)::int`,
      })
      .from(ciSources)
      .where(inArray(ciSources.competitorId, ids))
      .groupBy(ciSources.competitorId)
      .limit(LIST_LIMIT),
  ]);

  const today = todayIso();
  return competitors.map((competitor) => {
    const own = sections.filter(
      (section) => section.competitorId === competitor.id
    );
    return {
      ...competitor,
      sectionsFilled: own.filter((section) => section.content.trim()).length,
      sectionsNeedingReview: own.filter(
        (section) =>
          section.content.trim() && needsAttention(reviewState(section, today))
      ).length,
      sourcesCount:
        sourceCounts.find((row) => row.competitorId === competitor.id)?.total ??
        0,
    };
  });
}

/* ---------- Resumen visual ---------- */

export interface StaleItem {
  competitorId: string;
  competitorName: string;
  competitorSlug: string;
  label: string;
  state: ReviewState;
  dueOn: string | null;
}

export interface CompetitiveDashboard {
  totals: {
    active: number;
    inactive: number;
    archived: number;
    pendingResearch: number;
    sources: number;
    opportunities: number;
  };
  recentChanges: Array<
    CiChangeEventRow & {
      competitorName: string | null;
      competitorSlug: string | null;
    }
  >;
  pendingResearch: Array<
    Pick<
      CiCompetitorRow,
      "id" | "name" | "slug" | "competitorType" | "researchStatus"
    >
  >;
  staleItems: StaleItem[];
  topOpportunities: CiOpportunityRow[];
}

export async function getCompetitiveDashboard(): Promise<CompetitiveDashboard> {
  const [competitors, sourcesTotal, recent, opportunities, sections, pricing] =
    await Promise.all([
      db
        .select({
          id: ciCompetitors.id,
          name: ciCompetitors.name,
          slug: ciCompetitors.slug,
          competitorType: ciCompetitors.competitorType,
          researchStatus: ciCompetitors.researchStatus,
          lifecycleStatus: ciCompetitors.lifecycleStatus,
        })
        .from(ciCompetitors)
        .orderBy(asc(ciCompetitors.name))
        .limit(LIST_LIMIT),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(ciSources)
        .limit(1),
      db
        .select({
          event: ciChangeEvents,
          competitorName: ciCompetitors.name,
          competitorSlug: ciCompetitors.slug,
        })
        .from(ciChangeEvents)
        .leftJoin(
          ciCompetitors,
          eq(ciCompetitors.id, ciChangeEvents.competitorId)
        )
        .orderBy(desc(ciChangeEvents.createdAt))
        .limit(12),
      db
        .select()
        .from(ciOpportunities)
        .where(
          inArray(ciOpportunities.status, [
            "hipotesis",
            "validando",
            "decidida",
          ])
        )
        .orderBy(
          sql`${ciOpportunities.priority} asc nulls last`,
          desc(ciOpportunities.updatedAt)
        )
        .limit(5),
      db
        .select({
          competitorId: ciCompetitorSections.competitorId,
          section: ciCompetitorSections.section,
          content: ciCompetitorSections.content,
          dataStatus: ciCompetitorSections.dataStatus,
          lastVerifiedOn: ciCompetitorSections.lastVerifiedOn,
          reviewAfterDays: ciCompetitorSections.reviewAfterDays,
        })
        .from(ciCompetitorSections)
        .where(
          inArray(ciCompetitorSections.section, [
            "precios",
            "limites",
            "funciones",
            "promesas",
            "posicionamiento",
          ])
        )
        .limit(LIST_LIMIT * 5),
      db
        .select({
          competitorId: ciPricingPlans.competitorId,
          planName: ciPricingPlans.planName,
          dataStatus: ciPricingPlans.dataStatus,
          lastVerifiedOn: ciPricingPlans.lastVerifiedOn,
          reviewAfterDays: ciPricingPlans.reviewAfterDays,
        })
        .from(ciPricingPlans)
        .limit(LIST_LIMIT * 5),
    ]);

  const byId = new Map(
    competitors.map((competitor) => [competitor.id, competitor])
  );
  const live = (id: string) => {
    const competitor = byId.get(id);
    return competitor && competitor.lifecycleStatus !== "archivado"
      ? competitor
      : null;
  };
  const today = todayIso();
  const staleItems: StaleItem[] = [];
  for (const section of sections) {
    const competitor = live(section.competitorId);
    if (!competitor || !section.content.trim()) continue;
    const state = reviewState(section, today);
    if (state === "toca_revisar" || state === "desactualizado") {
      staleItems.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        competitorSlug: competitor.slug,
        label: `Sección: ${section.section}`,
        state,
        dueOn: reviewDueOn(section),
      });
    }
  }
  for (const plan of pricing) {
    const competitor = live(plan.competitorId);
    if (!competitor) continue;
    const state = reviewState(plan, today);
    if (state === "toca_revisar" || state === "desactualizado") {
      staleItems.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        competitorSlug: competitor.slug,
        label: `Precio: ${plan.planName}`,
        state,
        dueOn: reviewDueOn(plan),
      });
    }
  }
  staleItems.sort((left, right) =>
    (left.dueOn ?? "").localeCompare(right.dueOn ?? "")
  );

  return {
    totals: {
      active: competitors.filter(
        (competitor) => competitor.lifecycleStatus === "activo"
      ).length,
      inactive: competitors.filter(
        (competitor) => competitor.lifecycleStatus === "inactivo"
      ).length,
      archived: competitors.filter(
        (competitor) => competitor.lifecycleStatus === "archivado"
      ).length,
      pendingResearch: competitors.filter(
        (competitor) =>
          competitor.lifecycleStatus !== "archivado" &&
          competitor.researchStatus !== "completa"
      ).length,
      sources: sourcesTotal[0]?.total ?? 0,
      opportunities: opportunities.length,
    },
    recentChanges: recent.map((row) => ({
      ...row.event,
      competitorName: row.competitorName,
      competitorSlug: row.competitorSlug,
    })),
    pendingResearch: competitors.filter(
      (competitor) =>
        competitor.lifecycleStatus !== "archivado" &&
        competitor.researchStatus !== "completa"
    ),
    staleItems: staleItems.slice(0, 20),
    topOpportunities: opportunities,
  };
}

/* ---------- Ficha ---------- */

export interface CompetitorProfile {
  competitor: CiCompetitorRow;
  sections: CiSectionRow[];
  sources: CiSourceRow[];
  pricing: CiPricingPlanRow[];
  flows: CiFlowRow[];
  coverage: CiCompetitorFlowRow[];
  history: CiChangeEventRow[];
  opportunities: CiOpportunityRow[];
}

export async function getCompetitorBySlug(
  slug: string
): Promise<CiCompetitorRow | null> {
  const [competitor] = await db
    .select()
    .from(ciCompetitors)
    .where(eq(ciCompetitors.slug, slug))
    .limit(1);
  return competitor ?? null;
}

export async function getCompetitorProfile(
  slug: string
): Promise<CompetitorProfile | null> {
  const competitor = await getCompetitorBySlug(slug);
  if (!competitor) return null;
  const [sections, sources, pricing, flows, coverage, history, opportunities] =
    await Promise.all([
      db
        .select()
        .from(ciCompetitorSections)
        .where(eq(ciCompetitorSections.competitorId, competitor.id))
        .limit(SECTION_KEYS.length),
      db
        .select()
        .from(ciSources)
        .where(eq(ciSources.competitorId, competitor.id))
        .orderBy(desc(ciSources.accessedOn), desc(ciSources.createdAt))
        .limit(LIST_LIMIT),
      db
        .select()
        .from(ciPricingPlans)
        .where(eq(ciPricingPlans.competitorId, competitor.id))
        .orderBy(sql`${ciPricingPlans.priceAmount} asc nulls last`)
        .limit(50),
      listFlows(),
      db
        .select()
        .from(ciCompetitorFlows)
        .where(eq(ciCompetitorFlows.competitorId, competitor.id))
        .limit(LIST_LIMIT),
      db
        .select()
        .from(ciChangeEvents)
        .where(eq(ciChangeEvents.competitorId, competitor.id))
        .orderBy(desc(ciChangeEvents.createdAt))
        .limit(100),
      db
        .select()
        .from(ciOpportunities)
        .where(arrayContains(ciOpportunities.competitorIds, [competitor.id]))
        .orderBy(sql`${ciOpportunities.priority} asc nulls last`)
        .limit(50),
    ]);
  return {
    competitor,
    sections,
    sources,
    pricing,
    flows,
    coverage,
    history,
    opportunities,
  };
}

export async function listFlows(): Promise<CiFlowRow[]> {
  return db
    .select()
    .from(ciFlows)
    .orderBy(asc(ciFlows.sortOrder), asc(ciFlows.name))
    .limit(200);
}

/* ---------- Comparación ---------- */

export interface ComparisonData {
  competitors: CiCompetitorRow[];
  sections: CiSectionRow[];
  pricing: CiPricingPlanRow[];
  flows: CiFlowRow[];
  coverage: CiCompetitorFlowRow[];
}

export async function getComparison(
  competitorIds: string[]
): Promise<ComparisonData> {
  const ids = competitorIds.slice(0, 6);
  if (ids.length === 0)
    return {
      competitors: [],
      sections: [],
      pricing: [],
      flows: await listFlows(),
      coverage: [],
    };
  const [competitors, sections, pricing, flows, coverage] = await Promise.all([
    db
      .select()
      .from(ciCompetitors)
      .where(inArray(ciCompetitors.id, ids))
      .limit(6),
    db
      .select()
      .from(ciCompetitorSections)
      .where(
        and(
          inArray(ciCompetitorSections.competitorId, ids),
          inArray(ciCompetitorSections.section, [
            "icp",
            "posicionamiento",
            "promesas",
            "captacion",
            "precios",
            "limites",
            "fortalezas",
            "debilidades",
          ])
        )
      )
      .limit(6 * SECTION_KEYS.length),
    db
      .select()
      .from(ciPricingPlans)
      .where(inArray(ciPricingPlans.competitorId, ids))
      .limit(6 * 50),
    listFlows(),
    db
      .select()
      .from(ciCompetitorFlows)
      .where(inArray(ciCompetitorFlows.competitorId, ids))
      .limit(6 * 200),
  ]);
  const order = new Map(ids.map((id, index) => [id, index]));
  competitors.sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)
  );
  return { competitors, sections, pricing, flows, coverage };
}

/** Opciones mínimas para selectores (comparar, oportunidades, fuentes). */
export async function listCompetitorOptions(includeArchived = false) {
  return db
    .select({
      id: ciCompetitors.id,
      name: ciCompetitors.name,
      slug: ciCompetitors.slug,
      lifecycleStatus: ciCompetitors.lifecycleStatus,
    })
    .from(ciCompetitors)
    .where(
      includeArchived
        ? undefined
        : ne(ciCompetitors.lifecycleStatus, "archivado")
    )
    .orderBy(asc(ciCompetitors.name))
    .limit(LIST_LIMIT);
}

/* ---------- Fuentes y oportunidades ---------- */

export interface SourceFilters {
  competitorId?: string | null;
  evidence?: string | null;
  type?: string | null;
  q?: string | null;
}

export async function listSources(filters: SourceFilters = {}) {
  const conditions = [];
  if (filters.competitorId)
    conditions.push(eq(ciSources.competitorId, filters.competitorId));
  if (filters.evidence)
    conditions.push(eq(ciSources.evidenceLevel, filters.evidence));
  if (filters.type) conditions.push(eq(ciSources.sourceType, filters.type));
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      or(
        ilike(ciSources.claim, pattern),
        ilike(ciSources.url, pattern),
        ilike(ciSources.notes, pattern)
      )
    );
  }
  return db
    .select({
      source: ciSources,
      competitorName: ciCompetitors.name,
      competitorSlug: ciCompetitors.slug,
    })
    .from(ciSources)
    .leftJoin(ciCompetitors, eq(ciCompetitors.id, ciSources.competitorId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(ciSources.accessedOn), desc(ciSources.createdAt))
    .limit(LIST_LIMIT);
}

export async function listOpportunities() {
  return db
    .select()
    .from(ciOpportunities)
    .orderBy(
      sql`${ciOpportunities.priority} asc nulls last`,
      desc(ciOpportunities.updatedAt)
    )
    .limit(200);
}
