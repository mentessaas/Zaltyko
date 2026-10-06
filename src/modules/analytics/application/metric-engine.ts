import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLog,
  dataQualityIssues,
  metricEventConsumptions,
  metricInvalidations,
  metricRunValues,
  metricRuns,
  metricValues,
  outboxEvents,
  type MetricRun,
  type MetricValue,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  cohortRates,
  financialTotals,
} from "@/modules/analytics/domain/metric-formulas";
import { evaluationActorSchema } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  assertOperationalAccess,
  assertSystemOperationalScope,
} from "@/modules/shared/infrastructure/operational-authorization";
import { lockCommand } from "@/modules/shared/infrastructure/transactional-records";

const FORMULA_SET_VERSION = "2026-10-v1";
const FORMULA_VERSION = 1;
const financialRoles = ["owner", "admin"] as const;
const metricSourceEventPrefixes = [
  "enrollment.",
  "sessions.",
  "attendance.",
  "waitlist.",
  "trial.",
  "invoice.",
  "charge.",
  "payment.",
  "financial.",
  "organization.bootstrapped",
] as const;

const recomputeMetricsSchema = z.object({
  organizationId: z.string().uuid(),
  authorizationLocationId: z.string().uuid(),
  targetLocationId: z.string().uuid().optional(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  sourceWatermark: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(8).max(150),
  actor: evaluationActorSchema,
});

export type RecomputeMetricsCommand = z.infer<typeof recomputeMetricsSchema>;

const consumeMetricEventSchema = z.object({
  organizationId: z.string().uuid(),
  outboxEventId: z.string().uuid(),
  handlerVersion: z.number().int().positive().default(1),
});

export type ConsumeMetricEventCommand = z.input<
  typeof consumeMetricEventSchema
>;

type MetricQuality = MetricValue["quality"];

interface ComputedMetric {
  metricKey: string;
  valueNumeric: number | null;
  currency: string | null;
  numerator: number | null;
  denominator: number | null;
  coverage: number;
  quality: MetricQuality;
  dimensions: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}

interface Scope {
  organizationId: string;
  locationId?: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  sourceWatermark: string;
}

function numberFrom(value: unknown): number {
  return Number(value ?? 0);
}

function dimensionsHash(dimensions: Record<string, unknown>): string {
  const stable = JSON.stringify(
    Object.fromEntries(
      Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b))
    )
  );
  return createHash("sha256").update(stable).digest("hex");
}

function locationPredicate(
  scope: Scope,
  alias: string
): ReturnType<typeof sql> {
  return scope.locationId
    ? sql`and ${sql.raw(`${alias}.location_id`)} = ${scope.locationId}::uuid`
    : sql``;
}

function ratioMetric(
  metricKey: string,
  numerator: number,
  denominator: number,
  options: {
    coverage?: number;
    quality?: MetricQuality;
    diagnostics?: Record<string, unknown>;
  } = {}
): ComputedMetric {
  if (denominator <= 0) {
    return {
      metricKey,
      valueNumeric: null,
      currency: null,
      numerator,
      denominator,
      coverage: options.coverage ?? 0,
      quality: "insufficient",
      dimensions: {},
      diagnostics: { reason: "zero_denominator", ...options.diagnostics },
    };
  }
  return {
    metricKey,
    valueNumeric: numerator / denominator,
    currency: null,
    numerator,
    denominator,
    coverage: options.coverage ?? 1,
    quality: options.quality ?? "complete",
    dimensions: {},
    diagnostics: options.diagnostics ?? {},
  };
}

function applyFreshness(
  metric: ComputedMetric,
  periodEnd: string,
  sourceWatermark: string,
  computedAt: Date
): ComputedMetric {
  const today = computedAt.toISOString().slice(0, 10);
  const lagSeconds = Math.max(
    0,
    (computedAt.getTime() - new Date(sourceWatermark).getTime()) / 1_000
  );
  if (
    periodEnd >= today &&
    lagSeconds > 15 * 60 &&
    (metric.quality === "complete" || metric.quality === "partial")
  ) {
    return {
      ...metric,
      quality: "stale",
      diagnostics: {
        ...metric.diagnostics,
        priorQuality: metric.quality,
        sourceLagSeconds: Math.round(lagSeconds),
        freshnessSlaSeconds: 900,
      },
    };
  }
  return metric;
}

export async function consumeMetricInvalidationEvent(
  command: ConsumeMetricEventCommand
): Promise<boolean> {
  const input = consumeMetricEventSchema.parse(command);
  const handlerKey = "metric-invalidation";
  return db.transaction(async (tx) => {
    await lockCommand(
      tx,
      input.organizationId,
      `${handlerKey}:${input.handlerVersion}:${input.outboxEventId}`
    );
    const [event] = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.organizationId, input.organizationId),
          eq(outboxEvents.id, input.outboxEventId)
        )
      )
      .limit(1);
    if (!event)
      throw new OperationalError("NOT_FOUND", "Evento no encontrado", 404);
    if (
      !metricSourceEventPrefixes.some((prefix) =>
        prefix.endsWith(".")
          ? event.eventName.startsWith(prefix)
          : event.eventName === prefix
      )
    ) {
      return false;
    }

    const inserted = await tx
      .insert(metricEventConsumptions)
      .values({
        organizationId: input.organizationId,
        outboxEventId: event.id,
        handlerKey,
        handlerVersion: input.handlerVersion,
      })
      .onConflictDoNothing()
      .returning({ id: metricEventConsumptions.id });
    if (inserted.length === 0) return false;

    const affectedTo = event.occurredAt.toISOString().slice(0, 10);
    const affectedFromDate = new Date(event.occurredAt);
    affectedFromDate.setUTCDate(affectedFromDate.getUTCDate() - 89);
    await tx.insert(metricInvalidations).values({
      organizationId: input.organizationId,
      locationId: event.locationId,
      outboxEventId: event.id,
      handlerKey,
      handlerVersion: input.handlerVersion,
      reasonEventName: event.eventName,
      affectedFrom: affectedFromDate.toISOString().slice(0, 10),
      affectedTo,
    });
    return true;
  });
}

async function computeEnrollmentMetrics(
  tx: TransactionClient,
  scope: Scope
): Promise<ComputedMetric[]> {
  const locationFilter = locationPredicate(scope, "enrollment");
  const result = await tx.execute(sql`
    with days as (
      select day::date
      from generate_series(${scope.periodStart}::date, ${scope.periodEnd}::date, interval '1 day') day
    ), active_by_day as (
      select days.day, count(distinct enrollment.athlete_id)::integer as active_count
      from days
      left join zaltyko.enrollments enrollment
        on enrollment.organization_id = ${scope.organizationId}::uuid
       and enrollment.starts_on <= days.day
       and (enrollment.ends_on is null or enrollment.ends_on >= days.day)
       ${locationFilter}
       and coalesce((
         select history.to_status
         from zaltyko.enrollment_status_history history
         where history.organization_id = enrollment.organization_id
           and history.enrollment_id = enrollment.id
           and history.effective_on <= days.day
         order by history.effective_on desc, history.changed_at desc
         limit 1
       ), enrollment.status) = 'active'
       and not exists (
         select 1 from zaltyko.enrollment_pauses pause
         where pause.organization_id = enrollment.organization_id
           and pause.enrollment_id = enrollment.id
           and pause.starts_on <= days.day
           and (pause.ends_on is null or pause.ends_on > days.day)
       )
      group by days.day
    ), start_cohort as (
      select distinct enrollment.athlete_id
      from zaltyko.enrollments enrollment
      where enrollment.organization_id = ${scope.organizationId}::uuid
        ${locationFilter}
        and enrollment.starts_on <= ${scope.periodStart}::date
        and (enrollment.ends_on is null or enrollment.ends_on >= ${scope.periodStart}::date)
        and coalesce((
          select history.to_status
          from zaltyko.enrollment_status_history history
          where history.organization_id = enrollment.organization_id
            and history.enrollment_id = enrollment.id
            and history.effective_on <= ${scope.periodStart}::date
          order by history.effective_on desc, history.changed_at desc
          limit 1
        ), enrollment.status) = 'active'
    ), retained as (
      select distinct cohort.athlete_id
      from start_cohort cohort
      where exists (
        select 1
        from zaltyko.enrollments enrollment
        where enrollment.organization_id = ${scope.organizationId}::uuid
          ${locationFilter}
          and enrollment.athlete_id = cohort.athlete_id
          and enrollment.starts_on <= ${scope.periodEnd}::date
          and (enrollment.ends_on is null or enrollment.ends_on >= ${scope.periodEnd}::date)
          and coalesce((
            select history.to_status
            from zaltyko.enrollment_status_history history
            where history.organization_id = enrollment.organization_id
              and history.enrollment_id = enrollment.id
              and history.effective_on <= ${scope.periodEnd}::date
            order by history.effective_on desc, history.changed_at desc
            limit 1
          ), enrollment.status) = 'active'
      )
    )
    select
      coalesce((select active_count from active_by_day where day = ${scope.periodEnd}::date), 0)::integer as ending_active,
      coalesce((select avg(active_count) from active_by_day), 0)::numeric as average_active,
      (select count(*) from start_cohort)::integer as starting_cohort,
      (select count(*) from retained)::integer as retained_count
  `);
  const row = result.rows[0];
  const ending = numberFrom(row?.ending_active);
  const average = numberFrom(row?.average_active);
  const starting = numberFrom(row?.starting_cohort);
  const retained = numberFrom(row?.retained_count);
  const cohort = cohortRates(starting, retained);

  return [
    {
      metricKey: "active_athletes_count",
      valueNumeric: ending,
      currency: null,
      numerator: ending,
      denominator: null,
      coverage: 1,
      quality: "complete",
      dimensions: { measure: "period_end" },
      diagnostics: {},
    },
    {
      metricKey: "active_athletes_average",
      valueNumeric: average,
      currency: null,
      numerator: null,
      denominator: null,
      coverage: 1,
      quality: "complete",
      dimensions: { measure: "daily_average" },
      diagnostics: {},
    },
    ratioMetric("cohort_retention_rate", retained, starting, {
      diagnostics: { transfer_policy: "organization_continuity" },
    }),
    ratioMetric("churn_rate", cohort.lost, starting, {
      diagnostics: { transfer_policy: "organization_continuity" },
    }),
  ];
}

async function computeSessionMetrics(
  tx: TransactionClient,
  scope: Scope
): Promise<ComputedMetric[]> {
  const sessionLocation = locationPredicate(scope, "session");
  const enrollmentLocation = locationPredicate(scope, "enrollment");
  const result = await tx.execute(sql`
    with eligible_sessions as (
      select
        session.id,
        session.organization_id,
        session.location_id,
        session.class_template_id,
        session.status,
        (session.starts_at at time zone location.timezone)::date as local_date,
        least(
          template.capacity,
          coalesce(session.capacity_override, template.capacity),
          coalesce(space.capacity, template.capacity)
        )::integer as effective_capacity
      from zaltyko.sessions session
      join zaltyko.locations location
        on location.organization_id = session.organization_id and location.id = session.location_id
      join zaltyko.class_templates template
        on template.organization_id = session.organization_id and template.id = session.class_template_id
      left join zaltyko.spaces space
        on space.organization_id = session.organization_id
       and space.id = coalesce(session.space_id, template.default_space_id)
      where session.organization_id = ${scope.organizationId}::uuid
        ${sessionLocation}
        and session.status <> 'cancelled'
        and (session.starts_at at time zone location.timezone)::date
          between ${scope.periodStart}::date and ${scope.periodEnd}::date
    ), session_occupancy as (
      select
        session.id,
        session.status,
        session.effective_capacity,
        count(distinct enrollment.athlete_id)::integer as occupied
      from eligible_sessions session
      left join zaltyko.enrollments enrollment
        on enrollment.organization_id = session.organization_id
       and enrollment.location_id = session.location_id
       and enrollment.class_template_id = session.class_template_id
       ${enrollmentLocation}
       and enrollment.starts_on <= session.local_date
       and (enrollment.ends_on is null or enrollment.ends_on >= session.local_date)
       and coalesce((
         select history.to_status
         from zaltyko.enrollment_status_history history
         where history.organization_id = enrollment.organization_id
           and history.enrollment_id = enrollment.id
           and history.effective_on <= session.local_date
         order by history.effective_on desc, history.changed_at desc
         limit 1
       ), enrollment.status) = 'active'
      group by session.id, session.status, session.effective_capacity
    ), attendance as (
      select
        (select count(record.id)
         from zaltyko.attendance_records record
         join session_occupancy occupancy on occupancy.id = record.session_id
         where record.organization_id = ${scope.organizationId}::uuid
           and occupancy.status = 'completed')::integer as recorded,
        (select count(record.id)
         from zaltyko.attendance_records record
         join session_occupancy occupancy on occupancy.id = record.session_id
         where record.organization_id = ${scope.organizationId}::uuid
           and occupancy.status = 'completed'
           and record.status in ('present', 'late'))::integer as attended,
        coalesce((select sum(occupied) from session_occupancy where status = 'completed'), 0)::integer as expected
    )
    select
      count(*)::integer as eligible_sessions,
      count(*) filter (where effective_capacity > 0)::integer as valid_sessions,
      coalesce(sum(occupied) filter (where effective_capacity > 0), 0)::integer as occupied,
      coalesce(sum(effective_capacity) filter (where effective_capacity > 0), 0)::integer as capacity,
      (select recorded from attendance)::integer as attendance_recorded,
      (select attended from attendance)::integer as attendance_attended,
      (select expected from attendance)::integer as attendance_expected
    from session_occupancy
  `);
  const row = result.rows[0];
  const eligibleSessions = numberFrom(row?.eligible_sessions);
  const validSessions = numberFrom(row?.valid_sessions);
  const occupied = numberFrom(row?.occupied);
  const capacity = numberFrom(row?.capacity);
  const recorded = numberFrom(row?.attendance_recorded);
  const attended = numberFrom(row?.attendance_attended);
  const expected = numberFrom(row?.attendance_expected);
  const fillCoverage =
    eligibleSessions > 0 ? validSessions / eligibleSessions : 0;
  const fillQuality: MetricQuality =
    eligibleSessions === 0
      ? "insufficient"
      : validSessions === 0
        ? "invalid"
        : fillCoverage < 1
          ? "partial"
          : "complete";
  const fill =
    capacity > 0
      ? ratioMetric("class_fill_rate", occupied, capacity, {
          coverage: fillCoverage,
          quality: fillQuality,
          diagnostics: { eligibleSessions, validSessions },
        })
      : {
          ...ratioMetric("class_fill_rate", occupied, 0, {
            coverage: fillCoverage,
            diagnostics: { eligibleSessions, validSessions },
          }),
          quality: fillQuality,
        };
  const attendanceCoverage =
    expected > 0 ? Math.min(recorded / expected, 1) : 0;

  return [
    fill,
    ratioMetric("attendance_rate", attended, recorded, {
      coverage: attendanceCoverage,
      quality: recorded > 0 && attendanceCoverage < 1 ? "partial" : undefined,
    }),
    ratioMetric("attendance_coverage", recorded, expected, {
      coverage: attendanceCoverage,
      diagnostics: { cappedAtOne: recorded > expected },
    }),
  ];
}

async function computeFinancialMetrics(
  tx: TransactionClient,
  scope: Scope
): Promise<ComputedMetric[]> {
  const chargeLocation = locationPredicate(scope, "charge");
  const result = await tx.execute(sql`
    with period_charges as (
      select id, amount_cents, due_at
      from zaltyko.charges charge
      where charge.organization_id = ${scope.organizationId}::uuid
        ${chargeLocation}
        and charge.currency = ${scope.currency}
        and charge.service_period_start between ${scope.periodStart}::date and ${scope.periodEnd}::date
        and charge.status <> 'void'
    ), allocations as (
      select allocation.id, allocation.charge_id, allocation.amount_cents
      from zaltyko.payment_allocations allocation
      join period_charges charge on charge.id = allocation.charge_id
      where allocation.organization_id = ${scope.organizationId}::uuid
        and allocation.allocated_at <= ${scope.sourceWatermark}::timestamptz
    ), succeeded_refunds as (
      select refund.amount_cents, allocation.charge_id
      from zaltyko.refunds refund
      join allocations allocation on allocation.id = refund.payment_allocation_id
      where refund.organization_id = ${scope.organizationId}::uuid
        and refund.status = 'succeeded'
        and refund.refunded_at <= ${scope.sourceWatermark}::timestamptz
    )
    select
      coalesce((select sum(amount_cents) from period_charges), 0)::bigint as expected,
      coalesce((select sum(amount_cents) from allocations), 0)::bigint as allocated,
      coalesce((select sum(amount_cents) from succeeded_refunds), 0)::bigint as refunded,
      coalesce((select sum(amount_cents) from period_charges where due_at < ${scope.sourceWatermark}::timestamptz), 0)::bigint as due_expected,
      coalesce((select sum(allocation.amount_cents) from allocations allocation join period_charges charge on charge.id = allocation.charge_id where charge.due_at < ${scope.sourceWatermark}::timestamptz), 0)::bigint as due_allocated,
      coalesce((select sum(refund.amount_cents) from succeeded_refunds refund join period_charges charge on charge.id = refund.charge_id where charge.due_at < ${scope.sourceWatermark}::timestamptz), 0)::bigint as due_refunded
  `);
  const row = result.rows[0];
  const expected = numberFrom(row?.expected);
  const allocated = numberFrom(row?.allocated);
  const refunded = numberFrom(row?.refunded);
  const dueExpected = numberFrom(row?.due_expected);
  const dueNet = numberFrom(row?.due_allocated) - numberFrom(row?.due_refunded);
  const totals = financialTotals({
    expectedCents: expected,
    allocatedCents: allocated,
    refundedCents: refunded,
  });

  const currencyMetric = (
    metricKey: string,
    value: number
  ): ComputedMetric => ({
    metricKey,
    valueNumeric: value,
    currency: scope.currency,
    numerator: value,
    denominator: null,
    coverage: 1,
    quality: "complete",
    dimensions: {},
    diagnostics: {},
  });

  return [
    currencyMetric("recognized_revenue_minor", expected),
    currencyMetric("net_collected_minor", totals.netCollectedCents),
    currencyMetric("outstanding_minor", totals.outstandingCents),
    {
      ...ratioMetric("collection_rate", dueNet, dueExpected),
      currency: scope.currency,
      diagnostics: { denominatorPolicy: "charges_due_before_watermark" },
    },
  ];
}

async function computeWaitlistMetric(
  tx: TransactionClient,
  scope: Scope
): Promise<ComputedMetric> {
  const locationFilter = locationPredicate(scope, "entry");
  const result = await tx.execute(sql`
    select count(*)::integer as eligible
    from zaltyko.waitlist_entries entry
    where entry.organization_id = ${scope.organizationId}::uuid
      ${locationFilter}
      and entry.status = 'waiting'
      and entry.contactable
      and entry.contact_consent_status = 'granted'
      and entry.joined_at <= ${scope.sourceWatermark}::timestamptz
  `);
  const eligible = numberFrom(result.rows[0]?.eligible);
  return {
    metricKey: "waitlist_opportunity_count",
    valueNumeric: eligible,
    currency: null,
    numerator: eligible,
    denominator: null,
    coverage: 1,
    quality: "complete",
    dimensions: {},
    diagnostics: { guarantee: "none" },
  };
}

async function persistMetric(
  tx: TransactionClient,
  run: MetricRun,
  metric: ComputedMetric,
  computedAt: Date
): Promise<void> {
  const dimensionsSha256 = dimensionsHash(metric.dimensions);
  const common = {
    organizationId: run.organizationId,
    metricRunId: run.id,
    locationId: (run.parameters.targetLocationId as string | undefined) ?? null,
    metricKey: metric.metricKey,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    valueNumeric: metric.valueNumeric,
    currency: metric.currency,
    numerator: metric.numerator,
    denominator: metric.denominator,
    coverage: metric.coverage,
    quality: metric.quality,
    dimensions: metric.dimensions,
    dimensionsSha256,
    formulaVersion: FORMULA_VERSION,
    computedAt,
    sourceWatermark: run.sourceWatermark,
    diagnostics: metric.diagnostics,
  };
  await tx.insert(metricRunValues).values(common);

  const locationCondition = common.locationId
    ? eq(metricValues.locationId, common.locationId)
    : isNull(metricValues.locationId);
  const currencyCondition = common.currency
    ? eq(metricValues.currency, common.currency)
    : isNull(metricValues.currency);
  const [current] = await tx
    .select({ id: metricValues.id })
    .from(metricValues)
    .where(
      and(
        eq(metricValues.organizationId, run.organizationId),
        locationCondition,
        eq(metricValues.metricKey, common.metricKey),
        eq(metricValues.periodStart, common.periodStart),
        eq(metricValues.periodEnd, common.periodEnd),
        eq(metricValues.dimensionsSha256, dimensionsSha256),
        eq(metricValues.formulaVersion, FORMULA_VERSION),
        currencyCondition
      )
    )
    .limit(1);
  if (current) {
    await tx
      .update(metricValues)
      .set({ ...common, updatedAt: computedAt })
      .where(eq(metricValues.id, current.id));
  } else {
    await tx.insert(metricValues).values(common);
  }

  if (metric.quality === "partial" || metric.quality === "invalid") {
    await tx.insert(dataQualityIssues).values({
      organizationId: run.organizationId,
      metricRunId: run.id,
      locationId: common.locationId,
      metricKey: metric.metricKey,
      issueCode:
        metric.quality === "invalid" ? "METRIC_INVALID" : "METRIC_PARTIAL",
      severity: metric.quality === "invalid" ? "error" : "warning",
      evidence: { coverage: metric.coverage, ...metric.diagnostics },
    });
  }
}

export async function recomputeMetrics(
  command: RecomputeMetricsCommand
): Promise<MetricRun> {
  const input = recomputeMetricsSchema.parse(command);
  if (input.periodEnd < input.periodStart) {
    throw new OperationalError(
      "INVALID_DATE_RANGE",
      "Periodo de métricas inválido",
      422
    );
  }

  const run = await db.transaction(async (tx) => {
    await lockCommand(tx, input.organizationId, input.idempotencyKey);
    if ("type" in input.actor) {
      await assertSystemOperationalScope(tx, {
        organizationId: input.organizationId,
        locationId: input.authorizationLocationId,
        actor: input.actor,
      });
    } else {
      await assertOperationalAccess(tx, {
        organizationId: input.organizationId,
        locationId: input.authorizationLocationId,
        actor: input.actor,
        allowedRoles: financialRoles,
      });
    }
    if (input.targetLocationId) {
      if ("type" in input.actor) {
        await assertSystemOperationalScope(tx, {
          organizationId: input.organizationId,
          locationId: input.targetLocationId,
          actor: input.actor,
        });
      } else {
        await assertOperationalAccess(tx, {
          organizationId: input.organizationId,
          locationId: input.targetLocationId,
          actor: input.actor,
          allowedRoles: financialRoles,
        });
      }
    }
    const [prior] = await tx
      .select()
      .from(metricRuns)
      .where(
        and(
          eq(metricRuns.organizationId, input.organizationId),
          eq(metricRuns.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (prior) return prior;

    const [created] = await tx
      .insert(metricRuns)
      .values({
        organizationId: input.organizationId,
        authorizationLocationId: input.authorizationLocationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency,
        formulaSetVersion: FORMULA_SET_VERSION,
        status: "running",
        parameters: { targetLocationId: input.targetLocationId ?? null },
        sourceWatermark: new Date(input.sourceWatermark),
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    return created;
  });
  if (run.status !== "running") return run;

  const scope: Scope = {
    organizationId: input.organizationId,
    locationId: input.targetLocationId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
    sourceWatermark: input.sourceWatermark,
  };

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`metrics:${input.organizationId}:${input.targetLocationId ?? "all"}:${input.periodStart}:${input.periodEnd}:${FORMULA_SET_VERSION}`}, 0))`
      );
      const enrollmentMetrics = await computeEnrollmentMetrics(tx, scope);
      const sessionMetrics = await computeSessionMetrics(tx, scope);
      const financialMetrics = await computeFinancialMetrics(tx, scope);
      const waitlistMetric = await computeWaitlistMetric(tx, scope);
      const rawMetrics = [
        ...enrollmentMetrics,
        ...sessionMetrics,
        ...financialMetrics,
        waitlistMetric,
      ];
      const computedAt = new Date();
      const metrics = rawMetrics.map((metric) =>
        applyFreshness(
          metric,
          input.periodEnd,
          input.sourceWatermark,
          computedAt
        )
      );
      for (const metric of metrics)
        await persistMetric(tx, run, metric, computedAt);
      const [completed] = await tx
        .update(metricRuns)
        .set({ status: "succeeded", completedAt: computedAt })
        .where(eq(metricRuns.id, run.id))
        .returning();
      await tx.execute(sql`
        update zaltyko.metric_invalidations
        set status = 'processed', processed_at = ${computedAt}
        where organization_id = ${input.organizationId}::uuid
          and status = 'pending'
          and affected_from <= ${input.periodEnd}::date
          and affected_to >= ${input.periodStart}::date
          and (
            ${input.targetLocationId ?? null}::uuid is null
            or location_id is null
            or location_id = ${input.targetLocationId ?? null}::uuid
          )
      `);
      await tx.insert(auditLog).values({
        organizationId: input.organizationId,
        locationId: input.targetLocationId ?? null,
        actorUserId: "type" in input.actor ? null : input.actor.userId,
        action: "metrics.recomputed",
        targetType: "metric_run",
        targetId: run.id,
        idempotencyKey: input.idempotencyKey,
        after: {
          formulaSetVersion: FORMULA_SET_VERSION,
          metricCount: metrics.length,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
        metadata:
          "type" in input.actor
            ? {
                actor_type: "system",
                job_key: input.actor.jobKey,
                correlation_id: input.actor.correlationId,
              }
            : { actor_type: "user" },
      });
      return completed;
    });
  } catch (error) {
    await db
      .update(metricRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorCode: "METRIC_COMPUTATION_FAILED",
        errorDetail:
          error instanceof Error ? error.message.slice(0, 500) : "unknown",
      })
      .where(eq(metricRuns.id, run.id));
    throw error;
  }
}
