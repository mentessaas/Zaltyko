import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { locations, organizations, zaltyko } from "./zaltyko-core";
import {
  metricDefinitions,
  metricGrain,
  metricQuality,
  metricRunValues,
  metricRuns,
} from "./zaltyko-metrics";

export const healthDimension = zaltyko.enum("health_dimension", [
  "enrollment",
  "financial",
  "operational",
  "workforce",
]);
export const healthScoreStatus = zaltyko.enum("health_score_status", [
  "critical",
  "needs_attention",
  "healthy",
  "excellent",
  "insufficient_data",
]);
export const scoreVersionStatus = zaltyko.enum("score_version_status", [
  "draft",
  "active",
  "retired",
]);
export const benchmarkProfileStatus = zaltyko.enum("benchmark_profile_status", [
  "draft",
  "active",
  "retired",
]);
export const normalizationDirection = zaltyko.enum("normalization_direction", [
  "higher_better",
  "lower_better",
]);

const scoreNumber = (name: string) =>
  numeric(name, { precision: 5, scale: 2, mode: "number" });
const ratio = (name: string) =>
  numeric(name, { precision: 5, scale: 4, mode: "number" });
const metricNumber = (name: string) =>
  numeric(name, { precision: 24, scale: 8, mode: "number" });

export const benchmarkProfiles = zaltyko.table(
  "benchmark_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    market: text("market").notNull(),
    currency: text("currency"),
    organizationType: text("organization_type").notNull(),
    disciplineScope: text("discipline_scope").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceYear: integer("source_year"),
    sourcePage: text("source_page"),
    methodologyNotes: text("methodology_notes").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    version: integer("version").notNull(),
    status: benchmarkProfileStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "benchmark_profiles_dates_valid",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`
    ),
    check("benchmark_profiles_version_positive", sql`${table.version} > 0`),
  ]
);

export const benchmarkMetricTargets = zaltyko.table(
  "benchmark_metric_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchmarkProfileId: uuid("benchmark_profile_id")
      .notNull()
      .references(() => benchmarkProfiles.id, { onDelete: "cascade" }),
    metricKey: text("metric_key")
      .notNull()
      .references(() => metricDefinitions.key, { onDelete: "restrict" }),
    targetNumeric: metricNumber("target_numeric").notNull(),
    currency: text("currency"),
    grain: metricGrain("grain").notNull(),
    normalizationDirection: normalizationDirection(
      "normalization_direction"
    ).notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("benchmark_metric_targets_uq").on(
      table.benchmarkProfileId,
      table.metricKey,
      table.currency
    ),
    check("benchmark_metric_targets_positive", sql`${table.targetNumeric} > 0`),
  ]
);

export const healthScoreVersions = zaltyko.table(
  "health_score_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    status: scoreVersionStatus("status").notNull().default("draft"),
    minValidDimensions: integer("min_valid_dimensions").notNull(),
    minGlobalCoverage: ratio("min_global_coverage").notNull(),
    minDimensionAvailableWeight: ratio(
      "min_dimension_available_weight"
    ).notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("health_score_versions_key_version_uq").on(
      table.key,
      table.version
    ),
  ]
);

export const healthScoreDimensionWeights = zaltyko.table(
  "health_score_dimension_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    healthScoreVersionId: uuid("health_score_version_id")
      .notNull()
      .references(() => healthScoreVersions.id, { onDelete: "cascade" }),
    dimension: healthDimension("dimension").notNull(),
    weight: ratio("weight").notNull(),
  },
  (table) => [
    uniqueIndex("health_score_dimension_weights_uq").on(
      table.healthScoreVersionId,
      table.dimension
    ),
  ]
);

export const healthScoreMetricWeights = zaltyko.table(
  "health_score_metric_weights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    healthScoreVersionId: uuid("health_score_version_id")
      .notNull()
      .references(() => healthScoreVersions.id, { onDelete: "cascade" }),
    dimension: healthDimension("dimension").notNull(),
    metricKey: text("metric_key")
      .notNull()
      .references(() => metricDefinitions.key, { onDelete: "restrict" }),
    weight: ratio("weight").notNull(),
  },
  (table) => [
    uniqueIndex("health_score_metric_weights_uq").on(
      table.healthScoreVersionId,
      table.dimension,
      table.metricKey
    ),
  ]
);

export const healthScoreSnapshots = zaltyko.table(
  "health_score_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    metricRunId: uuid("metric_run_id").notNull(),
    healthScoreVersionId: uuid("health_score_version_id")
      .notNull()
      .references(() => healthScoreVersions.id, { onDelete: "restrict" }),
    benchmarkProfileId: uuid("benchmark_profile_id")
      .notNull()
      .references(() => benchmarkProfiles.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    score: scoreNumber("score"),
    status: healthScoreStatus("status").notNull(),
    coverage: ratio("coverage").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    sourceWatermark: timestamp("source_watermark", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    explanation: jsonb("explanation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("health_score_snapshots_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("health_score_snapshots_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("health_score_snapshots_dashboard_idx").on(
      table.organizationId,
      table.periodEnd,
      table.computedAt
    ),
    foreignKey({
      name: "health_score_snapshots_metric_run_fk",
      columns: [table.organizationId, table.metricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "health_score_snapshots_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const healthScoreDimensionSnapshots = zaltyko.table(
  "health_score_dimension_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    healthScoreSnapshotId: uuid("health_score_snapshot_id").notNull(),
    dimension: healthDimension("dimension").notNull(),
    score: scoreNumber("score"),
    status: healthScoreStatus("status").notNull(),
    coverage: ratio("coverage").notNull(),
    availableMetricWeight: ratio("available_metric_weight").notNull(),
    configuredMetricWeight: ratio("configured_metric_weight").notNull(),
    explanation: jsonb("explanation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("health_score_dimension_snapshots_uq").on(
      table.healthScoreSnapshotId,
      table.dimension
    ),
    foreignKey({
      name: "health_score_dimension_snapshots_parent_fk",
      columns: [table.organizationId, table.healthScoreSnapshotId],
      foreignColumns: [
        healthScoreSnapshots.organizationId,
        healthScoreSnapshots.id,
      ],
    }).onDelete("cascade"),
  ]
);

export const healthScoreMetricContributions = zaltyko.table(
  "health_score_metric_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    healthScoreSnapshotId: uuid("health_score_snapshot_id").notNull(),
    dimension: healthDimension("dimension").notNull(),
    metricKey: text("metric_key")
      .notNull()
      .references(() => metricDefinitions.key, { onDelete: "restrict" }),
    metricRunValueId: uuid("metric_run_value_id"),
    benchmarkTargetId: uuid("benchmark_target_id").references(
      () => benchmarkMetricTargets.id,
      { onDelete: "restrict" }
    ),
    actualValue: metricNumber("actual_value"),
    targetValue: metricNumber("target_value"),
    normalizedScore: scoreNumber("normalized_score"),
    metricWeight: ratio("metric_weight").notNull(),
    metricCoverage: ratio("metric_coverage").notNull(),
    effectiveWeight: numeric("effective_weight", {
      precision: 8,
      scale: 6,
      mode: "number",
    }).notNull(),
    quality: metricQuality("quality").notNull(),
    formulaVersion: integer("formula_version"),
    explanation: jsonb("explanation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("health_score_metric_contributions_uq").on(
      table.healthScoreSnapshotId,
      table.dimension,
      table.metricKey
    ),
    foreignKey({
      name: "health_score_metric_contributions_parent_fk",
      columns: [table.organizationId, table.healthScoreSnapshotId],
      foreignColumns: [
        healthScoreSnapshots.organizationId,
        healthScoreSnapshots.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "health_score_metric_contributions_value_fk",
      columns: [table.organizationId, table.metricRunValueId],
      foreignColumns: [metricRunValues.organizationId, metricRunValues.id],
    }).onDelete("restrict"),
  ]
);

export type BenchmarkProfile = typeof benchmarkProfiles.$inferSelect;
export type HealthScoreVersion = typeof healthScoreVersions.$inferSelect;
export type HealthScoreSnapshot = typeof healthScoreSnapshots.$inferSelect;
export type HealthScoreDimensionSnapshot =
  typeof healthScoreDimensionSnapshots.$inferSelect;
