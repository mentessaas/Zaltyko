import { sql } from "drizzle-orm";
import {
  boolean,
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

import {
  groups,
  locations,
  organizations,
  outboxEvents,
  programs,
  zaltyko,
} from "./zaltyko-core";

export const metricUnit = zaltyko.enum("metric_unit", [
  "count",
  "ratio",
  "currency_minor",
]);
export const metricDirection = zaltyko.enum("metric_direction", [
  "higher_better",
  "lower_better",
  "neutral",
]);
export const metricGrain = zaltyko.enum("metric_grain", [
  "day",
  "week",
  "month",
  "season",
  "year",
]);
export const metricRunStatus = zaltyko.enum("metric_run_status", [
  "running",
  "succeeded",
  "failed",
]);
export const metricQuality = zaltyko.enum("metric_quality", [
  "complete",
  "partial",
  "insufficient",
  "stale",
  "invalid",
]);
export const dataQualityIssueStatus = zaltyko.enum(
  "data_quality_issue_status",
  ["open", "resolved"]
);

const metricNumber = (name: string) =>
  numeric(name, { precision: 24, scale: 8, mode: "number" });

export const metricDefinitions = zaltyko.table(
  "metric_definitions",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    unit: metricUnit("unit").notNull(),
    direction: metricDirection("direction").notNull(),
    grain: metricGrain("grain").notNull(),
    formulaVersion: integer("formula_version").notNull(),
    owner: text("owner").notNull(),
    active: boolean("active").notNull().default(true),
    formula: text("formula").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "metric_definitions_key_valid",
      sql`${table.key} ~ '^[a-z][a-z0-9_]+$'`
    ),
    check(
      "metric_definitions_formula_version_positive",
      sql`${table.formulaVersion} > 0`
    ),
  ]
);

export const metricRuns = zaltyko.table(
  "metric_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorizationLocationId: uuid("authorization_location_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    currency: text("currency").notNull(),
    formulaSetVersion: text("formula_set_version").notNull(),
    status: metricRunStatus("status").notNull().default("running"),
    parameters: jsonb("parameters")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceWatermark: timestamp("source_watermark", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_runs_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("metric_runs_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("metric_runs_period_idx").on(
      table.organizationId,
      table.periodEnd,
      table.startedAt
    ),
    check(
      "metric_runs_period_valid",
      sql`${table.periodEnd} >= ${table.periodStart}`
    ),
    foreignKey({
      name: "metric_runs_authorization_location_fk",
      columns: [table.organizationId, table.authorizationLocationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

const metricValueColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  metricRunId: uuid("metric_run_id").notNull(),
  locationId: uuid("location_id"),
  metricKey: text("metric_key")
    .notNull()
    .references(() => metricDefinitions.key, { onDelete: "restrict" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  valueNumeric: metricNumber("value_numeric"),
  currency: text("currency"),
  numerator: metricNumber("numerator"),
  denominator: metricNumber("denominator"),
  coverage: numeric("coverage", {
    precision: 5,
    scale: 4,
    mode: "number",
  }).notNull(),
  quality: metricQuality("quality").notNull(),
  dimensions: jsonb("dimensions")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  dimensionsSha256: text("dimensions_sha256").notNull(),
  formulaVersion: integer("formula_version").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  sourceWatermark: timestamp("source_watermark", {
    withTimezone: true,
  }).notNull(),
  diagnostics: jsonb("diagnostics")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const metricRunValues = zaltyko.table(
  "metric_run_values",
  metricValueColumns,
  (table) => [
    uniqueIndex("metric_run_values_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      name: "metric_run_values_run_fk",
      columns: [table.organizationId, table.metricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "metric_run_values_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const metricValues = zaltyko.table(
  "metric_values",
  {
    ...metricValueColumns,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("metric_values_dashboard_idx").on(
      table.organizationId,
      table.periodEnd,
      table.metricKey
    ),
    foreignKey({
      name: "metric_values_run_fk",
      columns: [table.organizationId, table.metricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "metric_values_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const metricEventConsumptions = zaltyko.table(
  "metric_event_consumptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    outboxEventId: uuid("outbox_event_id").notNull(),
    handlerKey: text("handler_key").notNull(),
    handlerVersion: integer("handler_version").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_event_consumptions_uq").on(
      table.outboxEventId,
      table.handlerKey,
      table.handlerVersion
    ),
    foreignKey({
      name: "metric_event_consumptions_event_fk",
      columns: [table.organizationId, table.outboxEventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
    }).onDelete("cascade"),
  ]
);

export const metricInvalidations = zaltyko.table(
  "metric_invalidations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    outboxEventId: uuid("outbox_event_id").notNull(),
    handlerKey: text("handler_key").notNull(),
    handlerVersion: integer("handler_version").notNull(),
    reasonEventName: text("reason_event_name").notNull(),
    affectedFrom: date("affected_from").notNull(),
    affectedTo: date("affected_to").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("metric_invalidations_event_uq").on(
      table.outboxEventId,
      table.handlerKey,
      table.handlerVersion
    ),
    index("metric_invalidations_pending_idx").on(
      table.organizationId,
      table.status,
      table.affectedFrom,
      table.affectedTo
    ),
    check(
      "metric_invalidations_period_valid",
      sql`${table.affectedTo} >= ${table.affectedFrom}`
    ),
    check(
      "metric_invalidations_status_valid",
      sql`${table.status} in ('pending', 'processed')`
    ),
    foreignKey({
      name: "metric_invalidations_event_fk",
      columns: [table.organizationId, table.outboxEventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "metric_invalidations_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const retentionCohortProjectionRuns = zaltyko.table(
  "retention_cohort_projection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricRunId: uuid("metric_run_id").notNull(),
    locationId: uuid("location_id"),
    formulaVersion: integer("formula_version").notNull(),
    sourceWatermark: timestamp("source_watermark", {
      withTimezone: true,
    }).notNull(),
    status: text("status").notNull().default("running"),
    idempotencyKey: text("idempotency_key").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (table) => [
    uniqueIndex("retention_cohort_projection_runs_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("retention_cohort_projection_runs_organization_id_id_uq").on(
      table.organizationId,
      table.id
    ),
    index("retention_cohort_projection_runs_latest_idx").on(
      table.organizationId,
      table.locationId,
      table.status,
      table.sourceWatermark
    ),
    check(
      "retention_cohort_projection_runs_version_positive",
      sql`${table.formulaVersion} > 0`
    ),
    check(
      "retention_cohort_projection_runs_row_count_nonnegative",
      sql`${table.rowCount} >= 0`
    ),
    check(
      "retention_cohort_projection_runs_status_valid",
      sql`${table.status} in ('running', 'succeeded', 'failed')`
    ),
    check(
      "retention_cohort_projection_runs_completion_valid",
      sql`(${table.status} = 'succeeded') = (${table.completedAt} is not null)`
    ),
    foreignKey({
      name: "retention_cohort_projection_runs_metric_run_fk",
      columns: [table.organizationId, table.metricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "retention_cohort_projection_runs_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const retentionCohortProjections = zaltyko.table(
  "retention_cohort_projections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectionRunId: uuid("projection_run_id").notNull(),
    locationId: uuid("location_id"),
    programId: uuid("program_id"),
    groupId: uuid("group_id"),
    cohortMonth: date("cohort_month").notNull(),
    observationMonth: date("observation_month").notNull(),
    cohortSize: integer("cohort_size").notNull(),
    activeCount: integer("active_count").notNull(),
    pausedCount: integer("paused_count").notNull(),
    retentionRate: numeric("retention_rate", {
      precision: 5,
      scale: 4,
      mode: "number",
    }),
    quality: metricQuality("quality").notNull(),
    numerator: integer("numerator").notNull(),
    denominator: integer("denominator").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("retention_cohort_projections_scope_period_uq").on(
      table.organizationId,
      table.projectionRunId,
      sql`coalesce(${table.locationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${table.programId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${table.groupId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.cohortMonth,
      table.observationMonth
    ),
    index("retention_cohort_projections_read_idx").on(
      table.organizationId,
      table.locationId,
      table.programId,
      table.groupId,
      table.cohortMonth,
      table.observationMonth,
      table.projectionRunId
    ),
    index("retention_cohort_projections_run_idx").on(
      table.organizationId,
      table.projectionRunId
    ),
    check(
      "retention_cohort_projections_months_valid",
      sql`date_trunc('month', ${table.cohortMonth}::timestamp)::date = ${table.cohortMonth}
        and date_trunc('month', ${table.observationMonth}::timestamp)::date = ${table.observationMonth}
        and ${table.observationMonth} >= ${table.cohortMonth}`
    ),
    check(
      "retention_cohort_projections_counts_valid",
      sql`${table.cohortSize} > 0 and ${table.activeCount} between 0 and ${table.cohortSize}
        and ${table.pausedCount} between 0 and ${table.cohortSize}
        and ${table.numerator} = ${table.activeCount}
        and ${table.denominator} = ${table.cohortSize}`
    ),
    check(
      "retention_cohort_projections_rate_quality_valid",
      sql`(${table.pausedCount} > 0 and ${table.retentionRate} is null and ${table.quality} = 'insufficient')
        or (${table.pausedCount} = 0 and ${table.retentionRate} is not null and ${table.quality} = 'complete')`
    ),
    foreignKey({
      name: "retention_cohort_projections_run_fk",
      columns: [table.organizationId, table.projectionRunId],
      foreignColumns: [
        retentionCohortProjectionRuns.organizationId,
        retentionCohortProjectionRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "retention_cohort_projections_program_fk",
      columns: [table.organizationId, table.programId],
      foreignColumns: [programs.organizationId, programs.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "retention_cohort_projections_group_fk",
      columns: [table.organizationId, table.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }).onDelete("restrict"),
  ]
);

export const dataQualityIssues = zaltyko.table(
  "data_quality_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    metricRunId: uuid("metric_run_id").notNull(),
    locationId: uuid("location_id"),
    metricKey: text("metric_key").references(() => metricDefinitions.key, {
      onDelete: "restrict",
    }),
    issueCode: text("issue_code").notNull(),
    severity: text("severity").notNull(),
    status: dataQualityIssueStatus("status").notNull().default("open"),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("data_quality_issues_open_idx").on(
      table.organizationId,
      table.status,
      table.detectedAt
    ),
    foreignKey({
      name: "data_quality_issues_run_fk",
      columns: [table.organizationId, table.metricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "data_quality_issues_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export type MetricDefinition = typeof metricDefinitions.$inferSelect;
export type MetricRun = typeof metricRuns.$inferSelect;
export type MetricRunValue = typeof metricRunValues.$inferSelect;
export type MetricValue = typeof metricValues.$inferSelect;
