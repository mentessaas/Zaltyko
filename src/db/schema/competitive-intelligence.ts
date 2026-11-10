import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  BILLING_PERIODS,
  COMPETITOR_TYPES,
  CONFIDENCE_LEVELS,
  DATA_STATUSES,
  EFFORT_SIZES,
  EVIDENCE_LEVELS,
  FLOW_COVERAGES,
  LIFECYCLE_STATUSES,
  OPPORTUNITY_CLASSES,
  OPPORTUNITY_STATUSES,
  RESEARCH_STATUSES,
  SECTION_KEYS,
  SOURCE_TYPES,
  VAT_MODES,
  ZALTYKO_FLOW_STATUSES,
} from "../../lib/competencia/domain";

import { profiles } from "./profiles";

/**
 * Inteligencia competitiva interna (solo super-admin). Tablas globales, sin
 * tenant: describen empresas del mercado, no datos de academias ni menores.
 * Candidato SQL: docs/deployment/candidates/20261110180000_competitive_intelligence_candidate.sql
 * (no aplicado en ningún entorno alojado).
 */

function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}

export const ciCompetitors = pgTable(
  "ci_competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    website: text("website"),
    competitorType: text("competitor_type").notNull(),
    countries: text("countries")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    disciplines: text("disciplines")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    clientSizes: text("client_sizes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    researchStatus: text("research_status").notNull().default("pendiente"),
    lifecycleStatus: text("lifecycle_status").notNull().default("activo"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    summary: text("summary"),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    updatedByProfileId: uuid("updated_by_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("ci_competitors_slug_unique").on(table.slug),
    lifecycleIdx: index("ci_competitors_lifecycle_idx").on(
      table.lifecycleStatus,
      table.name
    ),
    typeCheck: check(
      "ci_competitors_type_check",
      oneOf(table.competitorType, COMPETITOR_TYPES)
    ),
    researchCheck: check(
      "ci_competitors_research_check",
      oneOf(table.researchStatus, RESEARCH_STATUSES)
    ),
    lifecycleCheck: check(
      "ci_competitors_lifecycle_check",
      oneOf(table.lifecycleStatus, LIFECYCLE_STATUSES)
    ),
    archivedCheck: check(
      "ci_competitors_archived_check",
      sql`(${table.lifecycleStatus} = 'archivado') = (${table.archivedAt} is not null)`
    ),
    slugCheck: check(
      "ci_competitors_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`
    ),
    websiteCheck: check(
      "ci_competitors_website_check",
      sql`${table.website} is null or ${table.website} ~* '^https?://'`
    ),
  })
);

export const ciSources = pgTable(
  "ci_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorId: uuid("competitor_id").references(() => ciCompetitors.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull(),
    title: text("title"),
    accessedOn: date("accessed_on").notNull(),
    sourceType: text("source_type").notNull().default("web_oficial"),
    claim: text("claim").notNull(),
    evidenceLevel: text("evidence_level").notNull().default("declarado"),
    notes: text("notes"),
    accessible: boolean("accessible").notNull().default(true),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    competitorIdx: index("ci_sources_competitor_idx").on(
      table.competitorId,
      table.accessedOn
    ),
    typeCheck: check(
      "ci_sources_type_check",
      oneOf(table.sourceType, SOURCE_TYPES)
    ),
    evidenceCheck: check(
      "ci_sources_evidence_check",
      oneOf(table.evidenceLevel, EVIDENCE_LEVELS)
    ),
    urlCheck: check("ci_sources_url_check", sql`${table.url} ~ '^https?://'`),
  })
);

export const ciCompetitorSections = pgTable(
  "ci_competitor_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => ciCompetitors.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    content: text("content").notNull().default(""),
    dataStatus: text("data_status").notNull().default("pendiente_revision"),
    evidenceLevel: text("evidence_level").notNull().default("sin_evidencia"),
    lastVerifiedOn: date("last_verified_on"),
    reviewAfterDays: integer("review_after_days").notNull().default(90),
    sourceIds: uuid("source_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    updatedByProfileId: uuid("updated_by_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sectionUnique: uniqueIndex("ci_competitor_sections_unique").on(
      table.competitorId,
      table.section
    ),
    sectionCheck: check(
      "ci_competitor_sections_section_check",
      oneOf(table.section, SECTION_KEYS)
    ),
    statusCheck: check(
      "ci_competitor_sections_status_check",
      oneOf(table.dataStatus, DATA_STATUSES)
    ),
    evidenceCheck: check(
      "ci_competitor_sections_evidence_check",
      oneOf(table.evidenceLevel, EVIDENCE_LEVELS)
    ),
    reviewCheck: check(
      "ci_competitor_sections_review_check",
      sql`${table.reviewAfterDays} between 1 and 730`
    ),
  })
);

export const ciFlows = pgTable(
  "ci_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    valuedBy: text("valued_by"),
    zaltykoStatus: text("zaltyko_status").notNull().default("ausente"),
    zaltykoCodeRefs: text("zaltyko_code_refs"),
    demandEvidence: text("demand_evidence"),
    opportunity: text("opportunity"),
    decision: text("decision"),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyUnique: uniqueIndex("ci_flows_key_unique").on(table.key),
    statusCheck: check(
      "ci_flows_status_check",
      oneOf(table.zaltykoStatus, ZALTYKO_FLOW_STATUSES)
    ),
    decisionCheck: check(
      "ci_flows_decision_check",
      sql`${table.decision} is null or ${oneOf(table.decision, OPPORTUNITY_CLASSES)}`
    ),
  })
);

export const ciCompetitorFlows = pgTable(
  "ci_competitor_flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => ciCompetitors.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => ciFlows.id, { onDelete: "cascade" }),
    coverage: text("coverage").notNull().default("desconocido"),
    evidenceLevel: text("evidence_level").notNull().default("sin_evidencia"),
    sourceId: uuid("source_id").references(() => ciSources.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pairUnique: uniqueIndex("ci_competitor_flows_unique").on(
      table.competitorId,
      table.flowId
    ),
    flowIdx: index("ci_competitor_flows_flow_idx").on(table.flowId),
    sourceIdx: index("ci_competitor_flows_source_idx").on(table.sourceId),
    coverageCheck: check(
      "ci_competitor_flows_coverage_check",
      oneOf(table.coverage, FLOW_COVERAGES)
    ),
    evidenceCheck: check(
      "ci_competitor_flows_evidence_check",
      oneOf(table.evidenceLevel, EVIDENCE_LEVELS)
    ),
  })
);

export const ciPricingPlans = pgTable(
  "ci_pricing_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => ciCompetitors.id, { onDelete: "cascade" }),
    planName: text("plan_name").notNull(),
    priceAmount: numeric("price_amount", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("EUR"),
    billingPeriod: text("billing_period").notNull().default("mes"),
    vatMode: text("vat_mode").notNull().default("desconocido"),
    limitsText: text("limits_text"),
    feesText: text("fees_text"),
    extrasText: text("extras_text"),
    trialText: text("trial_text"),
    commitmentText: text("commitment_text"),
    estimateSmall: text("estimate_small"),
    estimateMedium: text("estimate_medium"),
    estimateLarge: text("estimate_large"),
    sourceId: uuid("source_id").references(() => ciSources.id, {
      onDelete: "set null",
    }),
    dataStatus: text("data_status").notNull().default("pendiente_revision"),
    lastVerifiedOn: date("last_verified_on"),
    reviewAfterDays: integer("review_after_days").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    planUnique: uniqueIndex("ci_pricing_plans_unique").on(
      table.competitorId,
      table.planName
    ),
    sourceIdx: index("ci_pricing_plans_source_idx").on(table.sourceId),
    periodCheck: check(
      "ci_pricing_plans_period_check",
      oneOf(table.billingPeriod, BILLING_PERIODS)
    ),
    vatCheck: check(
      "ci_pricing_plans_vat_check",
      oneOf(table.vatMode, VAT_MODES)
    ),
    statusCheck: check(
      "ci_pricing_plans_status_check",
      oneOf(table.dataStatus, DATA_STATUSES)
    ),
    currencyCheck: check(
      "ci_pricing_plans_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    amountCheck: check(
      "ci_pricing_plans_amount_check",
      sql`${table.priceAmount} is null or ${table.priceAmount} >= 0`
    ),
    reviewCheck: check(
      "ci_pricing_plans_review_check",
      sql`${table.reviewAfterDays} between 1 and 730`
    ),
  })
);

export const ciOpportunities = pgTable(
  "ci_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    classification: text("classification").notNull(),
    priority: integer("priority"),
    whoPays: text("who_pays"),
    frequency: text("frequency"),
    currentCost: text("current_cost"),
    minimumSolution: text("minimum_solution"),
    codeDependencies: text("code_dependencies"),
    confidence: text("confidence").notNull().default("baja"),
    effort: text("effort"),
    successMetric: text("success_metric"),
    validationPlan: text("validation_plan"),
    status: text("status").notNull().default("hipotesis"),
    competitorIds: uuid("competitor_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    titleUnique: uniqueIndex("ci_opportunities_title_unique").on(table.title),
    priorityIdx: index("ci_opportunities_priority_idx").on(
      table.status,
      table.priority
    ),
    classCheck: check(
      "ci_opportunities_class_check",
      oneOf(table.classification, OPPORTUNITY_CLASSES)
    ),
    statusCheck: check(
      "ci_opportunities_status_check",
      oneOf(table.status, OPPORTUNITY_STATUSES)
    ),
    confidenceCheck: check(
      "ci_opportunities_confidence_check",
      oneOf(table.confidence, CONFIDENCE_LEVELS)
    ),
    effortCheck: check(
      "ci_opportunities_effort_check",
      sql`${table.effort} is null or ${oneOf(table.effort, EFFORT_SIZES)}`
    ),
    priorityCheck: check(
      "ci_opportunities_priority_check",
      sql`${table.priority} is null or ${table.priority} between 1 and 99`
    ),
  })
);

/** Historial append-only: archivar o editar nunca borra la traza. */
export const ciChangeEvents = pgTable(
  "ci_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    competitorId: uuid("competitor_id").references(() => ciCompetitors.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    diff: jsonb("diff"),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    recentIdx: index("ci_change_events_recent_idx").on(table.createdAt),
    competitorIdx: index("ci_change_events_competitor_idx").on(
      table.competitorId,
      table.createdAt
    ),
  })
);

export type CiCompetitorRow = typeof ciCompetitors.$inferSelect;
export type CiSourceRow = typeof ciSources.$inferSelect;
export type CiSectionRow = typeof ciCompetitorSections.$inferSelect;
export type CiFlowRow = typeof ciFlows.$inferSelect;
export type CiCompetitorFlowRow = typeof ciCompetitorFlows.$inferSelect;
export type CiPricingPlanRow = typeof ciPricingPlans.$inferSelect;
export type CiOpportunityRow = typeof ciOpportunities.$inferSelect;
export type CiChangeEventRow = typeof ciChangeEvents.$inferSelect;
