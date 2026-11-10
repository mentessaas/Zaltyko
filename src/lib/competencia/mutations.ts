import { and, eq, inArray } from "drizzle-orm";

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
} from "@/db/schema/competitive-intelligence";

import type {
  CompetitiveSeed,
  CompetitorCreateInput,
  CompetitorUpdateInput,
  FlowCoverageInput,
  FlowInput,
  OpportunityInput,
  PricingPlanInput,
  SectionUpdateInput,
  SourceCreateInput,
  SourceUpdateInput,
} from "./contracts";
import {
  DEFAULT_REVIEW_DAYS,
  SECTION_KEYS,
  slugify,
  type SectionKey,
} from "./domain";

type Database = typeof db;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

export class CompetenciaNotFoundError extends Error {
  constructor(public readonly entity: string) {
    super(`${entity} no encontrado`);
  }
}

/** Referencia a una fuente o empresa que no existe o no corresponde (400). */
export class CompetenciaReferenceError extends Error {}

/**
 * Las fuentes citadas por una ficha deben existir y ser de esa misma empresa:
 * `source_ids` es un array sin clave foránea y la base no lo comprueba.
 */
async function assertSourcesBelongTo(
  executor: Executor,
  competitorId: string,
  sourceIds: ReadonlyArray<string | null | undefined>
) {
  const ids = [...new Set(sourceIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const rows = await executor
    .select({ id: ciSources.id, competitorId: ciSources.competitorId })
    .from(ciSources)
    .where(inArray(ciSources.id, ids))
    .limit(ids.length);
  const found = new Map(rows.map((row) => [row.id, row.competitorId]));
  for (const id of ids) {
    if (!found.has(id)) {
      throw new CompetenciaReferenceError(`La fuente ${id} no existe`);
    }
    if (found.get(id) !== competitorId) {
      throw new CompetenciaReferenceError(
        `La fuente ${id} no pertenece a esta empresa`
      );
    }
  }
}

/** Las empresas vinculadas a una oportunidad deben existir. */
async function assertCompetitorsExist(
  executor: Executor,
  competitorIds: ReadonlyArray<string>
) {
  const ids = [...new Set(competitorIds)];
  if (ids.length === 0) return;
  const rows = await executor
    .select({ id: ciCompetitors.id })
    .from(ciCompetitors)
    .where(inArray(ciCompetitors.id, ids))
    .limit(ids.length);
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.find((id) => !found.has(id));
  if (missing) {
    throw new CompetenciaReferenceError(`La empresa ${missing} no existe`);
  }
}

type Comparable = Record<string, unknown>;

/** Diferencia mínima campo a campo, solo para claves presentes en `next`. */
export function computeDiff(
  previous: Comparable | null,
  next: Comparable
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const before = previous ? previous[key] : undefined;
    const normalize = (input: unknown) =>
      input instanceof Date ? input.toISOString() : input;
    if (
      JSON.stringify(normalize(before)) !== JSON.stringify(normalize(value))
    ) {
      diff[key] = { from: normalize(before) ?? null, to: normalize(value) };
    }
  }
  return diff;
}

async function recordChange(
  executor: Executor,
  event: {
    entityType: string;
    entityId: string;
    competitorId: string | null;
    action: string;
    summary: string;
    diff?: Record<string, unknown> | null;
    actorProfileId: string | null;
  }
) {
  await executor
    .insert(ciChangeEvents)
    .values({ ...event, diff: event.diff ?? null });
}

async function uniqueSlug(executor: Executor, name: string): Promise<string> {
  const base = slugify(name) || "competidor";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [existing] = await executor
      .select({ id: ciCompetitors.id })
      .from(ciCompetitors)
      .where(eq(ciCompetitors.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error("No se pudo generar un identificador único");
}

/* ---------- Competidores ---------- */

export async function createCompetitor(
  input: CompetitorCreateInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, input.name);
    const [competitor] = await tx
      .insert(ciCompetitors)
      .values({
        ...input,
        slug,
        createdByProfileId: actorProfileId,
        updatedByProfileId: actorProfileId,
      })
      .returning();
    await recordChange(tx, {
      entityType: "competitor",
      entityId: competitor.id,
      competitorId: competitor.id,
      action: "created",
      summary: `Alta de ${competitor.name}`,
      diff: computeDiff(null, input),
      actorProfileId,
    });
    return competitor;
  });
}

export async function updateCompetitor(
  competitorId: string,
  input: CompetitorUpdateInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(ciCompetitors)
      .where(eq(ciCompetitors.id, competitorId))
      .limit(1);
    if (!previous) throw new CompetenciaNotFoundError("Competidor");

    const values: Partial<typeof ciCompetitors.$inferInsert> = { ...input };
    if (
      input.lifecycleStatus !== undefined &&
      input.lifecycleStatus !== previous.lifecycleStatus
    ) {
      values.archivedAt =
        input.lifecycleStatus === "archivado" ? new Date() : null;
    }
    const diff = computeDiff(previous, values);
    if (Object.keys(diff).length === 0) return previous;

    const [competitor] = await tx
      .update(ciCompetitors)
      .set({
        ...values,
        updatedByProfileId: actorProfileId,
        updatedAt: new Date(),
      })
      .where(eq(ciCompetitors.id, competitorId))
      .returning();

    const lifecycleChanged = "lifecycleStatus" in diff;
    const action = lifecycleChanged
      ? input.lifecycleStatus === "archivado"
        ? "archived"
        : previous.lifecycleStatus === "archivado"
          ? "restored"
          : "lifecycle_changed"
      : "updated";
    const summaries: Record<string, string> = {
      archived: `${competitor.name} archivado (se conserva el historial)`,
      restored: `${competitor.name} recuperado del archivo`,
      lifecycle_changed: `${competitor.name} marcado como ${competitor.lifecycleStatus}`,
      updated: `Datos generales de ${competitor.name} actualizados`,
    };
    await recordChange(tx, {
      entityType: "competitor",
      entityId: competitor.id,
      competitorId: competitor.id,
      action,
      summary: summaries[action],
      diff,
      actorProfileId,
    });
    return competitor;
  });
}

async function requireCompetitor(executor: Executor, competitorId: string) {
  const [competitor] = await executor
    .select({ id: ciCompetitors.id, name: ciCompetitors.name })
    .from(ciCompetitors)
    .where(eq(ciCompetitors.id, competitorId))
    .limit(1);
  if (!competitor) throw new CompetenciaNotFoundError("Competidor");
  return competitor;
}

/* ---------- Secciones ---------- */

export async function upsertSection(
  competitorId: string,
  section: SectionKey,
  input: SectionUpdateInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const competitor = await requireCompetitor(tx, competitorId);
    await assertSourcesBelongTo(tx, competitorId, input.sourceIds ?? []);
    const [previous] = await tx
      .select()
      .from(ciCompetitorSections)
      .where(
        and(
          eq(ciCompetitorSections.competitorId, competitorId),
          eq(ciCompetitorSections.section, section)
        )
      )
      .limit(1);
    const diff = computeDiff(previous ?? null, input);
    if (previous && Object.keys(diff).length === 0) return previous;

    const [row] = await tx
      .insert(ciCompetitorSections)
      .values({
        competitorId,
        section,
        ...input,
        updatedByProfileId: actorProfileId,
      })
      .onConflictDoUpdate({
        target: [
          ciCompetitorSections.competitorId,
          ciCompetitorSections.section,
        ],
        set: {
          ...input,
          updatedByProfileId: actorProfileId,
          updatedAt: new Date(),
        },
      })
      .returning();
    await recordChange(tx, {
      entityType: "section",
      entityId: row.id,
      competitorId,
      action: previous ? "section_updated" : "section_created",
      summary: `${competitor.name}: sección «${section}» ${previous ? "actualizada" : "completada"} (${input.dataStatus})`,
      diff: computeDiff(previous ?? null, {
        content: input.content,
        dataStatus: input.dataStatus,
        evidenceLevel: input.evidenceLevel,
        lastVerifiedOn: input.lastVerifiedOn,
      }),
      actorProfileId,
    });
    return row;
  });
}

/* ---------- Fuentes ---------- */

export async function createSource(
  input: SourceCreateInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const competitor = input.competitorId
      ? await requireCompetitor(tx, input.competitorId)
      : null;
    const [source] = await tx
      .insert(ciSources)
      .values({ ...input, createdByProfileId: actorProfileId })
      .returning();
    await recordChange(tx, {
      entityType: "source",
      entityId: source.id,
      competitorId: source.competitorId,
      action: "source_added",
      summary: `${competitor ? `${competitor.name}: ` : ""}fuente añadida (${source.sourceType}, ${source.evidenceLevel})`,
      diff: computeDiff(null, {
        url: source.url,
        claim: source.claim,
        accessedOn: source.accessedOn,
      }),
      actorProfileId,
    });
    return source;
  });
}

export async function updateSource(
  sourceId: string,
  input: SourceUpdateInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(ciSources)
      .where(eq(ciSources.id, sourceId))
      .limit(1);
    if (!previous) throw new CompetenciaNotFoundError("Fuente");
    const diff = computeDiff(previous, input);
    if (Object.keys(diff).length === 0) return previous;
    const [source] = await tx
      .update(ciSources)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(ciSources.id, sourceId))
      .returning();
    await recordChange(tx, {
      entityType: "source",
      entityId: source.id,
      competitorId: source.competitorId,
      action: "source_updated",
      summary: `Fuente actualizada: ${source.title ?? source.url}`,
      diff,
      actorProfileId,
    });
    return source;
  });
}

/* ---------- Flujos y cobertura ---------- */

export async function createFlow(
  input: FlowInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const key = slugify(input.name).replace(/-/g, "_") || "flujo";
    const [flow] = await tx
      .insert(ciFlows)
      .values({ ...input, key })
      .returning();
    await recordChange(tx, {
      entityType: "flow",
      entityId: flow.id,
      competitorId: null,
      action: "flow_created",
      summary: `Flujo añadido: ${flow.name}`,
      diff: computeDiff(null, input),
      actorProfileId,
    });
    return flow;
  });
}

export async function updateFlow(
  flowId: string,
  input: FlowInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(ciFlows)
      .where(eq(ciFlows.id, flowId))
      .limit(1);
    if (!previous) throw new CompetenciaNotFoundError("Flujo");
    const diff = computeDiff(previous, input);
    if (Object.keys(diff).length === 0) return previous;
    const [flow] = await tx
      .update(ciFlows)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(ciFlows.id, flowId))
      .returning();
    await recordChange(tx, {
      entityType: "flow",
      entityId: flow.id,
      competitorId: null,
      action: "flow_updated",
      summary: `Flujo actualizado: ${flow.name}`,
      diff,
      actorProfileId,
    });
    return flow;
  });
}

export async function upsertFlowCoverage(
  competitorId: string,
  input: FlowCoverageInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const competitor = await requireCompetitor(tx, competitorId);
    const [flow] = await tx
      .select({ id: ciFlows.id, name: ciFlows.name })
      .from(ciFlows)
      .where(eq(ciFlows.id, input.flowId))
      .limit(1);
    if (!flow) throw new CompetenciaNotFoundError("Flujo");
    await assertSourcesBelongTo(tx, competitorId, [input.sourceId]);
    const [previous] = await tx
      .select()
      .from(ciCompetitorFlows)
      .where(
        and(
          eq(ciCompetitorFlows.competitorId, competitorId),
          eq(ciCompetitorFlows.flowId, input.flowId)
        )
      )
      .limit(1);
    const { flowId, ...values } = input;
    const diff = computeDiff(previous ?? null, values);
    if (previous && Object.keys(diff).length === 0) return previous;
    const [row] = await tx
      .insert(ciCompetitorFlows)
      .values({ competitorId, flowId, ...values })
      .onConflictDoUpdate({
        target: [ciCompetitorFlows.competitorId, ciCompetitorFlows.flowId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    await recordChange(tx, {
      entityType: "competitor_flow",
      entityId: row.id,
      competitorId,
      action: "coverage_updated",
      summary: `${competitor.name}: «${flow.name}» → ${row.coverage}`,
      diff,
      actorProfileId,
    });
    return row;
  });
}

/* ---------- Precios ---------- */

function pricingValues(input: PricingPlanInput) {
  return {
    ...input,
    priceAmount:
      input.priceAmount === null ? null : input.priceAmount.toFixed(2),
  };
}

export async function createPricingPlan(
  competitorId: string,
  input: PricingPlanInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const competitor = await requireCompetitor(tx, competitorId);
    await assertSourcesBelongTo(tx, competitorId, [input.sourceId]);
    const [plan] = await tx
      .insert(ciPricingPlans)
      .values({ competitorId, ...pricingValues(input) })
      .returning();
    await recordChange(tx, {
      entityType: "pricing_plan",
      entityId: plan.id,
      competitorId,
      action: "pricing_added",
      summary: `${competitor.name}: plan «${plan.planName}» añadido`,
      diff: computeDiff(null, pricingValues(input)),
      actorProfileId,
    });
    return plan;
  });
}

export async function updatePricingPlan(
  planId: string,
  input: PricingPlanInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(ciPricingPlans)
      .where(eq(ciPricingPlans.id, planId))
      .limit(1);
    if (!previous) throw new CompetenciaNotFoundError("Plan de precios");
    await assertSourcesBelongTo(tx, previous.competitorId, [input.sourceId]);
    const values = pricingValues(input);
    const diff = computeDiff(previous, values);
    if (Object.keys(diff).length === 0) return previous;
    const [plan] = await tx
      .update(ciPricingPlans)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(ciPricingPlans.id, planId))
      .returning();
    await recordChange(tx, {
      entityType: "pricing_plan",
      entityId: plan.id,
      competitorId: plan.competitorId,
      action: "pricing_updated",
      summary: `Plan «${plan.planName}» actualizado`,
      diff,
      actorProfileId,
    });
    return plan;
  });
}

/* ---------- Oportunidades ---------- */

export async function createOpportunity(
  input: OpportunityInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    await assertCompetitorsExist(tx, input.competitorIds ?? []);
    const [opportunity] = await tx
      .insert(ciOpportunities)
      .values({ ...input, createdByProfileId: actorProfileId })
      .returning();
    await recordChange(tx, {
      entityType: "opportunity",
      entityId: opportunity.id,
      competitorId: null,
      action: "opportunity_created",
      summary: `Oportunidad añadida: ${opportunity.title} (${opportunity.classification})`,
      diff: computeDiff(null, input),
      actorProfileId,
    });
    return opportunity;
  });
}

export async function updateOpportunity(
  opportunityId: string,
  input: OpportunityInput,
  actorProfileId: string | null
) {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(ciOpportunities)
      .where(eq(ciOpportunities.id, opportunityId))
      .limit(1);
    if (!previous) throw new CompetenciaNotFoundError("Oportunidad");
    await assertCompetitorsExist(tx, input.competitorIds ?? []);
    const diff = computeDiff(previous, input);
    if (Object.keys(diff).length === 0) return previous;
    const [opportunity] = await tx
      .update(ciOpportunities)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(ciOpportunities.id, opportunityId))
      .returning();
    await recordChange(tx, {
      entityType: "opportunity",
      entityId: opportunity.id,
      competitorId: null,
      action: "opportunity_updated",
      summary: `Oportunidad actualizada: ${opportunity.title}`,
      diff,
      actorProfileId,
    });
    return opportunity;
  });
}

/* ---------- Semilla idempotente ---------- */

export interface SeedReport {
  competitorsCreated: number;
  sectionsCreated: number;
  sourcesCreated: number;
  pricingCreated: number;
  flowsCreated: number;
  coverageCreated: number;
  opportunitiesCreated: number;
}

/**
 * Carga la semilla versionada sin pisar nada: solo inserta lo que falta
 * (competidor por slug, sección por competidor+clave, fuente por
 * competidor+URL+afirmación, plan por competidor+nombre, flujo por clave,
 * oportunidad por título). Las ediciones posteriores siempre prevalecen.
 */
export async function applyCompetitiveSeed(
  seed: CompetitiveSeed,
  actorProfileId: string | null
): Promise<SeedReport> {
  const report: SeedReport = {
    competitorsCreated: 0,
    sectionsCreated: 0,
    sourcesCreated: 0,
    pricingCreated: 0,
    flowsCreated: 0,
    coverageCreated: 0,
    opportunitiesCreated: 0,
  };

  await db.transaction(async (tx) => {
    const flowIds = new Map<string, string>();
    for (const flow of seed.flows) {
      const [existing] = await tx
        .select({ id: ciFlows.id })
        .from(ciFlows)
        .where(eq(ciFlows.key, flow.key))
        .limit(1);
      if (existing) {
        flowIds.set(flow.key, existing.id);
        continue;
      }
      const [created] = await tx
        .insert(ciFlows)
        .values(flow)
        .returning({ id: ciFlows.id });
      flowIds.set(flow.key, created.id);
      report.flowsCreated += 1;
    }

    const competitorIds = new Map<string, string>();
    for (const item of seed.competitors) {
      let [competitor] = await tx
        .select({ id: ciCompetitors.id })
        .from(ciCompetitors)
        .where(eq(ciCompetitors.slug, item.slug))
        .limit(1);
      if (!competitor) {
        [competitor] = await tx
          .insert(ciCompetitors)
          .values({
            slug: item.slug,
            name: item.name,
            website: item.website,
            competitorType: item.competitorType,
            countries: item.countries,
            disciplines: item.disciplines,
            clientSizes: item.clientSizes,
            researchStatus: item.researchStatus,
            summary: item.summary,
            createdByProfileId: actorProfileId,
            updatedByProfileId: actorProfileId,
          })
          .returning({ id: ciCompetitors.id });
        report.competitorsCreated += 1;
        await recordChange(tx, {
          entityType: "competitor",
          entityId: competitor.id,
          competitorId: competitor.id,
          action: "seeded",
          summary: `${item.name} cargado desde la semilla ${seed.version}`,
          actorProfileId,
        });
      }
      competitorIds.set(item.slug, competitor.id);

      const sourceIds = new Map<string, string>();
      for (const source of item.sources) {
        const [existing] = await tx
          .select({ id: ciSources.id })
          .from(ciSources)
          .where(
            and(
              eq(ciSources.competitorId, competitor.id),
              eq(ciSources.url, source.url),
              eq(ciSources.claim, source.claim)
            )
          )
          .limit(1);
        if (existing) {
          sourceIds.set(source.ref, existing.id);
          continue;
        }
        const { ref, ...values } = source;
        const [created] = await tx
          .insert(ciSources)
          .values({
            ...values,
            competitorId: competitor.id,
            createdByProfileId: actorProfileId,
          })
          .returning({ id: ciSources.id });
        sourceIds.set(ref, created.id);
        report.sourcesCreated += 1;
      }

      for (const key of SECTION_KEYS) {
        const section = item.sections[key];
        const inserted = await tx
          .insert(ciCompetitorSections)
          .values({
            competitorId: competitor.id,
            section: key,
            content: section?.content ?? "",
            dataStatus: section?.dataStatus ?? "pendiente_revision",
            evidenceLevel: section?.evidenceLevel ?? "sin_evidencia",
            lastVerifiedOn: section?.lastVerifiedOn ?? null,
            reviewAfterDays: DEFAULT_REVIEW_DAYS[key],
            sourceIds: (section?.sourceRefs ?? [])
              .map((ref) => sourceIds.get(ref))
              .filter((id): id is string => Boolean(id)),
            updatedByProfileId: actorProfileId,
          })
          .onConflictDoNothing({
            target: [
              ciCompetitorSections.competitorId,
              ciCompetitorSections.section,
            ],
          })
          .returning({ id: ciCompetitorSections.id });
        report.sectionsCreated += inserted.length;
      }

      for (const plan of item.pricing) {
        const { sourceRef, ...values } = plan;
        const inserted = await tx
          .insert(ciPricingPlans)
          .values({
            ...values,
            priceAmount:
              values.priceAmount === null
                ? null
                : values.priceAmount.toFixed(2),
            competitorId: competitor.id,
            sourceId: sourceRef ? (sourceIds.get(sourceRef) ?? null) : null,
          })
          .onConflictDoNothing({
            target: [ciPricingPlans.competitorId, ciPricingPlans.planName],
          })
          .returning({ id: ciPricingPlans.id });
        report.pricingCreated += inserted.length;
      }

      for (const coverage of item.flows) {
        const flowId = flowIds.get(coverage.flow);
        if (!flowId)
          throw new Error(
            `La semilla referencia un flujo inexistente: ${coverage.flow}`
          );
        const inserted = await tx
          .insert(ciCompetitorFlows)
          .values({
            competitorId: competitor.id,
            flowId,
            coverage: coverage.coverage,
            evidenceLevel: coverage.evidenceLevel,
            sourceId: coverage.sourceRef
              ? (sourceIds.get(coverage.sourceRef) ?? null)
              : null,
            notes: coverage.notes,
          })
          .onConflictDoNothing({
            target: [ciCompetitorFlows.competitorId, ciCompetitorFlows.flowId],
          })
          .returning({ id: ciCompetitorFlows.id });
        report.coverageCreated += inserted.length;
      }
    }

    for (const opportunity of seed.opportunities) {
      const { competitorSlugs, ...values } = opportunity;
      const inserted = await tx
        .insert(ciOpportunities)
        .values({
          ...values,
          competitorIds: competitorSlugs
            .map((slug) => competitorIds.get(slug))
            .filter((id): id is string => Boolean(id)),
          createdByProfileId: actorProfileId,
        })
        .onConflictDoNothing({ target: ciOpportunities.title })
        .returning({ id: ciOpportunities.id });
      report.opportunitiesCreated += inserted.length;
    }
  });

  return report;
}
