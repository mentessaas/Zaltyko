import { sql } from "drizzle-orm";
import {
  check,
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

import { authUsers } from "./auth-users";
import {
  locations,
  organizationMembers,
  organizations,
  zaltyko,
} from "./zaltyko-core";
import { healthScoreSnapshots } from "./zaltyko-health-score";
import { metricRuns } from "./zaltyko-metrics";

export const insightRuleStatus = zaltyko.enum("insight_rule_status", [
  "draft",
  "active",
  "retired",
]);
export const insightSeverity = zaltyko.enum("insight_severity", [
  "info",
  "warning",
  "critical",
]);
export const insightStatus = zaltyko.enum("insight_status", [
  "open",
  "viewed",
  "actioned",
  "snoozed",
  "dismissed",
  "resolved",
]);
export const insightActionStatus = zaltyko.enum("insight_action_status", [
  "recorded",
  "completed",
  "failed",
]);
export const insightOutcome = zaltyko.enum("insight_outcome", [
  "pending",
  "positive",
  "neutral",
  "negative",
  "not_measurable",
]);
export const insightDeliveryChannel = zaltyko.enum("insight_delivery_channel", [
  "in_app",
  "email",
]);
export const insightDeliveryStatus = zaltyko.enum("insight_delivery_status", [
  "pending",
  "sent",
  "failed",
  "suppressed",
]);
export const insightRunStatus = zaltyko.enum("insight_run_status", [
  "running",
  "succeeded",
  "failed",
]);

const score = (name: string) =>
  numeric(name, { precision: 5, scale: 2, mode: "number" });
const money = (name: string) =>
  numeric(name, { precision: 20, scale: 0, mode: "number" });

export const insightRuleVersions = zaltyko.table(
  "insight_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    status: insightRuleStatus("status").notNull().default("draft"),
    severity: insightSeverity("severity").notNull(),
    cooldownHours: integer("cooldown_hours").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    defaultCtaKey: text("default_cta_key").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_rule_versions_key_version_uq").on(
      table.key,
      table.version
    ),
    check("insight_rule_versions_version_positive", sql`${table.version} > 0`),
  ]
);

export const insightRuleRuns = zaltyko.table(
  "insight_rule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    ruleVersionId: uuid("rule_version_id")
      .notNull()
      .references(() => insightRuleVersions.id, { onDelete: "restrict" }),
    status: insightRunStatus("status").notNull().default("running"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    sourceWatermark: timestamp("source_watermark", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    result: jsonb("result")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_rule_runs_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    uniqueIndex("insight_rule_runs_org_id_uq").on(
      table.organizationId,
      table.id
    ),
    foreignKey({
      name: "insight_rule_runs_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
  ]
);

export const insights = zaltyko.table(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    ruleVersionId: uuid("rule_version_id")
      .notNull()
      .references(() => insightRuleVersions.id, { onDelete: "restrict" }),
    seriesKey: text("series_key").notNull(),
    occurrence: integer("occurrence").notNull().default(1),
    status: insightStatus("status").notNull().default("open"),
    severity: insightSeverity("severity").notNull(),
    priorityScore: score("priority_score").notNull(),
    impactScore: score("impact_score").notNull(),
    urgencyScore: score("urgency_score").notNull(),
    confidenceScore: score("confidence_score").notNull(),
    actionabilityScore: score("actionability_score").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    assumptions: jsonb("assumptions").$type<unknown[]>().notNull().default([]),
    ctaKey: text("cta_key").notNull(),
    ctaPayload: jsonb("cta_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    estimatedValueMinMinor: money("estimated_value_min_minor"),
    estimatedValueMaxMinor: money("estimated_value_max_minor"),
    estimateCurrency: text("estimate_currency"),
    sourceMetricRunId: uuid("source_metric_run_id"),
    sourceHealthScoreSnapshotId: uuid("source_health_score_snapshot_id"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionReason: text("resolution_reason"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insights_series_occurrence_uq").on(
      table.organizationId,
      table.seriesKey,
      table.occurrence
    ),
    uniqueIndex("insights_org_id_uq").on(table.organizationId, table.id),
    index("insights_inbox_idx").on(
      table.organizationId,
      table.status,
      table.priorityScore,
      table.lastSeenAt
    ),
    index("insights_location_inbox_idx").on(
      table.organizationId,
      table.locationId,
      table.status,
      table.priorityScore
    ),
    foreignKey({
      name: "insights_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "insights_metric_run_fk",
      columns: [table.organizationId, table.sourceMetricRunId],
      foreignColumns: [metricRuns.organizationId, metricRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "insights_health_snapshot_fk",
      columns: [table.organizationId, table.sourceHealthScoreSnapshotId],
      foreignColumns: [
        healthScoreSnapshots.organizationId,
        healthScoreSnapshots.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const insightRunObservations = zaltyko.table(
  "insight_run_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleRunId: uuid("rule_run_id").notNull(),
    insightId: uuid("insight_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_run_observations_uq").on(
      table.ruleRunId,
      table.insightId
    ),
    foreignKey({
      name: "insight_run_observations_run_fk",
      columns: [table.organizationId, table.ruleRunId],
      foreignColumns: [insightRuleRuns.organizationId, insightRuleRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "insight_run_observations_insight_fk",
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
    }).onDelete("cascade"),
  ]
);

export const insightStatusHistory = zaltyko.table(
  "insight_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    insightId: uuid("insight_id").notNull(),
    fromStatus: insightStatus("from_status"),
    toStatus: insightStatus("to_status").notNull(),
    reasonCode: text("reason_code").notNull(),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    ruleRunId: uuid("rule_run_id"),
    idempotencyKey: text("idempotency_key"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => [
    uniqueIndex("insight_status_history_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    foreignKey({
      name: "insight_status_history_insight_fk",
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "insight_status_history_run_fk",
      columns: [table.organizationId, table.ruleRunId],
      foreignColumns: [insightRuleRuns.organizationId, insightRuleRuns.id],
    }).onDelete("restrict"),
  ]
);

export const insightActions = zaltyko.table(
  "insight_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id"),
    insightId: uuid("insight_id").notNull(),
    actionKey: text("action_key").notNull(),
    status: insightActionStatus("status").notNull().default("recorded"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    actorMemberId: uuid("actor_member_id").notNull(),
    targetEntityType: text("target_entity_type").notNull(),
    targetEntityId: uuid("target_entity_id"),
    beforeValue: jsonb("before_value")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    afterValue: jsonb("after_value").$type<Record<string, unknown> | null>(),
    evaluationEndsAt: timestamp("evaluation_ends_at", {
      withTimezone: true,
    }).notNull(),
    outcome: insightOutcome("outcome").notNull().default("pending"),
    outcomeNotes: text("outcome_notes"),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id").notNull().defaultRandom(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_actions_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey
    ),
    foreignKey({
      name: "insight_actions_insight_fk",
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "insight_actions_location_fk",
      columns: [table.organizationId, table.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "insight_actions_member_fk",
      columns: [table.organizationId, table.actorMemberId],
      foreignColumns: [
        organizationMembers.organizationId,
        organizationMembers.id,
      ],
    }).onDelete("restrict"),
  ]
);

export const insightNotifications = zaltyko.table(
  "insight_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    insightId: uuid("insight_id").notNull(),
    channel: insightDeliveryChannel("channel").notNull(),
    deliveryWindowKey: text("delivery_window_key").notNull(),
    status: insightDeliveryStatus("status").notNull().default("pending"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_notifications_dedupe_uq").on(
      table.organizationId,
      table.insightId,
      table.channel,
      table.deliveryWindowKey
    ),
    foreignKey({
      name: "insight_notifications_insight_fk",
      columns: [table.organizationId, table.insightId],
      foreignColumns: [insights.organizationId, insights.id],
    }).onDelete("cascade"),
  ]
);

export type InsightRuleVersion = typeof insightRuleVersions.$inferSelect;
export type InsightRuleRun = typeof insightRuleRuns.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type InsightAction = typeof insightActions.$inferSelect;
